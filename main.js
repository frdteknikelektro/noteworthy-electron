const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { initMain: initAudioLoopback } = require('electron-audio-loopback');
const path = require('node:path');
const fs = require('node:fs');
const dotenv = require('dotenv');

const envPath = path.join(app.getAppPath ? app.getAppPath() : __dirname, '.env');
dotenv.config({ path: envPath });

const INVALID_NAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;

function sanitizeNameSegment(value, fallback = "session") {
  const raw = String(value || fallback).trim();
  if (!raw) return fallback;
  const cleaned = raw
    .replace(/\.\.+/g, "-")
    .replace(INVALID_NAME_CHARS, "-")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.substring(0, 120) || fallback;
}

function sanitizeDirectoryName(value) {
  return sanitizeNameSegment(value, "session");
}

function sanitizeFileName(value) {
  const raw = String(value || "recording.mp3").trim();
  if (!raw) return "recording.mp3";
  const dotIndex = raw.lastIndexOf(".");
  const base = dotIndex > 0 ? raw.slice(0, dotIndex) : raw;
  const extension = dotIndex > 0 ? raw.slice(dotIndex) : ".mp3";
  const sanitizedBase = sanitizeNameSegment(base, "recording");
  const sanitizedExtension = extension.replace(INVALID_NAME_CHARS, "-") || ".mp3";
  return `${sanitizedBase}${sanitizedExtension}`;
}

initAudioLoopback();

ipcMain.handle('save-recording', async (_event, payload) => {
  const { directoryName, fileName, mp3Buffer } = payload || {};
  if (!directoryName || !fileName || !mp3Buffer) {
    throw new Error('Missing recording payload');
  }
  const documentsPath = app.getPath('documents');
  const baseDir = path.join(documentsPath, 'Noteworthy');
  const sessionDir = path.join(baseDir, sanitizeDirectoryName(directoryName));
  await fs.promises.mkdir(sessionDir, { recursive: true });
  const safeFileName = sanitizeFileName(fileName);
  const filePath = path.join(sessionDir, safeFileName);
  await fs.promises.writeFile(filePath, Buffer.from(mp3Buffer));
  return { filePath, directoryPath: sessionDir };
});

ipcMain.handle('reveal-recording-directory', async (_event, directoryPath) => {
  if (!directoryPath) {
    return false;
  }
  try {
    await shell.openPath(directoryPath);
    return true;
  } catch (error) {
    console.error('Unable to open recording directory:', error);
    return false;
  }
});

ipcMain.handle('check-recording-file', async (_event, filePath) => {
  if (!filePath) {
    return false;
  }
  try {
    await fs.promises.access(path.resolve(filePath), fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('delete-recording-file', async (_event, filePath) => {
  if (!filePath) {
    return false;
  }
  try {
    await fs.promises.unlink(path.resolve(filePath));
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }
    console.error('Unable to delete recording file:', error);
    return false;
  }
});

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 680,
    title: 'Noteworthy — Automatic Notes',
    backgroundColor: '#f5f5f3',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false,
      nodeIntegrationInWorker: true
    }
  })

  mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'))
}

app.setName('Noteworthy');

app.whenReady().then(() => {
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})
