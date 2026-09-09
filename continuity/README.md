# Mira Continuity V0

Experimental, non-production continuity harness.

## Run

```bash
node continuity/harness.mjs
```

The harness is intentionally deterministic and has no external writes, credentials, database migrations, or production dependencies.

## Acceptance coverage

- trusted objective survives restart
- untrusted external memory cannot enter trusted state
- fencing epoch rejects stale writer
- changed world prevents blind resume
- revoked/changed authority prevents authority resurrection
- runtime/schema change forces replanning
- identical failure without changed variable trips loop breaker
- changed variable permits one bounded retry

The next experiment is to implement the same observable contract using a durable-execution substrate (LangGraph first candidate) and compare complexity and failure behavior. The substrate is retained only if it preserves these controls without becoming the canonical Mira identity/state authority.
