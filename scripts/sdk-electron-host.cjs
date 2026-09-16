const { app, BrowserWindow } = require('electron')
app.whenReady().then(() => { const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: false, nodeIntegration: false } }); win.loadURL('about:blank') })
