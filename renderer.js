// renderer.js

// 全局變量
let images = [];
let watermarkLogo = null;
let selectedImageIndex = null;

// 獲取DOM元素
const uploadArea = document.getElementById('upload-area');
const imageUpload = document.getElementById('image-upload');
const previewArea = document.getElementById('preview-area');
const watermarkTextInput = document.getElementById('watermark-text');
const watermarkAngleInput = document.getElementById('watermark-angle');
const watermarkColorInput = document.getElementById('watermark-color');
const watermarkFontSelect = document.getElementById('watermark-font');
const watermarkLogoInput = document.getElementById('watermark-logo');
const largePreview = document.getElementById('large-preview');
const selectAllBtn = document.getElementById('select-all');
const deselectAllBtn = document.getElementById('deselect-all');
const exportBtn = document.getElementById('export');

// 上傳圖片（拖曳和按鈕選擇）
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    handleImageUpload(e.dataTransfer.files);
});

uploadArea.addEventListener('click', () => {
    imageUpload.click();
});

imageUpload.addEventListener('change', (e) => {
    handleImageUpload(e.target.files);
});

watermarkLogoInput.addEventListener('change', handleWatermarkLogoUpload);

// 全選、取消全選、輸出按鈕
selectAllBtn.addEventListener('click', selectAllImages);
deselectAllBtn.addEventListener('click', deselectAllImages);
exportBtn.addEventListener('click', exportImages);

// 更新浮水印設置
watermarkTextInput.addEventListener('input', updateWatermarks);
watermarkAngleInput.addEventListener('input', updateWatermarks);
watermarkColorInput.addEventListener('input', updateWatermarks);
watermarkFontSelect.addEventListener('change', updateWatermarks);

// 函數：處理圖片上傳
function handleImageUpload(files) {
    for (let file of files) {
        if (!file.type.startsWith('image/')) continue;
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                // 添加浮水印
                addWatermark(ctx, img.width, img.height);

                const dataUrl = canvas.toDataURL();
                images.push({
                    original: img,
                    canvas: canvas,
                    dataUrl: dataUrl,
                    selected: true
                });
                displayPreviewImages();
            }
            img.src = e.target.result;
        }
        reader.readAsDataURL(file);
    }
}

// 函數：處理浮水印Logo上傳
function handleWatermarkLogoUpload(event) {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                watermarkLogo = img;
                updateWatermarks();
            }
            img.src = e.target.result;
        }
        reader.readAsDataURL(file);
    }
}

// 函數：添加浮水印
function addWatermark(ctx, width, height) {
    const watermarkText = watermarkTextInput.value || 'RIVERBIEN';
    const angle = parseFloat(watermarkAngleInput.value) || 0;
    let color = watermarkColorInput.value || '#FFFFFF';
    const font = watermarkFontSelect.value || 'Optima';

    // 判斷背景亮度，自動調整浮水印顏色
    const imageData = ctx.getImageData(0, 0, width, height);
    const brightness = getImageBrightness(imageData);
    if (brightness > 200) {
        color = '#000000'; // 背景為白色，浮水印設為黑色
    }

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(angle * Math.PI / 180);

    // 計算浮水印大小
    let watermarkSize = calculateWatermarkSize(width, height);

    if (watermarkLogo) {
        // 使用Logo圖片作為浮水印
        const ratio = watermarkSize / Math.max(watermarkLogo.width, watermarkLogo.height);
        const logoWidth = watermarkLogo.width * ratio;
        const logoHeight = watermarkLogo.height * ratio;
        ctx.globalAlpha = calculateOpacity(brightness);
        ctx.drawImage(watermarkLogo, -logoWidth / 2, -logoHeight / 2, logoWidth, logoHeight);
    } else {
        // 使用文字作為浮水印
        ctx.font = `${watermarkSize}px ${font}`;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 設置透明度
        ctx.globalAlpha = calculateOpacity(brightness);
        ctx.fillText(watermarkText, 0, 0);
    }

    ctx.restore();
}

