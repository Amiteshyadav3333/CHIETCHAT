import unittest
from datetime import datetime, timedelta
from types import SimpleNamespace

from features.social.feed import rank_public_posts


class SocialFeedRankingTests(unittest.TestCase):
    def test_discussion_activity_and_freshness_rank_public_posts(self):
        now = datetime(2026, 11, 4, 12)
        fresh_discussion = SimpleNamespace(id=1, user_id=1, created_at=now - timedelta(hours=1))
        stale = SimpleNamespace(id=2, user_id=2, created_at=now - timedelta(days=10))
        ranked = rank_public_posts(
            [stale, fresh_discussion],
            {1: {'comments': 3, 'likes': 4}, 2: {'comments': 1}},
            now=now,
            limit=2,
        )
        self.assertEqual([post.id for post in ranked], [1, 2])

    def test_creator_diversity_prevents_one_user_filling_first_page(self):
        now = datetime(2026, 11, 4, 12)
        posts = [
            SimpleNamespace(id=1, user_id=1, created_at=now),
            SimpleNamespace(id=2, user_id=1, created_at=now - timedelta(minutes=1)),
            SimpleNamespace(id=3, user_id=1, created_at=now - timedelta(minutes=2)),
            SimpleNamespace(id=4, user_id=2, created_at=now - timedelta(minutes=10)),
        ]
        ranked = rank_public_posts(posts, {}, now=now, limit=3)
        self.assertEqual(ranked[0].user_id, 1)
        self.assertEqual(ranked[1].user_id, 2)

    def test_limit_is_respected_and_negative_limit_returns_empty(self):
        now = datetime(2026, 11, 4, 12)
        posts = [SimpleNamespace(id=i, user_id=i, created_at=now) for i in range(5)]
        self.assertEqual(len(rank_public_posts(posts, {}, now=now, limit=2)), 2)
        self.assertEqual(rank_public_posts(posts, {}, now=now, limit=-1), [])


if __name__ == '__main__':
    unittest.main()
