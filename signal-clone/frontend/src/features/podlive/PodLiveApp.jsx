import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeftIcon, ArrowPathIcon, MagnifyingGlassIcon, MicrophoneIcon, PlayIcon, SignalIcon, UserGroupIcon, VideoCameraIcon } from '@heroicons/react/24/outline';
import usePodLiveSession from './auth/usePodLiveSession';
import { podlive, unwrapApiError } from './api/podliveApi';
import { PODLIVE_API_URL, PODLIVE_CATEGORIES } from './config';
import HlsVideo from './components/HlsVideo';

const LiveRoom = React.lazy(() => import('./components/LiveRoom'));

const fallbackAvatar = (user) => `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.display_name || 'P')}&background=6366f1&color=fff`;
const Metric = ({ label, value }) => <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p><p className="mt-2 text-2xl font-black">{Number(value || 0).toLocaleString()}</p></div>;
const Field = ({ label, ...props }) => <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">{label}<input {...props} className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-white outline-none focus:border-indigo-500" /></label>;

function Card({ session, live, open }) {
    return <button onClick={() => open(live ? 'live' : 'watch', session.id)} className="group min-w-0 text-left">
        <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-zinc-900">
            {session.thumbnail_url ? <img src={session.thumbnail_url} alt="" className="h-full w-full object-cover transition group-hover:scale-105" /> : <VideoCameraIcon className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-zinc-700" />}
            <span className={`absolute left-2 top-2 rounded px-2 py-1 text-[10px] font-black ${live ? 'bg-red-600' : 'bg-black/70'}`}>{live ? '● LIVE' : session.category || 'VIDEO'}</span>
            <span className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition group-hover:opacity-100"><span className="grid h-12 w-12 place-items-center rounded-full bg-white/20 backdrop-blur"><PlayIcon className="h-6 w-6" /></span></span>
        </div>
        <div className="mt-3 flex gap-3"><img src={session.host?.avatar_url || fallbackAvatar(session.host)} alt="" className="h-9 w-9 rounded-full object-cover"/><div className="min-w-0"><p className="line-clamp-2 text-sm font-bold">{session.title}</p><p className="truncate text-xs text-zinc-500">@{session.host?.unique_handle || 'creator'} · {session.viewer_count_peak || 0} views</p></div></div>
    </button>;
}

function Browse({ open }) {
    const [data, setData] = useState({ lives: [], vods: [], loading: true, error: '' });
    const [query, setQuery] = useState(''); const [category, setCategory] = useState('All');
    const load = useCallback(async () => { try { const [lives, vods] = await Promise.all([podlive.active(), podlive.vods()]); setData({ lives, vods, loading: false, error: '' }); } catch (e) { setData((v) => ({ ...v, loading: false, error: unwrapApiError(e) })); } }, []);
    useEffect(() => { load(); const timer = setInterval(load, 15000); return () => clearInterval(timer); }, [load]);
    const vods = useMemo(() => data.vods.filter((v) => (category === 'All' || v.category === category) && `${v.title} ${v.host?.display_name}`.toLowerCase().includes(query.toLowerCase())), [data.vods, query, category]);
    if (data.loading) return <Loading label="Loading PodLive…"/>;
    return <div className="mx-auto max-w-7xl space-y-9 p-4 pb-24 md:p-7">
        <div className="rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-600/20 via-purple-600/10 to-transparent p-6 md:p-10"><p className="text-xs font-bold uppercase tracking-[.25em] text-indigo-300">CHEETCHAT presents</p><h1 className="mt-3 text-3xl font-black md:text-5xl">Listen. Watch. Go live.</h1><p className="mt-3 max-w-xl text-sm text-zinc-400">Your CHEETCHAT account is already connected. No second login, no iframe, one responsive experience.</p><button onClick={() => open('create')} className="mt-6 rounded-full bg-red-600 px-6 py-3 text-sm font-black hover:bg-red-500">Start a live stream</button></div>
        {data.error && <ErrorBox text={data.error} retry={load}/>} 
        <section><h2 className="mb-4 flex items-center gap-2 font-black"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500"/>Live now</h2>{data.lives.length ? <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{data.lives.map((s) => <Card key={s.id} session={s} live open={open}/>)}</div> : <Empty text="No one is live right now."/>}</section>
        <section><div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="font-black">Latest shows</h2><div className="relative"><MagnifyingGlassIcon className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500"/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search shows" className="rounded-full border border-white/10 bg-zinc-900 py-2 pl-9 pr-4 text-sm outline-none"/></div></div><div className="mb-5 flex gap-2 overflow-x-auto pb-1">{['All', ...PODLIVE_CATEGORIES].map((c) => <button key={c} onClick={() => setCategory(c)} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold ${category === c ? 'bg-indigo-600' : 'bg-white/5 text-zinc-400'}`}>{c}</button>)}</div>{vods.length ? <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{vods.map((s) => <Card key={s.id} session={s} open={open}/>)}</div> : <Empty text="No videos found."/>}</section>
    </div>;
}

function Watch({ id, live, back }) {
    const [state, setState] = useState({ loading: true, data: null, room: null, error: '' });
    useEffect(() => { let alive = true; (async () => { try { const data = await podlive.recording(id); await podlive.view(id).catch(() => {}); const room = live ? { ...(await podlive.viewerToken(id)), ...(await podlive.config()) } : null; if (alive) setState({ loading: false, data, room, error: '' }); } catch (e) { if (alive) setState({ loading: false, data: null, room: null, error: unwrapApiError(e) }); } })(); return () => { alive = false; }; }, [id, live]);
    if (state.loading) return <Loading label="Opening stream…"/>;
    if (state.error) return <ErrorBox text={state.error} retry={back}/>;
    const session = state.data?.session || state.data;
    return <div className="mx-auto max-w-6xl p-3 pb-24 md:p-6"><button onClick={back} className="mb-4 flex items-center gap-2 text-sm text-zinc-400"><ArrowLeftIcon className="h-4 w-4"/>Back</button><div className="aspect-video overflow-hidden rounded-2xl bg-black">{live && state.room ? <React.Suspense fallback={<Loading label="Connecting to live room…"/>}><LiveRoom token={state.room.token} serverUrl={state.room.livekitUrl}/></React.Suspense> : <HlsVideo src={session?.recording_url} poster={session?.thumbnail_url} autoPlay className="h-full w-full"/>}</div><h1 className="mt-5 text-xl font-black md:text-2xl">{session?.title}</h1><p className="mt-2 text-sm text-zinc-400">{session?.description}</p></div>;
}

function Studio({ id, back }) {
    const [room, setRoom] = useState(null); const [error, setError] = useState('');
    useEffect(() => { podlive.start(id).then(async (value) => { setRoom(value); await podlive.startHls(id).catch(() => {}); }).catch((e) => setError(unwrapApiError(e))); }, [id]);
    const end = async () => { await podlive.end(id); back(); };
    if (error) return <ErrorBox text={error} retry={back}/>; if (!room) return <Loading label="Preparing camera and microphone…"/>;
    return <div className="flex h-full flex-col bg-black"><div className="flex items-center justify-between border-b border-white/10 p-3"><span className="font-black text-red-500">● LIVE STUDIO</span><button onClick={end} className="rounded-full bg-red-600 px-4 py-2 text-xs font-black">End stream</button></div><div className="min-h-0 flex-1"><React.Suspense fallback={<Loading label="Loading professional studio…"/>}><LiveRoom token={room.token} serverUrl={room.livekitUrl} publisher/></React.Suspense></div></div>;
}

function Create({ open }) {
    const [values, setValues] = useState({ title: '', description: '', category: 'Technology' }); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
    const submit = async (e) => { e.preventDefault(); setBusy(true); setError(''); try { const data = await podlive.create(values); open('studio', data.session.id); } catch (err) { setError(unwrapApiError(err)); setBusy(false); } };
    return <Panel title="Start live stream"><form onSubmit={submit} className="space-y-5">{error && <ErrorBox text={error}/>}<Field label="Stream title" required value={values.title} onChange={(e) => setValues({...values, title:e.target.value})}/><label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">Description<textarea rows="4" value={values.description} onChange={(e) => setValues({...values, description:e.target.value})} className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-900 p-4 text-sm outline-none"/></label><label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">Category<select value={values.category} onChange={(e) => setValues({...values, category:e.target.value})} className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-900 p-3 text-sm">{PODLIVE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label><button disabled={busy} className="w-full rounded-xl bg-red-600 py-3 font-black disabled:opacity-50">{busy ? 'Preparing…' : 'Go live'}</button></form></Panel>;
}

function Dashboard({ open }) {
    const [stats, setStats] = useState(null); const [recordings, setRecordings] = useState([]);
    useEffect(() => { Promise.all([podlive.stats(), podlive.recordings()]).then(([a,b]) => { setStats(a); setRecordings(b); }); }, []);
    return <div className="mx-auto max-w-6xl space-y-7 p-4 pb-24 md:p-7"><h1 className="text-2xl font-black">Creator dashboard</h1><div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Metric label="Followers" value={stats?.followers}/><Metric label="Views" value={stats?.totalViews}/><Metric label="Live sessions" value={stats?.totalLives}/><Metric label="Recordings" value={recordings.length}/></div><div className="grid gap-3 sm:grid-cols-2"><button onClick={() => open('create')} className="rounded-2xl bg-red-600 p-6 text-left font-black">Start broadcasting →</button><button onClick={() => open('upload')} className="rounded-2xl border border-white/10 bg-white/5 p-6 text-left font-black">Upload a video →</button></div><h2 className="font-black">Your recordings</h2>{recordings.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{recordings.map((s) => <Card key={s.id} session={s} open={open}/>)}</div> : <Empty text="Your recordings will appear here."/>}</div>;
}

function Upload() {
    const [files, setFiles] = useState({ video: null, thumbnail: null }); const [values, setValues] = useState({ title:'', description:'', category:'Technology' }); const [status, setStatus] = useState({ busy:false, progress:0, message:'' });
    const submit = async (e) => { e.preventDefault(); if (!files.video) return setStatus({...status,message:'Choose a video file.'}); const form = new FormData(); Object.entries(values).forEach(([k,v]) => form.append(k,v)); form.append('video',files.video); if(files.thumbnail) form.append('thumbnail',files.thumbnail); setStatus({busy:true,progress:0,message:''}); try { await podlive.upload(form,(p) => setStatus((s) => ({...s,progress:p.total ? Math.round(p.loaded*100/p.total):0}))); setStatus({busy:false,progress:100,message:'Video published successfully.'}); } catch(err) { setStatus({busy:false,progress:0,message:unwrapApiError(err)}); } };
    return <Panel title="Upload video"><form onSubmit={submit} className="space-y-5"><Field label="Title" required value={values.title} onChange={(e)=>setValues({...values,title:e.target.value})}/><Field label="Video" type="file" required accept="video/*" onChange={(e)=>setFiles({...files,video:e.target.files[0]})}/><Field label="Thumbnail" type="file" accept="image/*" onChange={(e)=>setFiles({...files,thumbnail:e.target.files[0]})}/>{status.message && <p className="text-sm text-indigo-300">{status.message}</p>}<button disabled={status.busy} className="w-full rounded-xl bg-indigo-600 py-3 font-black">{status.busy ? `Uploading ${status.progress}%` : 'Publish video'}</button></form></Panel>;
}

const Panel = ({ title, children }) => <div className="mx-auto max-w-2xl p-4 pb-24 md:p-8"><h1 className="mb-6 text-2xl font-black">{title}</h1><div className="rounded-3xl border border-white/10 bg-white/[.04] p-5 md:p-7">{children}</div></div>;
const Loading = ({ label }) => <div className="grid h-full min-h-64 place-items-center"><div className="text-center"><ArrowPathIcon className="mx-auto h-8 w-8 animate-spin text-indigo-400"/><p className="mt-3 text-sm text-zinc-400">{label}</p></div></div>;
const Empty = ({ text }) => <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-zinc-500">{text}</div>;
const ErrorBox = ({ text, retry }) => <div className="m-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{text}{retry && <button onClick={retry} className="ml-3 underline">Try again</button>}</div>;

export default function PodLiveApp({ active, onBack }) {
    const session = usePodLiveSession(active); const [route, setRoute] = useState({ name:'browse', id:null });
    const open = (name, id=null) => setRoute({name,id});
    if (!active) return null;
    if (session.loading) return <div className="h-full bg-[#080808] text-white"><Loading label="Connecting your CHEETCHAT account…"/></div>;
    if (session.error) return <div className="grid h-full place-items-center bg-[#080808] text-white"><ErrorBox text={session.error} retry={session.retry}/></div>;
    const content = route.name === 'browse' ? <Browse open={open}/> : route.name === 'watch' ? <Watch id={route.id} back={()=>open('browse')}/> : route.name === 'live' ? <Watch id={route.id} live back={()=>open('browse')}/> : route.name === 'studio' ? <Studio id={route.id} back={()=>open('dashboard')}/> : route.name === 'create' ? <Create open={open}/> : route.name === 'upload' ? <Upload/> : <Dashboard open={open}/>;
    if (route.name === 'studio') return <div className="h-full text-white">{content}</div>;
    return <div className="relative flex h-full flex-col overflow-hidden bg-[#080808] text-white"><header className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-3 md:px-5"><button onClick={onBack} className="rounded-full p-2 hover:bg-white/10" title="Back to CHEETCHAT"><ArrowLeftIcon className="h-5 w-5"/></button><button onClick={()=>open('browse')} className="flex items-center gap-2 font-black"><span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600"><MicrophoneIcon className="h-5 w-5"/></span><span className="hidden sm:inline">PodLive</span></button><nav className="ml-auto flex items-center gap-1"><button onClick={()=>open('browse')} className="rounded-full px-3 py-2 text-xs font-bold hover:bg-white/10"><SignalIcon className="inline h-4 w-4 sm:mr-1"/><span className="hidden sm:inline">Explore</span></button><button onClick={()=>open('dashboard')} className="rounded-full px-3 py-2 text-xs font-bold hover:bg-white/10"><UserGroupIcon className="inline h-4 w-4 sm:mr-1"/><span className="hidden sm:inline">Studio</span></button><img src={session.user?.avatar_url || fallbackAvatar(session.user)} alt="" className="ml-1 h-8 w-8 rounded-full object-cover"/></nav></header><main className="min-h-0 flex-1 overflow-y-auto">{content}</main><span className="sr-only">PodLive API: {PODLIVE_API_URL}</span></div>;
}
