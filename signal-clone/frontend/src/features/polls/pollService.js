import axios from 'axios';

export const castPollVote = (messageId, optionIdx) => (
    axios.post(`/api/messages/${messageId}/poll-vote`, { optionIdx })
);

export const applyPollVoteUpdate = (messages, update) => {
    const targetId = update.id ?? update.messageId;
    return messages.map(message => (
        String(message.id) === String(targetId) ? { ...message, votes: update.votes } : message
    ));
};
