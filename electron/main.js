const { app, BrowserWindow } = require("electron");
const path = require("path");

function createWindow(){
  const win = new BrowserWindow({
    width: 1200, height: 800,
    webPreferences: { contextIsolation: true }
  });
  const start = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, "../dist/index.html")}`;
  win.loadURL(start);
}
app.whenReady().then(createWindow);
app.on("window-all-closed", ()=>{ if (process.platform !== "darwin") app.quit(); });
app.on("activate", ()=>{ if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
