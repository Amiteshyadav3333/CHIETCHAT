# Social Feed Ranking service

This independently deployable service owns feed-ranking policy. The API gateway
continues to own authentication, privacy/block filtering, candidate retrieval,
and serialization. It forwards at most 500 eligible candidate IDs and bounded
engagement signals using the signed internal service contract, then maps the
ranked IDs back to gateway-authorized records. If the service is unavailable,
the gateway falls back to its local ranking implementation during rollout.

The service accepts no browser traffic and does not receive captions, media,
email addresses, or other profile data. `SOCIAL_FEED_SERVICE_HMAC_KEY` must be
a stable random secret of at least 32 characters, shared only between this
service and the gateway. `/health/live` and `/health/ready` expose process and
configuration health separately.
