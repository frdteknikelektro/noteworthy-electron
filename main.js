const { app, BrowserWindow } = require('electron')
const { initMain: initAudioLoopback } = require('electron-audio-loopback');
const path = require('node:path')
const dotenv = require('dotenv');

const envPath = path.join(app.getAppPath ? app.getAppPath() : __dirname, '.env');
dotenv.config({ path: envPath });

initAudioLoopback();

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
      webSecurity: false
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
