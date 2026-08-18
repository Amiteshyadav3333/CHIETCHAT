import React from 'react';
import { ControlBar, GridLayout, LiveKitRoom, ParticipantTile, RoomAudioRenderer, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';

const StableStage = ({ publisher }) => {
    const tracks = useTracks(
        [Track.Source.Camera, Track.Source.ScreenShare],
        { onlySubscribed: true },
    );
    return <div className="flex h-full min-h-0 flex-col">
        <GridLayout tracks={tracks} className="min-h-0 flex-1">
            <ParticipantTile />
        </GridLayout>
        {publisher && <ControlBar controls={{ camera: true, microphone: true, screenShare: true, chat: false, leave: false }} />}
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
