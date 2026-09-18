const {
    EgressClient,
    SegmentedFileOutput,
    SegmentedFileProtocol,
    S3Upload
} = require('livekit-server-sdk');

const isHlsEgressEnabled = () => false;

const getEgressClient = () => {
    if (!process.env.LIVEKIT_URL) {
        throw new Error('LIVEKIT_URL is required for LiveKit egress');
    }

    return new EgressClient(
        process.env.LIVEKIT_URL,
        process.env.LIVEKIT_API_KEY,
        process.env.LIVEKIT_API_SECRET
    );
};

const buildS3Upload = () => new S3Upload({
    accessKey: process.env.S3_ACCESS_KEY,
    secret: process.env.S3_SECRET_KEY,
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT,
    bucket: process.env.S3_BUCKET_NAME,
    forcePathStyle: true
});

const getLiveHlsUrl = (sessionId) => {
    if (!process.env.S3_PUBLIC_URL) {
        return null;
    }

    return `${process.env.S3_PUBLIC_URL}/live/${sessionId}/live.m3u8`;
};

const startRoomHlsEgress = async (session) => {
    if (!isHlsEgressEnabled()) {
        return null;
    }

    const client = getEgressClient();
    const output = new SegmentedFileOutput({
        protocol: SegmentedFileProtocol.HLS_PROTOCOL,
        filenamePrefix: `live/${session.id}/segment`,
        playlistName: `live/${session.id}/index.m3u8`,
        livePlaylistName: `live/${session.id}/live.m3u8`,
        segmentDuration: 6,
        output: {
            case: 's3',
            value: buildS3Upload()
        }
    });

    return client.startRoomCompositeEgress(session.livekit_room_name, output, {
        layout: 'grid'
    });
};

const stopEgress = async (egressId) => {
    if (!egressId) {
        return null;
    }

    const client = getEgressClient();
    return client.stopEgress(egressId);
};

module.exports = {
    getLiveHlsUrl,
    isHlsEgressEnabled,
    startRoomHlsEgress,
    stopEgress
};
