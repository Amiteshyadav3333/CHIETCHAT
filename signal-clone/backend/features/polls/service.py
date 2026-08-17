MAX_POLL_OPTIONS = 4


def normalize_poll_option(value):
    """Validate an option index without inspecting encrypted poll content."""
    try:
        option_idx = int(value)
    except (TypeError, ValueError):
        return None
    return option_idx if 0 <= option_idx < MAX_POLL_OPTIONS else None


def serialize_votes(votes):
    return [{'userId': vote.user_id, 'optionIdx': vote.option_idx} for vote in votes]
