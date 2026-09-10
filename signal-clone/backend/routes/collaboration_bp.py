import datetime
from flask import Blueprint, jsonify, request
from models import (
    db, Chat, ChatParticipant, User,
    CollaborationTask, CollaborationNote, CollaborationMilestone
)
from extensions import socketio
from utils import get_current_user_id, user_can_access_chat, utc_now, get_json_data

collaboration_bp = Blueprint('collaboration_bp', __name__)


def _broadcast_collab_event(chat_id, action, item_type, data):
    """Notify all group members via WebSocket."""
    payload = {
        'chatId': chat_id,
        'action': action,       # 'created' | 'updated' | 'deleted'
        'itemType': item_type,   # 'task' | 'note' | 'milestone'
        'data': data
    }
    try:
        # Emit to the chat room
        socketio.emit('collab_event', payload, to=str(chat_id))
        # Also emit to individual participants' rooms for instant background sync
        participants = ChatParticipant.query.filter_by(chat_id=chat_id).all()
        for p in participants:
            socketio.emit('collab_event', payload, to=f'user_{p.user_id}')
    except Exception:
        # Socket emission failure should never crash the HTTP response
        pass


def serialize_task(task):
    return {
        'id': task.id,
        'chatId': task.chat_id,
        'creatorId': task.creator_id,
        'creatorName': task.creator.username if task.creator else 'Unknown',
        'assigneeId': task.assignee_id,
        'assignee': {
            'id': task.assignee.id,
            'username': task.assignee.username,
            'avatar': task.assignee.avatar,
        } if task.assignee else None,
        'title': task.title,
        'description': task.description or '',
        'status': task.status,
        'priority': task.priority,
        'dueDate': task.due_date.isoformat() + 'Z' if task.due_date else None,
        'createdAt': task.created_at.isoformat() + 'Z' if task.created_at else None,
        'updatedAt': task.updated_at.isoformat() + 'Z' if task.updated_at else None,
    }


def serialize_note(note):
    return {
        'id': note.id,
        'chatId': note.chat_id,
        'creatorId': note.creator_id,
        'creatorName': note.creator.username if note.creator else 'Unknown',
        'updatedById': note.updated_by_id,
        'updatedByName': note.updated_by.username if note.updated_by else None,
        'title': note.title,
        'content': note.content or '',
        'createdAt': note.created_at.isoformat() + 'Z' if note.created_at else None,
        'updatedAt': note.updated_at.isoformat() + 'Z' if note.updated_at else None,
    }


def serialize_milestone(milestone):
    return {
        'id': milestone.id,
        'chatId': milestone.chat_id,
        'creatorId': milestone.creator_id,
        'creatorName': milestone.creator.username if milestone.creator else 'Unknown',
        'title': milestone.title,
        'description': milestone.description or '',
        'targetDate': milestone.target_date.isoformat() + 'Z' if milestone.target_date else None,
        'isCompleted': bool(milestone.is_completed),
        'createdAt': milestone.created_at.isoformat() + 'Z' if milestone.created_at else None,
    }


# ==========================================
# TASKS & KANBAN ENDPOINTS
# ==========================================

@collaboration_bp.route('/api/chats/<int:chat_id>/collaboration/tasks', methods=['GET'])
def get_tasks(chat_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    if not user_can_access_chat(user_id, chat_id):
        return jsonify({'error': 'Forbidden'}), 403

    tasks = CollaborationTask.query.filter_by(chat_id=chat_id).order_by(CollaborationTask.created_at.desc()).all()
    return jsonify({'tasks': [serialize_task(t) for t in tasks]}), 200


@collaboration_bp.route('/api/chats/<int:chat_id>/collaboration/tasks', methods=['POST'])
def create_task(chat_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    if not user_can_access_chat(user_id, chat_id):
        return jsonify({'error': 'Forbidden'}), 403

    data = get_json_data()
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'error': 'Title is required'}), 400

    description = str(data.get('description', '')).strip()[:5000]
    status = data.get('status', 'todo')
    if status not in ['todo', 'in_progress', 'review', 'done']:
        status = 'todo'

    priority = data.get('priority', 'medium')
    if priority not in ['low', 'medium', 'high', 'urgent']:
        priority = 'medium'

    assignee_id = data.get('assigneeId')
    if assignee_id:
        # Validate assignee is participant of chat
        assignee_participant = ChatParticipant.query.filter_by(chat_id=chat_id, user_id=assignee_id).first()
        if not assignee_participant:
            assignee_id = None

    due_date = None
    if data.get('dueDate'):
        try:
            parsed = datetime.datetime.fromisoformat(str(data['dueDate']).replace('Z', '+00:00'))
            due_date = parsed.astimezone(datetime.timezone.utc).replace(tzinfo=None)
        except (ValueError, TypeError):
            due_date = None

    task = CollaborationTask(
        chat_id=chat_id,
        creator_id=user_id,
        assignee_id=assignee_id,
        title=title[:250],
        description=description,
        status=status,
        priority=priority,
        due_date=due_date,
        created_at=utc_now(),
        updated_at=utc_now()
    )
    db.session.add(task)
    db.session.commit()

    serialized = serialize_task(task)
    _broadcast_collab_event(chat_id, 'created', 'task', serialized)
    return jsonify({'task': serialized}), 201


