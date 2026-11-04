import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import ContactList from './ContactList';

describe('locked chat list entries', () => {
    it('hides the contact name and last-message preview until the chat is unlocked', () => {
        const html = renderToStaticMarkup(<ContactList
            chats={[{
                id: 7,
                isGroup: false,
                isLockedPlaceholder: true,
                name: 'Locked chat',
                participants: [],
                lastMessage: null,
                unreadCount: 0,
            }]}
            activeChat={null}
            onSelectChat={vi.fn()}
            loading={false}
        />);

        expect(html).toContain('Locked chat');
        expect(html).toContain('Enter PIN to view this conversation');
        expect(html).not.toContain('lastMessage');
    });
});
