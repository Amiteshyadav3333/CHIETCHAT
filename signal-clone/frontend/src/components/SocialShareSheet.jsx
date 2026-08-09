import React, { useState } from 'react';
import axios from 'axios';
import { ChatBubbleOvalLeftIcon, ClipboardIcon, ShareIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { openSafeExternal } from '../utils/safeUrl';
import { getSocialShareData, getSocialShareTargets } from '../utils/socialSharing';

const SocialShareSheet = ({ post, token, onClose, onShareToChat, onShared }) => {
    const [busy, setBusy] = useState('');
    const [notice, setNotice] = useState('');
    const shareData = getSocialShareData(post);
    const targets = getSocialShareTargets(shareData);

    const recordShare = async () => {
        try {
            const res = await axios.post(`/api/social/posts/${post.id}/share`, {}, { headers: { Authorization: `Bearer ${token}` } });
            onShared?.(res.data.shareCount);
        } catch (error) { console.error('Could not record post share', error); }
    };
    const openTarget = async target => {
        await recordShare();
        if (target.startsWith('sms:')) window.location.href = target;
        else openSafeExternal(target);
        onClose();
    };
    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(shareData.url);
            await recordShare();
            setNotice('Link copied');
        } catch { setNotice('Could not copy link'); }
    };
    const nativeShare = async () => {
        if (!navigator.share) return copyLink();
        try {
            await navigator.share(shareData);
            await recordShare();
            onClose();
        } catch (error) { if (error?.name !== 'AbortError') setNotice('Could not open share menu'); }
    };
    const shareToStory = async () => {
        setBusy('story');
        try {
            await axios.post(`/api/social/posts/${post.id}/story`, {}, { headers: { Authorization: `Bearer ${token}` } });
            await recordShare();
            setNotice('Added to your story');
            setTimeout(onClose, 700);
        } catch (error) { setNotice(error.response?.data?.error || 'Could not add to story'); }
        finally { setBusy(''); }
    };
    const shareToChat = async () => {
        await recordShare();
        onShareToChat?.(post);
        onClose();
    };
    const options = [
        { label: 'WhatsApp', color: 'bg-[#25D366]', icon: 'WA', action: () => openTarget(targets.whatsapp) },
        { label: 'Snapchat', color: 'bg-[#FFFC00] text-black', icon: '👻', action: () => openTarget(targets.snapchat) },
        { label: 'CHEETCHAT', color: 'bg-blue-600', icon: <ChatBubbleOvalLeftIcon className="h-7 w-7" />, action: shareToChat },
        { label: 'Your story', color: 'bg-gradient-to-br from-fuchsia-500 to-orange-400', icon: '＋', action: shareToStory },
        { label: 'Copy link', color: 'bg-gray-700', icon: <ClipboardIcon className="h-7 w-7" />, action: copyLink },
        { label: 'Share', color: 'bg-gray-700', icon: <ShareIcon className="h-7 w-7" />, action: nativeShare },
        { label: 'SMS', color: 'bg-green-600', icon: 'SMS', action: () => openTarget(targets.sms) },
        { label: 'X / Twitter', color: 'bg-black ring-1 ring-white/20', icon: '𝕏', action: () => openTarget(targets.twitter) },
    ];
    return (
        <div className="fixed inset-0 z-[100] flex items-end bg-black/65" onClick={onClose} role="presentation">
            <div className="w-full rounded-t-3xl border-t border-white/10 bg-[#171717] p-5 pb-8 text-white shadow-2xl" onClick={event => event.stopPropagation()} role="dialog" aria-label="Share post">
                <div className="mb-5 flex items-center justify-between"><h3 className="text-lg font-bold">Share post</h3><button onClick={onClose} aria-label="Close share options"><XMarkIcon className="h-6 w-6" /></button></div>
                <div className="grid grid-cols-4 gap-x-3 gap-y-6">
                    {options.map(option => <button key={option.label} disabled={busy === 'story'} onClick={option.action} className="flex min-w-0 flex-col items-center gap-2 disabled:opacity-50"><span className={`flex h-14 w-14 items-center justify-center rounded-full text-sm font-black ${option.color}`}>{option.icon}</span><span className="w-full truncate text-[11px] font-semibold text-white/80">{busy === 'story' && option.label === 'Your story' ? 'Adding…' : option.label}</span></button>)}
                </div>
                {notice && <p className="mt-5 text-center text-sm font-semibold text-green-400" role="status">{notice}</p>}
            </div>
        </div>
    );
};

export default SocialShareSheet;
