export const MAX_CALL_PARTICIPANTS = 10;

export const shouldUseEqualCallGrid = ({ participantCount, minimized }) => (
    participantCount >= 3 && !minimized
);

export const callGridColumns = participantCount => (
    participantCount <= 4 ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-3'
);
