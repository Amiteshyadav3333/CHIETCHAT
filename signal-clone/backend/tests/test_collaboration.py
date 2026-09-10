import os
os.environ['DATABASE_URL'] = 'sqlite:///:memory:'
os.environ['TESTING'] = '1'

import datetime
from app import app
from models import db, User, Chat, ChatParticipant, CollaborationTask, CollaborationNote, CollaborationMilestone
from routes.collaboration_bp import serialize_task, serialize_note, serialize_milestone
import routes.collaboration_bp as collab_module


def test_collaboration_serializers():
    with app.app_context():
        db.create_all()
        user = User(username='test_ser_user', email='ser@example.com', phone='1112223334', password_hash='dummy')
        chat = Chat(is_group=True, name='Project Falcon')
        db.session.add_all([user, chat])
        db.session.commit()

        task = CollaborationTask(
            chat_id=chat.id,
            creator_id=user.id,
            title='Build Frontend',
            description='React components for Kanban',
            status='in_progress',
            priority='high',
            due_date=datetime.datetime(2026, 9, 15, 12, 0, 0),
        )
        note = CollaborationNote(
            chat_id=chat.id,
            creator_id=user.id,
            title='Meeting Minutes',
            content='Discussed project milestones.',
        )
        milestone = CollaborationMilestone(
            chat_id=chat.id,
            creator_id=user.id,
            title='Beta Launch',
            is_completed=False,
            target_date=datetime.datetime(2026, 10, 1, 0, 0, 0),
        )
        db.session.add_all([task, note, milestone])
        db.session.commit()

        s_task = serialize_task(task)
        assert s_task['title'] == 'Build Frontend'
        assert s_task['status'] == 'in_progress'
        assert s_task['priority'] == 'high'
        assert '2026-09-15' in s_task['dueDate']

        s_note = serialize_note(note)
        assert s_note['title'] == 'Meeting Minutes'
        assert s_note['content'] == 'Discussed project milestones.'

        s_milestone = serialize_milestone(milestone)
        assert s_milestone['title'] == 'Beta Launch'
        assert s_milestone['isCompleted'] is False
        assert '2026-10-01' in s_milestone['targetDate']


def test_collaboration_api_flow(monkeypatch):
    with app.app_context():
        db.create_all()
        # Setup test group chat and users
        alice = User(username='alice_collab', email='alice@collab.com', phone='5551110001', password_hash='dummy')
        bob = User(username='bob_collab', email='bob@collab.com', phone='5551110002', password_hash='dummy')
        chat = Chat(is_group=True, name='Hackathon Squad', group_admin_id=None)
        db.session.add_all([alice, bob, chat])
        db.session.commit()

        chat.group_admin_id = alice.id
        p1 = ChatParticipant(chat_id=chat.id, user_id=alice.id)
        p2 = ChatParticipant(chat_id=chat.id, user_id=bob.id)
        db.session.add_all([p1, p2])
        db.session.commit()

        chat_id = chat.id
        alice_id = alice.id
        bob_id = bob.id

    client = app.test_client()

    # 1. Unauthenticated request should return 401
    monkeypatch.setattr(collab_module, 'get_current_user_id', lambda: None)
    res = client.get(f'/api/chats/{chat_id}/collaboration/tasks')
    assert res.status_code == 401

    # 2. Authenticated as Alice: Create a Task
    monkeypatch.setattr(collab_module, 'get_current_user_id', lambda: alice_id)
    res = client.post(f'/api/chats/{chat_id}/collaboration/tasks', json={
        'title': 'Design Wireframes',
        'description': 'Figma designs for dashboard',
        'priority': 'high',
        'status': 'todo',
        'assigneeId': bob_id,
        'dueDate': '2026-09-20T18:00:00Z'
    })
    assert res.status_code == 201
    task_data = res.get_json()['task']
    task_id = task_data['id']
    assert task_data['title'] == 'Design Wireframes'
    assert task_data['assigneeId'] == bob_id

    # 3. Update task status to in_progress
    res = client.patch(f'/api/chats/{chat_id}/collaboration/tasks/{task_id}', json={
        'status': 'in_progress'
    })
    assert res.status_code == 200
    assert res.get_json()['task']['status'] == 'in_progress'

    # 4. Fetch tasks
    res = client.get(f'/api/chats/{chat_id}/collaboration/tasks')
    assert res.status_code == 200
    tasks = res.get_json()['tasks']
    assert any(t['id'] == task_id for t in tasks)

    # 5. Shared Notes CRUD
    res = client.post(f'/api/chats/{chat_id}/collaboration/notes', json={
        'title': 'Sprint 1 Plan',
        'content': '1. Auth\n2. Realtime\n3. Collaboration'
    })
    assert res.status_code == 201
    note_id = res.get_json()['note']['id']

    res = client.put(f'/api/chats/{chat_id}/collaboration/notes/{note_id}', json={
        'title': 'Sprint 1 Plan (Updated)',
        'content': 'Updated content'
    })
    assert res.status_code == 200
    assert res.get_json()['note']['title'] == 'Sprint 1 Plan (Updated)'

    # 6. Milestones CRUD
    res = client.post(f'/api/chats/{chat_id}/collaboration/milestones', json={
        'title': 'Demo Day',
        'targetDate': '2026-09-30T10:00:00Z'
    })
    assert res.status_code == 201
    milestone_id = res.get_json()['milestone']['id']

    res = client.patch(f'/api/chats/{chat_id}/collaboration/milestones/{milestone_id}', json={
        'isCompleted': True
    })
    assert res.status_code == 200
    assert res.get_json()['milestone']['isCompleted'] is True

    # 7. Delete Task, Note, Milestone
    del_res = client.delete(f'/api/chats/{chat_id}/collaboration/tasks/{task_id}')
    assert del_res.status_code == 200
    del_res = client.delete(f'/api/chats/{chat_id}/collaboration/notes/{note_id}')
    assert del_res.status_code == 200
    del_res = client.delete(f'/api/chats/{chat_id}/collaboration/milestones/{milestone_id}')
    assert del_res.status_code == 200