@collaboration_bp.route('/api/chats/<int:chat_id>/collaboration/tasks/<int:task_id>', methods=['PATCH'])
def update_task(chat_id, task_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    if not user_can_access_chat(user_id, chat_id):
        return jsonify({'error': 'Forbidden'}), 403

    task = CollaborationTask.query.filter_by(id=task_id, chat_id=chat_id).first()
    if not task:
        return jsonify({'error': 'Task not found'}), 404

    data = get_json_data()

    if 'title' in data:
        title = str(data['title']).strip()
        if title:
            task.title = title[:250]

    if 'description' in data:
        task.description = str(data['description']).strip()[:5000]

    if 'status' in data and data['status'] in ['todo', 'in_progress', 'review', 'done']:
        task.status = data['status']

    if 'priority' in data and data['priority'] in ['low', 'medium', 'high', 'urgent']:
        task.priority = data['priority']

    if 'assigneeId' in data:
        assignee_id = data['assigneeId']
        if assignee_id is None:
            task.assignee_id = None
        else:
            participant = ChatParticipant.query.filter_by(chat_id=chat_id, user_id=assignee_id).first()
            if participant:
                task.assignee_id = assignee_id

    if 'dueDate' in data:
        if not data['dueDate']:
            task.due_date = None
        else:
            try:
                parsed = datetime.datetime.fromisoformat(str(data['dueDate']).replace('Z', '+00:00'))
                task.due_date = parsed.astimezone(datetime.timezone.utc).replace(tzinfo=None)
            except (ValueError, TypeError):
                pass

    task.updated_at = utc_now()
    db.session.commit()

    serialized = serialize_task(task)
    _broadcast_collab_event(chat_id, 'updated', 'task', serialized)
    return jsonify({'task': serialized}), 200


@collaboration_bp.route('/api/chats/<int:chat_id>/collaboration/tasks/<int:task_id>', methods=['DELETE'])
def delete_task(chat_id, task_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    if not user_can_access_chat(user_id, chat_id):
        return jsonify({'error': 'Forbidden'}), 403

    task = CollaborationTask.query.filter_by(id=task_id, chat_id=chat_id).first()
    if not task:
        return jsonify({'error': 'Task not found'}), 404

    # Allow creator or group admin to delete
    chat = db.session.get(Chat, chat_id)
    is_admin = (chat and chat.group_admin_id == user_id)
    if task.creator_id != user_id and not is_admin:
        return jsonify({'error': 'Only the task creator or group admin can delete this task'}), 403

    db.session.delete(task)
    db.session.commit()

    _broadcast_collab_event(chat_id, 'deleted', 'task', {'id': task_id})
    return jsonify({'success': True, 'id': task_id}), 200


# ==========================================
# SHARED NOTES & DOCS ENDPOINTS
# ==========================================

@collaboration_bp.route('/api/chats/<int:chat_id>/collaboration/notes', methods=['GET'])
def get_notes(chat_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    if not user_can_access_chat(user_id, chat_id):
        return jsonify({'error': 'Forbidden'}), 403

    notes = CollaborationNote.query.filter_by(chat_id=chat_id).order_by(CollaborationNote.updated_at.desc()).all()
    return jsonify({'notes': [serialize_note(n) for n in notes]}), 200


@collaboration_bp.route('/api/chats/<int:chat_id>/collaboration/notes', methods=['POST'])
def create_note(chat_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    if not user_can_access_chat(user_id, chat_id):
        return jsonify({'error': 'Forbidden'}), 403

    data = get_json_data()
    title = (data.get('title') or 'Untitled Note').strip()[:250]
    content = str(data.get('content', ''))[:100_000]

    note = CollaborationNote(
        chat_id=chat_id,
        creator_id=user_id,
        updated_by_id=user_id,
        title=title or 'Untitled Note',
        content=content,
        created_at=utc_now(),
        updated_at=utc_now()
    )
    db.session.add(note)
    db.session.commit()

    serialized = serialize_note(note)
    _broadcast_collab_event(chat_id, 'created', 'note', serialized)
    return jsonify({'note': serialized}), 201


@collaboration_bp.route('/api/chats/<int:chat_id>/collaboration/notes/<int:note_id>', methods=['PUT', 'PATCH'])
def update_note(chat_id, note_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    if not user_can_access_chat(user_id, chat_id):
        return jsonify({'error': 'Forbidden'}), 403

    note = CollaborationNote.query.filter_by(id=note_id, chat_id=chat_id).first()
    if not note:
        return jsonify({'error': 'Note not found'}), 404

    data = get_json_data()
    if 'title' in data:
        note.title = (data['title'] or 'Untitled Note').strip()[:250]
    if 'content' in data:
        note.content = str(data['content'])[:100_000]

    note.updated_by_id = user_id
    note.updated_at = utc_now()
    db.session.commit()

    serialized = serialize_note(note)
    _broadcast_collab_event(chat_id, 'updated', 'note', serialized)
    return jsonify({'note': serialized}), 200


@collaboration_bp.route('/api/chats/<int:chat_id>/collaboration/notes/<int:note_id>', methods=['DELETE'])
def delete_note(chat_id, note_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    if not user_can_access_chat(user_id, chat_id):
        return jsonify({'error': 'Forbidden'}), 403

    note = CollaborationNote.query.filter_by(id=note_id, chat_id=chat_id).first()
    if not note:
        return jsonify({'error': 'Note not found'}), 404

    chat = db.session.get(Chat, chat_id)
    is_admin = (chat and chat.group_admin_id == user_id)
    if note.creator_id != user_id and not is_admin:
        return jsonify({'error': 'Only the author or group admin can delete this note'}), 403

    db.session.delete(note)
    db.session.commit()

    _broadcast_collab_event(chat_id, 'deleted', 'note', {'id': note_id})
    return jsonify({'success': True, 'id': note_id}), 200


# ==========================================
# MILESTONES & TIMELINE ENDPOINTS
# ==========================================

@collaboration_bp.route('/api/chats/<int:chat_id>/collaboration/milestones', methods=['GET'])
def get_milestones(chat_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    if not user_can_access_chat(user_id, chat_id):
        return jsonify({'error': 'Forbidden'}), 403

    milestones = CollaborationMilestone.query.filter_by(chat_id=chat_id).order_by(CollaborationMilestone.target_date.asc().nullslast()).all()
    return jsonify({'milestones': [serialize_milestone(m) for m in milestones]}), 200


@collaboration_bp.route('/api/chats/<int:chat_id>/collaboration/milestones', methods=['POST'])
def create_milestone(chat_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    if not user_can_access_chat(user_id, chat_id):
        return jsonify({'error': 'Forbidden'}), 403

    data = get_json_data()
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'error': 'Title is required'}), 400

    description = str(data.get('description', '')).strip()[:2000]
    target_date = None
    if data.get('targetDate'):
        try:
            parsed = datetime.datetime.fromisoformat(str(data['targetDate']).replace('Z', '+00:00'))
            target_date = parsed.astimezone(datetime.timezone.utc).replace(tzinfo=None)
        except (ValueError, TypeError):
            target_date = None

    milestone = CollaborationMilestone(
        chat_id=chat_id,
        creator_id=user_id,
        title=title[:250],
        description=description,
        target_date=target_date,
        is_completed=bool(data.get('isCompleted', False)),
        created_at=utc_now()
    )
    db.session.add(milestone)
    db.session.commit()

    serialized = serialize_milestone(milestone)
    _broadcast_collab_event(chat_id, 'created', 'milestone', serialized)
    return jsonify({'milestone': serialized}), 201


@collaboration_bp.route('/api/chats/<int:chat_id>/collaboration/milestones/<int:milestone_id>', methods=['PATCH'])
def update_milestone(chat_id, milestone_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    if not user_can_access_chat(user_id, chat_id):
        return jsonify({'error': 'Forbidden'}), 403

    milestone = CollaborationMilestone.query.filter_by(id=milestone_id, chat_id=chat_id).first()
    if not milestone:
        return jsonify({'error': 'Milestone not found'}), 404

    data = get_json_data()
    if 'title' in data:
        title = str(data['title']).strip()
        if title:
            milestone.title = title[:250]
    if 'description' in data:
        milestone.description = str(data['description']).strip()[:2000]
    if 'isCompleted' in data:
        milestone.is_completed = bool(data['isCompleted'])
    if 'targetDate' in data:
        if not data['targetDate']:
            milestone.target_date = None
        else:
            try:
                parsed = datetime.datetime.fromisoformat(str(data['targetDate']).replace('Z', '+00:00'))
                milestone.target_date = parsed.astimezone(datetime.timezone.utc).replace(tzinfo=None)
            except (ValueError, TypeError):
                pass

    db.session.commit()

    serialized = serialize_milestone(milestone)
    _broadcast_collab_event(chat_id, 'updated', 'milestone', serialized)
    return jsonify({'milestone': serialized}), 200


@collaboration_bp.route('/api/chats/<int:chat_id>/collaboration/milestones/<int:milestone_id>', methods=['DELETE'])
def delete_milestone(chat_id, milestone_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    if not user_can_access_chat(user_id, chat_id):
        return jsonify({'error': 'Forbidden'}), 403

    milestone = CollaborationMilestone.query.filter_by(id=milestone_id, chat_id=chat_id).first()
    if not milestone:
        return jsonify({'error': 'Milestone not found'}), 404

    chat = db.session.get(Chat, chat_id)
    is_admin = (chat and chat.group_admin_id == user_id)
    if milestone.creator_id != user_id and not is_admin:
        return jsonify({'error': 'Only creator or group admin can delete milestone'}), 403

    db.session.delete(milestone)
    db.session.commit()

    _broadcast_collab_event(chat_id, 'deleted', 'milestone', {'id': milestone_id})
    return jsonify({'success': True, 'id': milestone_id}), 200
