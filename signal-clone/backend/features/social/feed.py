"""Ranking rules for the public social feed.

This module is transport and database independent so the social domain can be
extracted without moving ranking policy into Flask handlers.
"""
from datetime import datetime, timezone
from math import exp, log1p


def rank_public_posts(posts, engagement_by_post, now=None, limit=50):
    """Rank eligible public posts with freshness, discussion and author reach.

    Engagement helps useful discussions surface, while a creator diversity
    penalty prevents a prolific account from occupying the entire first page.
    The API must filter privacy, blocks, and channel membership before calling.
    """
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)

    def timestamp(value):
        if not value:
            return now
        return value.replace(tzinfo=None) if value.tzinfo else value

    def base_score(post):
        age_hours = max(0.0, (now - timestamp(post.created_at)).total_seconds() / 3600)
        stats = engagement_by_post.get(post.id, {})
        discussion = max(0, int(stats.get('comments', 0)))
        likes = max(0, int(stats.get('likes', 0)))
        shares = max(0, int(stats.get('shares', 0)))
        freshness = 5.0 * exp(-age_hours / 72.0)
        engagement = min(4.0, log1p(likes + discussion * 2 + shares * 2))
        # Small-account content gets a measured exploration boost, not an
        # unlimited advantage based on premium status or follower count.
        creator_posts = max(0, int(stats.get('creator_posts', 1)))
        exploration = 1.2 / (1.0 + log1p(creator_posts))
        return freshness + engagement + exploration

    remaining = sorted(posts, key=lambda post: (base_score(post), timestamp(post.created_at), post.id), reverse=True)
    result = []
    creator_seen = {}
    while remaining and len(result) < max(0, limit):
        best_index = max(
            range(len(remaining)),
            key=lambda index: (
                base_score(remaining[index]) / (1.0 + 0.8 * creator_seen.get(remaining[index].user_id, 0)),
                timestamp(remaining[index].created_at),
                remaining[index].id,
            ),
        )
        post = remaining.pop(best_index)
        result.append(post)
        creator_seen[post.user_id] = creator_seen.get(post.user_id, 0) + 1
    return result
