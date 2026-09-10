import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import GroupCollaborationHub from './GroupCollaborationHub';

describe('GroupCollaborationHub presentation', () => {
    const mockChat = {
        id: 42,
        name: 'College Project Delta',
        isGroup: true,
        participants: [
            { id: 101, user: { id: 1, username: 'arjun' } },
            { id: 102, user: { id: 2, username: 'rohit' } }
        ]
    };

    const mockUser = {
        id: 1,
        username: 'arjun'
    };

    it('renders the Workspace Hub header with group name and badges', () => {
        const markup = renderToStaticMarkup(
            <GroupCollaborationHub
                chat={mockChat}
                currentUser={mockUser}
                token="dummy-token"
                onClose={() => {}}
                onShareToChat={() => {}}
            />
        );

        expect(markup).toContain('Workspace Hub');
        expect(markup).toContain('Collaboration');
        expect(markup).toContain('College Project Delta');
        expect(markup).toContain('2 collaborators');
    });

    it('renders the Kanban board columns (To Do, In Progress, Review, Completed)', () => {
        const markup = renderToStaticMarkup(
            <GroupCollaborationHub
                chat={mockChat}
                currentUser={mockUser}
                token="dummy-token"
                onClose={() => {}}
                onShareToChat={() => {}}
            />
        );

        expect(markup).toContain('To Do');
        expect(markup).toContain('In Progress');
        expect(markup).toContain('Review');
        expect(markup).toContain('Completed');
        expect(markup).toContain('New Task');
    });
});
