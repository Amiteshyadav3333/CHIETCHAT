import React, { useContext, useEffect, useState } from 'react';
import { useNavigate, useParams } from '../utils/clientRouter';
import { AuthContext } from '../context/AuthContext';
import { podlive, unwrapApiError } from '../features/podlive/api/podliveApi';
import { ensurePodLiveSession } from '../features/podlive/auth/usePodLiveSession';
import UploadedVideoPlayer from '../features/podlive/components/UploadedVideoPlayer';

export default function PublicPodLiveVideo() {
    const { videoId } = useParams();
    const navigate = useNavigate();
    const { token } = useContext(AuthContext);
    const [video, setVideo] = useState(null);
    const [comment, setComment] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let active = true;
        setVideo(null);
        podlive.details(videoId).then(data => {
            if (active) setVideo(data);
            podlive.view(videoId).catch(() => {});
        }).catch(err => { if (active) setError(unwrapApiError(err, 'Video not found.')); });
        return () => { active = false; };
    }, [videoId]);

    const requireLogin = () => {
        sessionStorage.setItem('pending_nav', `${window.location.pathname}${window.location.search}`);
        navigate('/login?mode=login');
    };
    const perform = async action => {
        if (!token) return requireLogin();
        setBusy(true); setError('');
        try {
            await ensurePodLiveSession({ cheetchatToken: token });
            await action();
        } catch (err) { setError(unwrapApiError(err, 'Please log in to continue.')); }
        finally { setBusy(false); }
    };
    const share = async () => {
        const url = window.location.href;
        try {
            if (navigator.share) await navigator.share({ title: video?.title || 'PodLive video', url });
            else { await navigator.clipboard.writeText(url); setError('Video link copied.'); }
        } catch (err) { if (err?.name !== 'AbortError') setError('Could not share this video.'); }
    };
    const postComment = event => {
        event.preventDefault();
        if (!comment.trim() || busy) return;
        perform(async () => {
            const result = await podlive.comment(videoId, comment.trim());
            setVideo(current => ({ ...current, chat_messages: [...(current?.chat_messages || []), result.comment] }));
            setComment('');
        });
    };

    return <main className="min-h-screen bg-[#080808] px-4 py-6 text-white sm:px-6"><div className="mx-auto max-w-5xl">
        <header className="mb-5 flex items-center justify-between"><a href="/podlive" className="font-black text-indigo-300">PodLive</a><button onClick={requireLogin} className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold">Log in</button></header>
        {!video && !error && <p className="py-20 text-center text-zinc-400">Loading video…</p>}
        {error && !video && <p className="rounded-2xl border border-white/10 p-8 text-center text-zinc-300">{error}</p>}
        {video && <><div className="overflow-hidden rounded-2xl bg-black"><UploadedVideoPlayer src={video.recording_url} poster={video.thumbnail_url}/></div><section className="mt-5"><p className="text-xs font-semibold text-indigo-300">{video.host?.display_name || video.host?.unique_handle || 'PodLive creator'}</p><h1 className="mt-1 text-2xl font-black">{video.title}</h1><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-400">{video.description}</p><p className="mt-3 text-xs text-zinc-500">{Number(video.views || 0).toLocaleString()} views · {video.like_count || 0} likes</p><div className="mt-4 flex flex-wrap gap-2"><button disabled={busy} onClick={() => perform(async () => { const result = await podlive.like(videoId); setVideo(current => ({ ...current, like_count: result.like_count })); })} className="rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-bold disabled:opacity-50">Like</button><button onClick={share} className="rounded-full bg-white/10 px-5 py-2.5 text-sm font-bold">Share video</button></div>{error && <p role="status" className="mt-3 text-sm text-amber-300">{error}</p>}<form onSubmit={postComment} className="mt-7 flex gap-2"><input value={comment} onChange={event => setComment(event.target.value)} maxLength={500} placeholder="Write a comment" className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-indigo-400"/><button disabled={busy || !comment.trim()} className="rounded-full bg-indigo-600 px-5 text-sm font-bold disabled:opacity-50">Comment</button></form><div className="mt-5 space-y-3">{(video.chat_messages || []).map(entry => <article key={entry.id} className="rounded-xl bg-white/[.04] p-3 text-sm"><strong className="mr-2 text-indigo-300">{entry.sender_handle}</strong>{entry.message}</article>)}</div></section></>}
    </div></main>;
}
