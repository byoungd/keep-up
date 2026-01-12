import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, app, shell } from "electron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;
const defaultUrl = "http://localhost:3000/en/app";
const appUrl = process.env.READER_DESKTOP_URL ?? defaultUrl;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }

    return { action: "deny" };
  });

  if (isDev) {
    win.webContents.on("did-fail-load", () => {
      setTimeout(() => win.loadURL(appUrl), 1000);
    });
  }

  win.loadURL(appUrl);
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
