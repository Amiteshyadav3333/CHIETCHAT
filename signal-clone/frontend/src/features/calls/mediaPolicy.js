const preferCodec = (sdp, kind, name) => {
    const lines = sdp.split('\r\n');
    const mediaIndex = lines.findIndex(line => line.startsWith(`m=${kind}`));
    if (mediaIndex < 0) return sdp;
    const payloadTypes = [];
    lines.forEach(line => {
        const match = line.match(/^a=rtpmap:(\d+) ([^/]+)\//);
        if (match && match[2].toLowerCase() === name.toLowerCase()) payloadTypes.push(match[1]);
    });
    if (!payloadTypes.length) return sdp;
    const mediaParts = lines[mediaIndex].split(' ');
    const current = mediaParts.slice(3);
    lines[mediaIndex] = [
        ...mediaParts.slice(0, 3),
        ...payloadTypes.filter(type => current.includes(type)),
        ...current.filter(type => !payloadTypes.includes(type)),
    ].join(' ');
    return lines.join('\r\n');
};

const addOpusParameters = sdp => sdp.replace(/a=fmtp:(\d+) (.*opus.*)/gi, (_, payloadType, parameters) => {
    let result = parameters;
    if (!result.includes('stereo=')) result += ';stereo=0';
    if (!result.includes('useinbandfec=')) result += ';useinbandfec=1';
    if (!result.includes('maxaveragebitrate=')) result += ';maxaveragebitrate=64000';
    return `a=fmtp:${payloadType} ${result}`;
});

export const optimizeCallSdp = sdp => addOpusParameters(preferCodec(preferCodec(sdp, 'video', 'VP9'), 'audio', 'opus'));

export const callMediaConstraints = (callType, facingMode = 'user') => {
    const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    return callType === 'voice' ? { audio, video: false } : {
        audio,
        video: { width: { ideal: 960, max: 1280 }, height: { ideal: 540, max: 720 }, frameRate: { ideal: 24, max: 24 }, facingMode },
    };
};
