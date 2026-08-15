const loadDrawable = async (blob) => {
    if (typeof createImageBitmap === 'function') {
        try { return await createImageBitmap(blob); } catch { /* Safari fallback */ }
    }
    const url = URL.createObjectURL(blob);
    try {
        return await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('This picture format cannot be opened.'));
            image.src = url;
        });
    } finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
};

export const photoBlobToStickerFile = async (blob) => {
    if (!blob?.type?.startsWith('image/')) throw new Error('Please choose a picture.');
    if (blob.size > 20 * 1024 * 1024) throw new Error('Picture must be smaller than 20MB.');
    const image = await loadDrawable(blob);
    const sourceWidth = image.width || image.naturalWidth;
    const sourceHeight = image.height || image.naturalHeight;
    if (!sourceWidth || !sourceHeight) throw new Error('Picture is empty or damaged.');
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const context = canvas.getContext('2d', { alpha: true });
    context.clearRect(0, 0, 512, 512);
    const scale = Math.min(480 / sourceWidth, 480 / sourceHeight);
    const width = Math.round(sourceWidth * scale);
    const height = Math.round(sourceHeight * scale);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, (512 - width) / 2, (512 - height) / 2, width, height);
    image.close?.();
    const output = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.9));
    if (!output) throw new Error('Your browser could not create the sticker.');
    return new File([output], `sticker-${Date.now()}.webp`, { type: 'image/webp' });
};

export const photoUrlToStickerFile = async (url) => {
    const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error('Picture could not be downloaded for sticker creation.');
    return photoBlobToStickerFile(await response.blob());
};
