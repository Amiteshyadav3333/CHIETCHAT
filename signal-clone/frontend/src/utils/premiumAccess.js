export const getPremiumTier = user => {
    if (!user?.isPremium) return 0;
    if (Number.isInteger(user.premiumTier)) return user.premiumTier;
    const plan = String(user.premiumPlanCode || '').toLowerCase();
    if (!plan) return 3;
    const tier = plan.split('_')[0];
    return tier === 'basic' ? 1 : tier === 'medium' ? 2 : tier === 'max' ? 3 : 1;
};

export const getPremiumTierForPlan = planCode => {
    const tier = String(planCode || '').toLowerCase().split('_')[0];
    return tier === 'basic' ? 1 : tier === 'medium' ? 2 : tier === 'max' ? 3 : 0;
};

export const PREMIUM_LIMITS = {
    0: { socialPostsPerDay: 3, reelsPerDay: 3, feedVideoSeconds: 150, articleCharacters: 0 },
    1: { socialPostsPerDay: 10, reelsPerDay: 5, feedVideoSeconds: 300, articleCharacters: 0 },
    2: { socialPostsPerDay: 30, reelsPerDay: 10, feedVideoSeconds: 900, articleCharacters: 20000 },
    3: { socialPostsPerDay: 100, reelsPerDay: 25, feedVideoSeconds: 1800, articleCharacters: 50000 },
};

export const getPremiumLimits = tier => PREMIUM_LIMITS[tier] || PREMIUM_LIMITS[0];
