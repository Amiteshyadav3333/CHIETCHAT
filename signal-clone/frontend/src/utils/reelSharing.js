export const getReelShareData = (reel, origin = window.location.origin) => {
    const url = `${origin}/reels/${reel.id}`;
    const text = reel.caption?.trim() || `Watch @${reel.user?.username || 'CHEETCHAT'}'s Reel`;
    return { title: 'CHEETCHAT Reel', text, url, message: `${text}\n${url}` };
};

export const getReelShareTargets = (shareData) => ({
    whatsapp: `https://wa.me/?text=${encodeURIComponent(shareData.message)}`,
    snapchat: `https://www.snapchat.com/scan?attachmentUrl=${encodeURIComponent(shareData.url)}`,
    sms: `sms:?body=${encodeURIComponent(shareData.message)}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareData.text)}&url=${encodeURIComponent(shareData.url)}`,
});
