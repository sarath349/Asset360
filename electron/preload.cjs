const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('asset360Desktop', {
  isDesktop: true,
});
