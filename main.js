const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

let mainWindow;

// 全局變量，用於存儲浮水印設置和圖片數據
let watermarkSettings = {
    text: 'RIVERBIEN',
    angle: 0,
    color: '#FFFFFF', // 預設白色
    font: 'Optima',
    logoPath: null
};
let imagesData = [];

// 創建主窗口
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            enableRemoteModule: false
        }
    });

    mainWindow.loadFile('index.html');
}

// 應用啟動時創建窗口
app.whenReady().then(createWindow);

// 當所有窗口關閉時退出應用（除非在 macOS 上）
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// 在 macOS 上，當應用被激活且沒有窗口時，重新創建窗口
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// 處理上傳圖片
ipcMain.handle('upload-images', async (event, filePaths) => {
    imagesData = []; // 重置圖片數據
    for (let filePath of filePaths) {
        try {
            const imageBuffer = fs.readFileSync(filePath);
            const image = sharp(imageBuffer);
            const metadata = await image.metadata();

            // 添加浮水印
            const watermarkedImageBuffer = await addWatermark(imageBuffer, metadata);

            imagesData.push({
                originalPath: filePath,
                dataUrl: `data:image/${metadata.format};base64,${watermarkedImageBuffer.toString('base64')}`,
                selected: true,
                metadata: metadata
            });
        } catch (error) {
            console.error(`處理圖片 ${filePath} 時出錯:`, error);
        }
    }
    return imagesData;
});

// 處理上傳浮水印Logo
ipcMain.handle('upload-watermark-logo', async (event, filePath) => {
    watermarkSettings.logoPath = filePath;
    // 重新生成所有圖片的浮水印
    await regenerateWatermarks();
});

// 處理更新浮水印設置
ipcMain.handle('update-watermark-settings', async (event, settings) => {
    watermarkSettings = { ...watermarkSettings, ...settings };
    // 重新生成所有圖片的浮水印
    await regenerateWatermarks();
    // 將更新後的圖片數據返回給渲染進程
    mainWindow.webContents.send('update-images', imagesData);
});

// 處理輸出圖片
ipcMain.handle('export-images', async (event, selectedImages) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: '選擇輸出資料夾'
    });

    if (canceled || filePaths.length === 0) {
        return;
    }

    const outputDir = filePaths[0];

    for (let i = 0; i < selectedImages.length; i++) {
        const imgData = selectedImages[i];
        if (imgData.selected) {
            try {
                const imageBuffer = Buffer.from(imgData.dataUrl.split(',')[1], 'base64');
                const outputFilePath = path.join(outputDir, path.basename(imgData.originalPath));
                fs.writeFileSync(outputFilePath, imageBuffer);
            } catch (error) {
                console.error(`導出圖片 ${imgData.originalPath} 時出錯:`, error);
            }
        }
    }

    // 向渲染進程發送完成消息
    mainWindow.webContents.send('export-complete');
});

// 重新生成所有圖片的浮水印
async function regenerateWatermarks() {
    for (let i = 0; i < imagesData.length; i++) {
        try {
            const imageBuffer = fs.readFileSync(imagesData[i].originalPath);
            const metadata = imagesData[i].metadata;
            const watermarkedImageBuffer = await addWatermark(imageBuffer, metadata);
            imagesData[i].dataUrl = `data:image/${metadata.format};base64,${watermarkedImageBuffer.toString('base64')}`;
        } catch (error) {
            console.error(`重新生成浮水印時處理圖片 ${imagesData[i].originalPath} 出錯:`, error);
        }
    }
    mainWindow.webContents.send('update-images', imagesData);
}

