// contextIsolation açık olduğu için renderer'a (React tarafı) sadece bu köprü üzerinden,
// dar ve kontrollü bir API yüzeyi sunulur — nodeIntegration açmak yerine.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("varlikTakipDesktop", {
  pickFolder: () => ipcRenderer.invoke("pick-folder"),
});
