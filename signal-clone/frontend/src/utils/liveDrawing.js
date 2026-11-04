const MAX_ACTIONS = 12;
const MAX_POINTS_PER_ACTION = 24;
const MAX_BACKGROUND_CHARS = 1000;

const boundedNumber = (value, maximum) => Math.max(0, Math.min(maximum, Math.round(Number(value) || 0)));

const samplePoints = points => {
    const valid = points.filter(point => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y)));
    if (valid.length <= MAX_POINTS_PER_ACTION) {
        return valid.map(point => ({ x: boundedNumber(point.x, 1000), y: boundedNumber(point.y, 1000) }));
    }
    return Array.from({ length: MAX_POINTS_PER_ACTION }, (_, index) => {
        const sourceIndex = Math.round(index * (valid.length - 1) / (MAX_POINTS_PER_ACTION - 1));
        const point = valid[sourceIndex];
        return { x: boundedNumber(point.x, 1000), y: boundedNumber(point.y, 1000) };
    });
};

const compactAction = action => {
    const tool = ['pen', 'highlighter', 'arrow', 'eraser', 'text'].includes(action?.tool) ? action.tool : 'pen';
    const color = /^#[0-9a-f]{6}$/i.test(action?.color || '') ? action.color : '#22c55e';
    const size = Math.max(1, Math.min(60, Number(action?.size) || 5));
    if (tool === 'text') {
        return { tool, color, size, text: String(action.text || '').slice(0, 120), x: 500, y: 500 };
    }
    return { tool, color, size, points: samplePoints(Array.isArray(action?.points) ? action.points : []) };
};

export const compactLiveDrawing = (drawing, maxCharacters = 5200) => {
    let background = drawing?.background || null;
    if (background) {
        try {
            if (JSON.stringify(background).length > MAX_BACKGROUND_CHARS) background = null;
        } catch {
            background = null;
        }
    }
    const actions = (Array.isArray(drawing?.actions) ? drawing.actions : []).slice(-MAX_ACTIONS).map(compactAction);
    const snapshot = { version: 2, width: 1000, height: 1000, background, actions, caption: '' };
    while (actions.length && JSON.stringify(snapshot).length > maxCharacters) actions.shift();
    if (JSON.stringify(snapshot).length > maxCharacters) snapshot.background = null;
    return snapshot;
};
