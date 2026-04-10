const path = require('node:path');
const { app, BrowserWindow, session, ipcMain } = require('electron');

const PORT = process.env.PORT || '8787';
const RAW_URL = process.env.SCOUT_FACE_URL || `http://127.0.0.1:${PORT}/?kiosk=1&face=1`;
const FACE_URL = ensureFaceOnlyUrl(RAW_URL);

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    frame: false,
    fullscreen: true,
    kiosk: true,
    autoHideMenuBar: true,
    backgroundColor: '#090519',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow.loadURL(FACE_URL);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function ensureFaceOnlyUrl(input) {
  try {
    const u = new URL(input);
    u.searchParams.set('kiosk', '1');
    u.searchParams.set('face', '1');
    return u.toString();
  } catch {
    return `http://127.0.0.1:${PORT}/?kiosk=1&face=1`;
  }
}

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-speech-dispatcher');

function allowMediaPermissions() {
  const ses = session.defaultSession;
  if (!ses) return;

  const isMediaPermission = (permission) =>
    permission === 'media' || permission === 'microphone' || permission === 'camera';

  if (typeof ses.setPermissionCheckHandler === 'function') {
    ses.setPermissionCheckHandler((_, permission) => {
      if (isMediaPermission(permission)) return true;
      return false;
    });
  }

  ses.setPermissionRequestHandler((_, permission, callback) => {
    if (isMediaPermission(permission)) {
      callback(true);
      return;
    }
    callback(false);
  });

  if (typeof ses.setDevicePermissionHandler === 'function') {
    ses.setDevicePermissionHandler((details) => {
      if (!details || !details.deviceType) return false;
      return details.deviceType === 'audioCapture' || details.deviceType === 'videoCapture';
    });
  }
}

app.whenReady().then(() => {
  allowMediaPermissions();
  ipcMain.handle('scout-shell-exit', () => {
    app.quit();
    return { ok: true };
  });
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
