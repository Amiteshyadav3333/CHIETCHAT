import React, { useState } from 'react';
import { ControlBar, GridLayout, LiveKitRoom, ParticipantTile, RoomAudioRenderer, useLocalParticipant, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';

const ScreenShareWithAudio = () => {
    const { localParticipant } = useLocalParticipant();
    const [sharing, setSharing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');
    const toggle = async () => {
        setBusy(true);
        setNotice('');
        try {
            if (sharing) {
                await localParticipant.setScreenShareEnabled(false);
                setSharing(false);
                return;
            }
            // Keep the presenter's voice live while the shared tab/window audio
            // is published as a separate LiveKit ScreenShareAudio track.
            if (!localParticipant.isMicrophoneEnabled) await localParticipant.setMicrophoneEnabled(true);
            await localParticipant.setScreenShareEnabled(true, {
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
                selfBrowserSurface: 'exclude', surfaceSwitching: 'include', systemAudio: 'include',
            });
            setSharing(true);
            const systemAudio = localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
            setNotice(systemAudio ? 'Screen and audio are live' : 'Screen is live. To share its sound, choose a browser tab and enable “Share tab audio”.');
        } catch (error) {
            setNotice(error?.message || 'Screen sharing could not start.');
        } finally { setBusy(false); }
    };
    return <div className="flex flex-col items-center gap-1"><button type="button" disabled={busy} onClick={toggle} className={`rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50 ${sharing ? 'bg-red-600' : 'bg-zinc-800 hover:bg-zinc-700'}`}>{busy ? 'Please wait…' : sharing ? 'Stop sharing' : 'Share screen + audio'}</button>{notice&&<span className="max-w-72 text-center text-[10px] text-zinc-400">{notice}</span>}</div>;
};

const StableStage = ({ publisher }) => {
    const tracks = useTracks(
        [Track.Source.Camera, Track.Source.ScreenShare],
        { onlySubscribed: true },
    );
    return <div className="flex h-full min-h-0 flex-col">
        <GridLayout tracks={tracks} className="min-h-0 flex-1">
            <ParticipantTile />
        </GridLayout>
        {publisher && <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-white/10 bg-zinc-950/95 px-2 pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))] backdrop-blur"><ControlBar controls={{ camera: true, microphone: true, screenShare: false, chat: false, leave: false }} /><ScreenShareWithAudio /></div>}
    </div>;
};

export default function LiveRoom({ token, serverUrl, publisher = false, onDisconnected, onError }) {
    return <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect
        audio={publisher}
        video={publisher}
        className="h-full"
        data-lk-theme="default"
        onDisconnected={onDisconnected}
        onError={onError}
    >
        <StableStage publisher={publisher} />
        <RoomAudioRenderer />
    </LiveKitRoom>;
}
