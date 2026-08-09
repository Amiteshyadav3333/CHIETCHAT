export const getSocialShareData = (post, origin = window.location.origin) => {
    const displayPost = post.isRetweet && post.originalPost ? post.originalPost : post;
    const url = `${origin}/?post=${post.id}`;
    const text = displayPost.caption?.trim() || `See @${displayPost.user?.username || 'CHEETCHAT'}'s post`;
    return { title: 'CHEETCHAT Post', text, url, message: `${text}\n${url}` };
};

export const getSocialShareTargets = (shareData) => ({
    whatsapp: `https://wa.me/?text=${encodeURIComponent(shareData.message)}`,
    snapchat: `https://www.snapchat.com/scan?attachmentUrl=${encodeURIComponent(shareData.url)}`,
    sms: `sms:?body=${encodeURIComponent(shareData.message)}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareData.text)}&url=${encodeURIComponent(shareData.url)}`,
});
