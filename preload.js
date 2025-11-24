const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  enableLoopbackAudio: () => ipcRenderer.invoke('enable-loopback-audio'),
  disableLoopbackAudio: () => ipcRenderer.invoke('disable-loopback-audio'),
  saveRecording: recording => ipcRenderer.invoke('save-recording', recording),
  revealRecordingDirectory: directoryPath =>
    ipcRenderer.invoke('reveal-recording-directory', directoryPath),
  checkRecordingFile: filePath => ipcRenderer.invoke('check-recording-file', filePath),
  deleteRecordingFile: filePath => ipcRenderer.invoke('delete-recording-file', filePath),
  apiKey: process.env.OPENAI_KEY
});