// 添加浮水印的函數
async function addWatermark(imageBuffer, metadata) {
    let image = sharp(imageBuffer);
    const { width, height } = metadata;

    // 計算浮水印大小
    const watermarkSize = calculateWatermarkSize(width, height);

    // 計算圖片的平均亮度
    const averageBrightness = await getImageAverageBrightness(imageBuffer);

    // 根據平均亮度調整透明度
    const opacity = calculateOpacity(averageBrightness);

    // 根據背景亮度自動調整浮水印顏色
    const watermarkColor = averageBrightness > 128 ? '#000000' : '#FFFFFF'; // 調整閾值為128

    // 創建浮水印圖層
    let watermark;
    if (watermarkSettings.logoPath) {
        // 使用Logo圖片作為浮水印
        const logoBuffer = fs.readFileSync(watermarkSettings.logoPath);
        watermark = await sharp(logoBuffer)
            .resize(watermarkSize.width, watermarkSize.height, { fit: 'contain', withoutEnlargement: true })
            .png()
            .toBuffer();
    } else {
        // 使用文字作為浮水印
        const svg = `
            <svg width="${watermarkSize.width}" height="${watermarkSize.height}">
                <text 
                    x="50%" 
                    y="50%" 
                    font-size="${watermarkSize.fontSize}" 
                    fill="${watermarkColor}" 
                    text-anchor="middle" 
                    dominant-baseline="middle" 
                    font-family="${watermarkSettings.font}" 
                    transform="rotate(${watermarkSettings.angle}, ${watermarkSize.width / 2}, ${watermarkSize.height / 2})">
                    ${watermarkSettings.text}
                </text>
            </svg>
        `;
        watermark = Buffer.from(svg);
    }

    // 合併圖片和浮水印
    image = image.composite([{
        input: watermark,
        gravity: 'center',
        blend: 'over',
        opacity: opacity // 使用sharp的透明度設置
    }]);

    // 返回處理後的圖片緩衝區
    return await image.toBuffer();
}

async function getImageAverageBrightness(imageBuffer) {
    const image = sharp(imageBuffer).ensureAlpha();
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    let totalBrightness = 0;

    for (let i = 0; i < data.length; i += info.channels) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // 使用 Rec. 709 標準加權
        const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        totalBrightness += brightness;
    }

    const averageBrightness = totalBrightness / (info.width * info.height);
    return averageBrightness; // 亮度範圍為 0 - 255
}


// 根據平均亮度計算透明度的函數
function calculateOpacity(averageBrightness) {
    // 將亮度值（0-255）映射到透明度（0.3 - 0.7）
    // 亮度越高（背景越亮），透明度越低（浮水印越不透明）
    const minOpacity = 0.3; // 最小透明度
    const maxOpacity = 0.7; // 最大透明度
    const opacity = maxOpacity - ((averageBrightness / 255) * (maxOpacity - minOpacity));
    return Math.min(Math.max(opacity, minOpacity), maxOpacity); // 限制範圍
}

// 計算浮水印大小的函數
function calculateWatermarkSize(width, height) {
    let watermarkLength;
    let fontSize;
    const ratio = width / height;
    const totalArea = width * height;

    // 設置浮水印目標佔圖片總面積的百分比
    const targetAreaPercentage = 0.05; // 5%
    const targetArea = totalArea * targetAreaPercentage;
    const targetLength = Math.sqrt(targetArea); // 假設浮水印為正方形

    // 設置最小和最大浮水印尺寸
    const minSize = 100; // 最小尺寸為 100 像素
    const maxSize = Math.min(width, height) * 0.5; // 最大尺寸為圖片最小邊的一半

    watermarkLength = Math.min(Math.max(targetLength, minSize), maxSize);

    // 根據圖片的寬高比調整浮水印的寬度和高度
    if (ratio > 1) {
        // 橫向長條
        watermarkLength = calculateHorizontalWatermarkSize(width, height, watermarkLength, ratio);
    } else if (ratio < 1) {
        // 縱向長條
        watermarkLength = calculateVerticalWatermarkSize(width, height, watermarkLength, ratio);
    }

    // 確保浮水印不會超出圖片範圍
    watermarkLength = Math.min(watermarkLength, Math.min(width, height) * 0.8);
    watermarkLength = Math.max(watermarkLength, minSize); // 最小長度為 100 像素

    // 動態調整字體大小，使字體大小與浮水印長度成比例
    fontSize = watermarkLength / 5; // 調整字體大小比例

    return {
        width: Math.round(watermarkLength),
        height: Math.round(watermarkLength),
        fontSize: Math.round(fontSize)
    };
}

// 計算橫向長條浮水印尺寸的函數
function calculateHorizontalWatermarkSize(width, height, currentLength, ratio) {
    if (ratio <= 2) {
        // 長邊 ≤ 2倍短邊：浮水印長度為長邊的 3/5
        return width * (3 / 5);
    } else {
        // 長邊 > 2倍短邊：浮水印長度為短邊的 5/6
        return height * (5 / 6);
    }
}

// 計算縱向長條浮水印尺寸的函數
function calculateVerticalWatermarkSize(width, height, currentLength, ratio) {
    if (ratio >= 0.5) {
        // 高度 ≥ 2倍寬度：浮水印長度為寬度的 5/6
        return width * (5 / 6);
    } else {
        // 其他情況保持當前計算
        return currentLength;
    }
}