// 函數：計算圖片亮度
function getImageBrightness(imageData) {
    let total = 0;
    for (let i = 0; i < imageData.data.length; i += 4) {
        const r = imageData.data[i];
        const g = imageData.data[i + 1];
        const b = imageData.data[i + 2];
        const brightness = (r + g + b) / 3;
        total += brightness;
    }
    return total / (imageData.data.length / 4);
}

// 函數：根據亮度調整透明度
function calculateOpacity(brightness) {
    // 亮度範圍 0-255，將其映射為透明度 0.3-0.7
    return 1 - (brightness / 255) * 0.4; // 透明度在 0.6-0.2 之間
}

// 函數：計算浮水印大小
function calculateWatermarkSize(width, height) {
    let size;
    const ratio = width / height;
    if (width === height) {
        // 正方形：長的 3/2
        size = Math.max(width, height) * (3 / 2);
    } else if (width < height) {
        // 直式長方形：短邊的 3/2
        size = Math.min(width, height) * (3 / 2);
    } else {
        // 橫式長方形
        if (ratio <= 2) {
            // 長邊 ≤ 2倍短邊：長邊的 3/5
            size = width * (3 / 5);
        } else {
            // 長邊 > 2倍短邊：短邊的 6/5
            size = height * (6 / 5);
        }
    }
    return size / 100; // 調整比例，避免字體過大
}

// 函數：顯示預覽圖片
function displayPreviewImages() {
    previewArea.innerHTML = '';
    images.forEach((imgObj, index) => {
        const div = document.createElement('div');
        div.className = 'preview-image';
        const img = document.createElement('img');
        img.src = imgObj.dataUrl;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = imgObj.selected;
        checkbox.addEventListener('change', (e) => {
            imgObj.selected = e.target.checked;
        });
        div.appendChild(checkbox);
        div.appendChild(img);
        div.addEventListener('click', () => {
            selectedImageIndex = index;
            displayLargeImage(index);
        });
        previewArea.appendChild(div);
    });
}

// 函數：顯示大圖
function displayLargeImage(index) {
    const imgObj = images[index];
    largePreview.src = imgObj.dataUrl;
}

// 函數：更新浮水印
function updateWatermarks() {
    if (selectedImageIndex !== null) {
        // 只更新選中的圖片
        const imgObj = images[selectedImageIndex];
        const ctx = imgObj.canvas.getContext('2d');
        ctx.clearRect(0, 0, imgObj.canvas.width, imgObj.canvas.height);
        ctx.drawImage(imgObj.original, 0, 0);
        addWatermark(ctx, imgObj.canvas.width, imgObj.canvas.height);
        imgObj.dataUrl = imgObj.canvas.toDataURL();
        displayPreviewImages();
        displayLargeImage(selectedImageIndex);
    } else {
        // 更新所有圖片
        images.forEach((imgObj, index) => {
            const ctx = imgObj.canvas.getContext('2d');
            ctx.clearRect(0, 0, imgObj.canvas.width, imgObj.canvas.height);
            ctx.drawImage(imgObj.original, 0, 0);
            addWatermark(ctx, imgObj.canvas.width, imgObj.canvas.height);
            imgObj.dataUrl = imgObj.canvas.toDataURL();
        });
        displayPreviewImages();
    }
}

// 函數：全選圖片
function selectAllImages() {
    images.forEach(imgObj => {
        imgObj.selected = true;
    });
    displayPreviewImages();
}

// 函數：取消全選圖片
function deselectAllImages() {
    images.forEach(imgObj => {
        imgObj.selected = false;
    });
    displayPreviewImages();
}

// 函數：輸出圖片
function exportImages() {
    images.forEach((imgObj, index) => {
        if (imgObj.selected) {
            const link = document.createElement('a');
            link.href = imgObj.dataUrl;
            link.download = `image_${index + 1}.png`;
            link.click();
        }
    });
    alert('浮水印添加成功，圖片已下載。');
}
