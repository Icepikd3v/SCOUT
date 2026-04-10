const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('scoutShell', {
  isShell: true,
  exitApp: async () => {
    try {
      await ipcRenderer.invoke('scout-shell-exit');
      return true;
    } catch {
      return false;
    }
  },
});

