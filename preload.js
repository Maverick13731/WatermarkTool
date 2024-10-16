// preload.js

const { contextBridge, ipcRenderer } = require('electron');

// 在預加載腳本中，將需要的API暴露給渲染進程
contextBridge.exposeInMainWorld('electronAPI', {
    // 上傳圖片
    uploadImages: (filePaths) => ipcRenderer.invoke('upload-images', filePaths),

    // 上傳浮水印Logo
    uploadWatermarkLogo: (filePath) => ipcRenderer.invoke('upload-watermark-logo', filePath),

    // 輸出圖片
    exportImages: (imagesData) => ipcRenderer.invoke('export-images', imagesData),

    // 監聽主進程的消息（例如進度更新）
    onProgressUpdate: (callback) => ipcRenderer.on('progress-update', callback),

    // 其他需要與主進程交互的API
    // 更新浮水印設置
    updateWatermarkSettings: (settings) => ipcRenderer.invoke('update-watermark-settings', settings),
});
