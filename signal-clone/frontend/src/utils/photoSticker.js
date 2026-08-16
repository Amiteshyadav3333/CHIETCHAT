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
    // Learn several dominant colours from the whole picture boundary instead
    // of assuming all four corners share one flat colour.
    const clusters = new Map();
    const sampleEdge = (x, y) => {
        const pixelOffset = (y * 512 + x) * 4;
        const red = pixels[pixelOffset];
        const green = pixels[pixelOffset + 1];
        const blue = pixels[pixelOffset + 2];
        const key = `${red >> 4},${green >> 4},${blue >> 4}`;
        const cluster = clusters.get(key) || { count: 0, red: 0, green: 0, blue: 0 };
        cluster.count += 1; cluster.red += red; cluster.green += green; cluster.blue += blue;
        clusters.set(key, cluster);
    };
    for (let x = offsetX; x < offsetX + width; x += 3) {
        sampleEdge(x, offsetY); sampleEdge(x, offsetY + height - 1);
    }
    for (let y = offsetY; y < offsetY + height; y += 3) {
        sampleEdge(offsetX, y); sampleEdge(offsetX + width - 1, y);
    }
    const palette = [...clusters.values()].sort((a, b) => b.count - a.count).slice(0, 6)
        .map(cluster => [cluster.red / cluster.count, cluster.green / cluster.count, cluster.blue / cluster.count]);
    const distance = (index) => {
        const offset = index * 4;
        let closest = Infinity;
        for (const colour of palette) {
            closest = Math.min(closest, Math.hypot(
                pixels[offset] - colour[0], pixels[offset + 1] - colour[1], pixels[offset + 2] - colour[2]
            ));
        }
        return closest;
    };
    const enqueue = index => {
        if (!visited[index] && distance(index) < 82) { visited[index] = 1; queue[tail++] = index; }
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
        pixels[index * 4 + 3] = colorDistance < 48 ? 0 : Math.round(255 * Math.min(1, (colorDistance - 48) / 34));
    }
    context.putImageData(frame, 0, 0);
    // Apple-style finish: a clean white contour separates the cut-out from
    // light and dark chat wallpapers without restoring the removed background.
    const cutout = document.createElement('canvas');
    cutout.width = 512; cutout.height = 512;
    cutout.getContext('2d').drawImage(canvas, 0, 0);
    const silhouette = document.createElement('canvas');
    silhouette.width = 512; silhouette.height = 512;
    const silhouetteContext = silhouette.getContext('2d');
    silhouetteContext.drawImage(cutout, 0, 0);
    silhouetteContext.globalCompositeOperation = 'source-in';
    silhouetteContext.fillStyle = '#ffffff';
    silhouetteContext.fillRect(0, 0, 512, 512);
    context.clearRect(0, 0, 512, 512);
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 16) {
        context.drawImage(silhouette, Math.cos(angle) * 8, Math.sin(angle) * 8);
    }
    context.drawImage(cutout, 0, 0);
    const output = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.9));
    if (!output) throw new Error('Your browser could not create the sticker.');
    return new File([output], `sticker-${Date.now()}.webp`, { type: 'image/webp' });
};

export const photoUrlToStickerFile = async (url) => {
    const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error('Picture could not be downloaded for sticker creation.');
    return photoBlobToStickerFile(await response.blob());
};
