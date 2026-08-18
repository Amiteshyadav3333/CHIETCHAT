import React, { useState } from 'react';
import { ControlBar, GridLayout, LiveKitRoom, ParticipantTile, RoomAudioRenderer, useLocalParticipant, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';

const ScreenShareWithAudio = () => {
    const { localParticipant } = useLocalParticipant();
    const [sharing, setSharing] = useState(false);
    const [busy, setBusy] = useState(false);
    const toggle = async () => {
        setBusy(true);
        try {
            await localParticipant.setScreenShareEnabled(!sharing, { audio: true, selfBrowserSurface: 'exclude', surfaceSwitching: 'include', systemAudio: 'include' });
            setSharing(!sharing);
        } finally { setBusy(false); }
    };
    return <button type="button" disabled={busy} onClick={toggle} className={`rounded-lg px-3 py-2 text-xs font-bold ${sharing ? 'bg-red-600' : 'bg-zinc-800 hover:bg-zinc-700'}`}>{sharing ? 'Stop sharing' : 'Share screen + audio'}</button>;
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
        {publisher && <div className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 bg-zinc-950 p-2"><ControlBar controls={{ camera: true, microphone: true, screenShare: false, chat: false, leave: false }} /><ScreenShareWithAudio /></div>}
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
