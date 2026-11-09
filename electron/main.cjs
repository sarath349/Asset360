const { app, BrowserWindow, shell, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const Module = require('node:module');

let mainWindow = null;
let apiServer = null;

function serverRoot() {
  return app.isPackaged ? path.join(process.resourcesPath, 'server') : path.join(__dirname, '..', 'server');
}

function distDir() {
  return path.join(__dirname, '..', 'dist');
}

function addModulePath(p) {
  if (!fs.existsSync(p)) return;
  const paths = Module.globalPaths;
  if (!paths.includes(p)) paths.push(p);
  if (!module.paths.includes(p)) module.paths.unshift(p);
  // Also help ESM resolution via NODE_PATH
  const current = process.env.NODE_PATH ? process.env.NODE_PATH.split(path.delimiter) : [];
  if (!current.includes(p)) {
    process.env.NODE_PATH = [p, ...current].join(path.delimiter);
    Module._initPaths();
  }
}

async function startEmbeddedBackend() {
  const dataDir = path.join(app.getPath('userData'), 'data');
  const uploadsDir = path.join(app.getPath('userData'), 'uploads');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });

  const root = serverRoot();
  addModulePath(path.join(root, 'node_modules'));
  addModulePath(path.join(__dirname, '..', 'node_modules'));

  const entry = path.join(root, 'src', 'index.js');
  if (!fs.existsSync(entry)) {
    throw new Error(`Server entry not found: ${entry}`);
  }

  const { startServer } = await import(pathToFileURL(entry).href);
  const started = await startServer({
    host: '127.0.0.1',
    port: 0,
    embedded: true,
    dataDir,
    uploadsDir,
    staticDir: distDir(),
  });
  apiServer = started.server;
  return started.port;
}

async function createWindow() {
  let port;
  try {
    port = await startEmbeddedBackend();
  } catch (err) {
    console.error(err);
    dialog.showErrorBox('Asset360 failed to start', String(err?.stack || err?.message || err));
    app.quit();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'Asset360',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await mainWindow.loadURL(`http://127.0.0.1:${port}/`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(createWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('window-all-closed', () => {
    if (apiServer) {
      apiServer.close();
      apiServer = null;
    }
    if (process.platform !== 'darwin') app.quit();
  });
}
