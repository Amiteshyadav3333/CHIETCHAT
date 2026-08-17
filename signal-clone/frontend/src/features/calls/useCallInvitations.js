import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

export const useCallInvitations = ({ socket, token, chatId, callType, onError = window.alert }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [contacts, setContacts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [states, setStates] = useState({});

    useEffect(() => {
        if (!isOpen || contacts.length) return undefined;
        let active = true;
        setLoading(true);
        axios.get('/api/users', { headers: { Authorization: `Bearer ${token}` } })
            .then(response => active && setContacts(response.data))
            .catch(error => active && onError(error.response?.data?.error || 'Could not load contacts'))
            .finally(() => active && setLoading(false));
        return () => { active = false; };
    }, [contacts.length, isOpen, onError, token]);

    const invite = useCallback(contact => {
        setStates(previous => ({ ...previous, [contact.id]: 'adding' }));
        socket.emit('invite_to_call', { chatId, userId: contact.id, callType });
        setStates(previous => ({ ...previous, [contact.id]: 'added' }));
        setIsOpen(false);
    }, [callType, chatId, socket]);

    return { isOpen, setIsOpen, contacts, loading, states, invite };
};
