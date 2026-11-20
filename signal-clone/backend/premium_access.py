"""Premium entitlements shared by API routes and user serialization."""
from datetime import datetime, timezone

PLAN_TIER = {'basic': 1, 'medium': 2, 'max': 3}
TIER_LIMITS = {
    0: {'socialPostsPerDay': 3, 'reelsPerDay': 3, 'feedVideoSeconds': 150, 'aiCreditsPerDay': 30, 'articleCharacters': 0},
    1: {'socialPostsPerDay': 10, 'reelsPerDay': 5, 'feedVideoSeconds': 300, 'aiCreditsPerDay': 60, 'articleCharacters': 0},
    2: {'socialPostsPerDay': 30, 'reelsPerDay': 10, 'feedVideoSeconds': 900, 'aiCreditsPerDay': 150, 'articleCharacters': 20000},
    3: {'socialPostsPerDay': 100, 'reelsPerDay': 25, 'feedVideoSeconds': 1800, 'aiCreditsPerDay': None, 'articleCharacters': 50000},
}
TIER_FEATURES = {
    0: [],
    1: ['Verified creator badge', 'Social post analytics', '10 posts per day', '5 Reels per day', '5-minute feed videos', '60 AI credits per day', 'Ad-free experience'],
    2: ['Everything in Basic', '30 posts per day', '10 Reels per day', '15-minute feed videos', 'Reels analytics', 'Boosted replies', 'Long-form articles up to 20,000 characters', '150 AI credits per day'],
    3: ['Everything in Medium', '100 posts per day', '25 Reels per day', '30-minute feed videos', 'Paid posts and Reels', 'Long-form articles up to 50,000 characters', 'Unlimited AI credits'],
}


def premium_tier(user):
    if not user or not user.is_premium:
        return 0
    expiry = getattr(user, 'premium_expires_at', None)
    if expiry and expiry <= datetime.now(timezone.utc).replace(tzinfo=None):
        return 0
    code = str(getattr(user, 'premium_plan_code', '') or '').strip().lower()
    if not code:
        return 3  # Referral-unlocked and legacy Premium accounts retain full access.
    return PLAN_TIER.get(code.split('_', 1)[0], 1)


def premium_limits(user_or_tier):
    tier = user_or_tier if isinstance(user_or_tier, int) else premium_tier(user_or_tier)
    return dict(TIER_LIMITS.get(tier, TIER_LIMITS[0]))


def premium_features(tier):
    return list(TIER_FEATURES.get(int(tier or 0), []))
