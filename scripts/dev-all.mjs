// Starts the local API (server/) and the Vite dev server together, pointing the UI at the local API.
// Use this only when you want to run against the local server instead of the cloud AssetAPI.
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiPort = Number(process.env.PORT) || 5050;

const portInUse = (port) =>
  new Promise((resolve) => {
    const s = net.createConnection({ host: '127.0.0.1', port });
    s.once('connect', () => (s.destroy(), resolve(true)));
    s.once('error', () => resolve(false));
  });

const children = [];
const run = (cmd, args, cwd, name) => {
  const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32', env: process.env });
  child.on('exit', (code) => console.log(`[${name}] exited (${code ?? 'signal'})`));
  children.push(child);
  return child;
};

if (await portInUse(apiPort)) {
  console.log(`[api] already running on ${apiPort}, reusing it`);
} else {
  run('node', ['--watch', 'src/index.js'], path.join(root, 'server'), 'api');
  // Give the API a moment so the first page load does not hit ECONNREFUSED.
  for (let i = 0; i < 40 && !(await portInUse(apiPort)); i++) await new Promise((r) => setTimeout(r, 250));
}
process.env.VITE_API_TARGET = process.env.VITE_API_TARGET || `http://127.0.0.1:${apiPort}`;
run('npx', ['vite'], root, 'web');

const stop = () => {
  for (const c of children) c.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
