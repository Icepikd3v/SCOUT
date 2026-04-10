import { spawn } from 'node:child_process';

const port = process.env.PORT || '8787';
const healthUrl = `http://127.0.0.1:${port}/health`;

const runtime = spawn(process.execPath, ['apps/runtime/server.js'], {
  stdio: 'inherit',
  env: { ...process.env, PORT: port },
});

let quitting = false;

const stopRuntime = () => {
  if (!quitting) {
    quitting = true;
    if (!runtime.killed) {
      runtime.kill('SIGTERM');
    }
  }
};

process.on('SIGINT', stopRuntime);
process.on('SIGTERM', stopRuntime);

runtime.on('exit', (code) => {
  if (!quitting) {
    process.exit(code ?? 0);
  }
});

await waitForHealth(healthUrl, 15000);

const electronBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const shell = spawn(electronBin, ['electron', 'apps/shell/main.cjs'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: port,
    SCOUT_FACE_URL: `http://127.0.0.1:${port}/?kiosk=1&face=1`,
  },
});

shell.on('exit', (code) => {
  stopRuntime();
  process.exit(code ?? 0);
});

async function waitForHealth(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // continue polling
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Runtime failed health check at ${url}`);
}
