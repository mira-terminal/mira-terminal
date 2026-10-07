# Deployment checkpoint

Credential-refresh verification trigger.

- Purpose: force a fresh protected Vercel preview after runtime secrets were configured.
- No production promotion.
- No credential values stored.
- Runtime surface remains read-only: /api/health and /api/ready.
