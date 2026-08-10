const MIME_EXTENSIONS = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
    'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/webm': 'webm',
};

export const mediaFileName = (sourceUrl, mimeType = '') => {
    let baseName = 'cheetchat-media';
    try {
        baseName = decodeURIComponent(new URL(sourceUrl, globalThis.location?.href || 'https://local.invalid/').pathname.split('/').pop() || baseName);
    } catch { /* use safe default */ }
    baseName = baseName.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 100) || 'cheetchat-media';
    if (!/\.[a-z0-9]{2,5}$/i.test(baseName)) {
        baseName += `.${MIME_EXTENSIONS[mimeType] || (mimeType.startsWith('video/') ? 'mp4' : mimeType.startsWith('image/') ? 'jpg' : 'bin')}`;
    }
    return baseName;
};

export const saveMediaToDevice = async (sourceUrl) => {
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error(`Download failed with HTTP ${response.status}`);
    const blob = await response.blob();
    const file = new File([blob], mediaFileName(sourceUrl, blob.type), { type: blob.type || 'application/octet-stream' });
    const isAppleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent || '');

    if (isAppleMobile && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Save CHEETCHAT media' });
        return 'shared';
    }

    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = file.name;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    return 'downloaded';
};
