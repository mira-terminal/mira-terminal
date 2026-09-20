# Mira Cognitive OS — Core v0.2

This directory is the first executable slice of a Level-10-oriented cognitive architecture for Mira.

## What exists now

- **Goal contract** — objective, constraints, deliverables, success criteria, and risk class.
- **Planner interface** — converts a goal into dependency-aware specialist tasks.
- **Agent registry** — routes tasks to role-specific workers without coupling the runtime to one model/provider.
- **Working + episodic + semantic memory primitives** — working/episodic/semantic memory can now be checkpointed with a run.
- **World model** — versioned observations, facts, and assumptions.
- **Completion verifier** — task-level and final goal-level checks so partial execution is not silently reported as complete.
- **Recovery loop** — verification failures and execution errors are retried up to a task's bounded attempt limit.
- **Improvement log** — failed verification/execution attempts become inspectable lessons rather than disappearing.
- **Approval gates** — tasks marked consequential stop before execution until explicitly approved.
- **Durable run checkpoints** — file or in-memory run stores persist task state and cognitive snapshots.
- **Append-only event journal** — run lifecycle events can be inspected independently of the latest snapshot.
- **Restart/resume** — a new runtime can reload a stopped run, restore cognitive state, preserve completed work, and continue after approval.

## Deliberate limitations of v0.1

This is the cognitive control plane, not yet a fully autonomous agent platform. It does not yet provide:

- transactional database-backed persistence for multi-process production workloads,
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

1. Postgres/Supabase persistence adapter with concurrency control.
2. Model adapter interface and specialist worker prompts.
3. Tool permission/risk policy layer.
4. Parallel task scheduler with budgets/timeouts.
5. Browser/code/data workers.
6. Evaluation harness and controlled improvement proposals.
