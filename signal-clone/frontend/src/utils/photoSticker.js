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
    const offsetX = Math.round((512 - width) / 2);
    const offsetY = Math.round((512 - height) / 2);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, offsetX, offsetY, width, height);
    image.close?.();
    // Remove only background-coloured pixels connected to the canvas edges.
    // This preserves similarly coloured details enclosed inside the subject.
    const frame = context.getImageData(0, 0, 512, 512);
    const pixels = frame.data;
    const pixelCount = 512 * 512;
    const visited = new Uint8Array(pixelCount);
    const queue = new Int32Array(pixelCount);
    let head = 0;
    let tail = 0;
    const samples = [
        [offsetX + 2, offsetY + 2], [offsetX + width - 3, offsetY + 2],
        [offsetX + 2, offsetY + height - 3], [offsetX + width - 3, offsetY + height - 3],
    ];
    const background = samples.reduce((sum, [x, y]) => {
        const offset = (y * 512 + x) * 4;
        sum[0] += pixels[offset]; sum[1] += pixels[offset + 1]; sum[2] += pixels[offset + 2];
        return sum;
    }, [0, 0, 0]).map(value => value / samples.length);
    const distance = index => {
        const offset = index * 4;
        return Math.hypot(pixels[offset] - background[0], pixels[offset + 1] - background[1], pixels[offset + 2] - background[2]);
    };
    const enqueue = index => {
        if (!visited[index] && distance(index) < 92) { visited[index] = 1; queue[tail++] = index; }
    };
    for (let x = offsetX; x < offsetX + width; x += 1) {
        enqueue(offsetY * 512 + x); enqueue((offsetY + height - 1) * 512 + x);
    }
    for (let y = offsetY; y < offsetY + height; y += 1) {
        enqueue(y * 512 + offsetX); enqueue(y * 512 + offsetX + width - 1);
    }
    while (head < tail) {
        const index = queue[head++];
        const x = index % 512;
        const y = Math.floor(index / 512);
        if (x > offsetX) enqueue(index - 1);
        if (x < offsetX + width - 1) enqueue(index + 1);
        if (y > offsetY) enqueue(index - 512);
        if (y < offsetY + height - 1) enqueue(index + 512);
    }
    for (let index = 0; index < pixelCount; index += 1) {
        if (!visited[index]) continue;
        const colorDistance = distance(index);
        pixels[index * 4 + 3] = colorDistance < 58 ? 0 : Math.round(255 * Math.min(1, (colorDistance - 58) / 34));
    }
    context.putImageData(frame, 0, 0);
    const output = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.9));
    if (!output) throw new Error('Your browser could not create the sticker.');
    return new File([output], `sticker-${Date.now()}.webp`, { type: 'image/webp' });
};

export const photoUrlToStickerFile = async (url) => {
    const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error('Picture could not be downloaded for sticker creation.');
    return photoBlobToStickerFile(await response.blob());
};
