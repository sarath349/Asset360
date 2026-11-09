import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { connectDb, getDbMode } from './db.js';
import { createApp } from './app.js';
import { ensureSeed } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = Number(process.env.PORT) || 5050;

/**
 * Start Asset360 API.
 * Desktop (Electron): embedded: true + dataDir + staticDir → single self-contained app.
 * Server mode: MongoDB via MONGODB_URI (default), no staticDir.
 */
export async function startServer(options = {}) {
  const {
    host = '127.0.0.1',
    port = DEFAULT_PORT,
    embedded = false,
    dataDir,
    staticDir,
    uploadsDir,
  } = options;

  await connectDb({ embedded, dataDir });
  const seed = await ensureSeed();
  if (seed.created) console.log('First run: seeded admin / 123');

  const app = createApp({ staticDir, uploadsDir });

  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const bound = server.address().port;
      console.log(`Asset360 API (${getDbMode()}) http://${host}:${bound}`);
      resolve({ app, server, port: bound, host });
    });
    server.on('error', reject);
  });
}

const thisFile = pathToFileURL(path.resolve(process.argv[1] || '')).href;
if (import.meta.url === thisFile) {
  const embedded = process.env.ASSET360_EMBEDDED === '1';
  startServer({
    port: DEFAULT_PORT,
    embedded,
    dataDir: process.env.DATA_DIR,
  }).catch((err) => {
    console.error('Failed to start API:', err);
    process.exit(1);
  });
}
