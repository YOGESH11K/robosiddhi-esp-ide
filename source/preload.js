/**
 * RoboSiddhi preload — secure bridge between renderer and main process.
 * Renderer has NO Node access (nodeIntegration:false, contextIsolation:true).
 * All privileged ops go through validated ipcRenderer.invoke channels.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('RoboSiddhi', {
  // COM port enumeration
  ports: () => ipcRenderer.invoke('rs-ports'),
  // Firmware sketch + build pipeline
  writeSketch: (code) => ipcRenderer.invoke('rs-write-sketch', code),
  compile: (args) => ipcRenderer.invoke('rs-compile', args),
  upload: (args) => ipcRenderer.invoke('rs-upload', args),
  // Arduino-CLI maintenance: op in {update-index, board-list, core-install, lib-search, lib-install, clean-cache}
  cli: (op, arg) => ipcRenderer.invoke('rs-cli', { op, arg }),
  // Open tool windows: serial | hackcable | factory | html
  openTool: (tool, lang) => ipcRenderer.send('rs-open-tool', { tool, lang }),
  // Serial monitor (streaming via events)
  monitor: {
    open: (port, baud) => ipcRenderer.invoke('rs-mon-open', { port, baud }),
    close: () => ipcRenderer.invoke('rs-mon-close'),
    write: (data) => ipcRenderer.send('rs-mon-write', String(data)),
    onData: (cb) => ipcRenderer.on('rs-mon-data', (_e, line) => { try { cb(line); } catch (e) {} }),
    onEvent: (cb) => ipcRenderer.on('rs-mon-event', (_e, msg) => { try { cb(msg); } catch (e) {} })
  },
  // Save CSV / text via system dialog
  saveText: (text, defaultName) => ipcRenderer.invoke('rs-save-text', { text, defaultName })
});
