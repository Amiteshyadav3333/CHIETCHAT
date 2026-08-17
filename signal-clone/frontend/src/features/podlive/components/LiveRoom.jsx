import React from 'react';
import { LiveKitRoom, RoomAudioRenderer, VideoConference } from '@livekit/components-react';
import '@livekit/components-styles';

export default function LiveRoom({ token, serverUrl, publisher = false }) {
    return <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect
        audio={publisher}
        video={publisher}
        className="h-full"
        data-lk-theme="default"
    >
        <VideoConference />
        <RoomAudioRenderer />
    </LiveKitRoom>;
}
