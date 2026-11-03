# AI Generation Service

Private provider-execution service for bounded text-generation requests. It
validates a short-lived signed gateway assertion, applies strict request limits,
and tries configured Gemini, Groq, Grok, then OpenAI providers. It does not own
conversation history or user records; the API gateway remains responsible for
authentication, memory, product policy, and the public `/api/ai/*` contracts.

Required runtime configuration: `AI_GENERATION_SERVICE_HMAC_KEY` (at least 32
random characters). Set provider API keys only in this service's secret store.
The public gateway can call `/internal/v1/ai/generate` only over the private
service connection with the matching HMAC key. Readiness checks contract-secret
configuration; provider keys are optional because fallback providers may be
available instead.
