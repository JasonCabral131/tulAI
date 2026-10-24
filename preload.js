const { contextBridge, ipcRenderer, webUtils, webFrame } = require('electron');
contextBridge.exposeInMainWorld('gc', {
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  pathForFile: (f) => webUtils.getPathForFile(f),
  reveal: (p) => ipcRenderer.invoke('reveal', p),
  openView: (id) => ipcRenderer.invoke('view:open', id), revealView: (id) => ipcRenderer.invoke('view:reveal', id), openFile: (n) => ipcRenderer.invoke('file:open', n), revealFile: (n) => ipcRenderer.invoke('file:reveal', n), openUrl: (u) => ipcRenderer.invoke('url:open', u),
  focus: () => ipcRenderer.invoke('focus'),
  botMenu: () => ipcRenderer.invoke('bot:menu'),
  badge: (n) => ipcRenderer.invoke('badge', n),
  setRunning: (n) => ipcRenderer.invoke('running', n),
  getPrefs: () => ipcRenderer.invoke('prefs:get'),
  setPrefs: (p) => ipcRenderer.invoke('prefs:set', p),
  browser: { available: true, bounds: (r) => { const z = webFrame.getZoomFactor(); return ipcRenderer.invoke('browser:bounds', { x: r.x * z, y: r.y * z, width: r.width * z, height: r.height * z, visible: r.visible }); }, cmd: (c) => ipcRenderer.invoke('browser:cmd', c), onState: (cb) => ipcRenderer.on('browser:state', (_e, s) => cb(s)), onOpen: (cb) => ipcRenderer.on('browser:open', () => cb()) },
  bot: { expand: (v) => ipcRenderer.invoke('bot:expand', v), size: (l) => ipcRenderer.invoke('bot:size', l), dragStart: () => ipcRenderer.invoke('bot:dragstart'), dragMove: (x, y) => ipcRenderer.send('bot:dragmove', x, y), dragEnd: () => ipcRenderer.send('bot:dragend') },
  computer: { status: () => ipcRenderer.invoke('computer:status'), request: (w) => ipcRenderer.invoke('computer:request', w) },
  voice: { once: () => ipcRenderer.invoke('voice:once'), stop: () => ipcRenderer.invoke('voice:stop'), speak: (t) => ipcRenderer.invoke('voice:speak', t), stopSpeaking: () => ipcRenderer.invoke('voice:stopspeaking'), arm: () => ipcRenderer.invoke('voice:arm'), ding: () => ipcRenderer.invoke('voice:ding'), status: () => ipcRenderer.invoke('voice:status'), locales: () => ipcRenderer.invoke('voice:locales'), voices: () => ipcRenderer.invoke('voice:voices'), onEvent: (cb) => ipcRenderer.on('voice:event', (_e, ev) => cb(ev)) },
  onMenu: (cb) => ipcRenderer.on('menu', (_e, action) => cb(action)),
});
