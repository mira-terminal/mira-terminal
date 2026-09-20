# Mira Cognitive OS — Core v0.1

This directory is the first executable slice of a Level-10-oriented cognitive architecture for Mira.

## What exists now

- **Goal contract** — objective, constraints, deliverables, success criteria, and risk class.
- **Planner interface** — converts a goal into dependency-aware specialist tasks.
- **Agent registry** — routes tasks to role-specific workers without coupling the runtime to one model/provider.
- **Working + episodic + semantic memory primitives** — intentionally in-memory in v0.1; persistence is the next storage layer.
- **World model** — versioned observations, facts, and assumptions.
- **Completion verifier** — task-level and final goal-level checks so partial execution is not silently reported as complete.
- **Recovery loop** — verification failures and execution errors are retried up to a task's bounded attempt limit.
- **Improvement log** — failed verification/execution attempts become inspectable lessons rather than disappearing.
- **Approval gates** — tasks marked consequential stop before execution until explicitly approved.

## Deliberate limitations of v0.1

This is the cognitive control plane, not yet a fully autonomous agent platform. It does not yet provide:

- durable database-backed memory,
- live LLM/provider adapters,
- parallel worker scheduling,
- browser/computer-use workers,
- sandbox lifecycle management,
- event/schedule triggers,
- policy engine for automatic risk classification,
- resumable runs after process restart,
- self-modification of production code.

Those are staged additions. The core is intentionally provider-neutral so stronger models can be swapped in later.

## Test

From the repository root after the package script is added:

```bash
npm test
```

Or directly:

```bash
node --test cognitive-os/test/*.test.js
```

## Next architecture slice

1. SQLite/Postgres run ledger and memory persistence.
2. Resumable checkpoints with immutable event history.
3. Model adapter interface and specialist worker prompts.
4. Tool permission/risk policy layer.
5. Parallel task scheduler with budgets/timeouts.
6. Browser/code/data workers.
7. Evaluation harness and controlled improvement proposals.
