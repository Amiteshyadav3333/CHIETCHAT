export const normalizeCoordinates = (latitude, longitude) => {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw new Error('Invalid location coordinates');
    }
    return { lat, lng };
};

export const buildMapUrl = (latitude, longitude) => {
    const { lat, lng } = normalizeCoordinates(latitude, longitude);
    return `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
};
