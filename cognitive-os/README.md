# Mira Cognitive OS — Core v0.4

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
- **Structured model adapters** — provider-neutral model boundary with JSON normalization, validation, repair attempts, and model-route fallback.
- **Model-driven planner** — converts the complete goal contract plus memory/world context into normalized dependency-aware specialist tasks.
- **Model-backed specialists** — role-specific agents receive the original goal, task, completed work, memory, and world state without hard-wiring one provider.
- **Governed tool plane** — tools register explicit risk, permissions, effects, reversibility, and timeout metadata before agents can execute them.
- **Policy + approval layer** — low-risk work can proceed, medium/high risk pauses for one-use approval, critical risk is denied by default, and exact goal constraints can block conflicting effects.
- **Tool audit + fail-closed timeout** — action attempts are auditable without storing argument values in default audit metadata; timed-out actions abort and fail closed.

## Deliberate limitations of v0.4

This is the cognitive control plane, not yet a fully autonomous agent platform. It does not yet provide:

- transactional database-backed persistence for multi-process production workloads,
- live provider-specific API adapters (the provider-neutral model layer now exists),
- parallel worker scheduling,
- browser/computer-use workers,
- sandbox lifecycle management,
- event/schedule triggers,
- semantic/automatic risk classification beyond explicit tool metadata and deterministic policy rules,
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
2. Concrete browser/code/data/file/API tool adapters behind the governed tool plane.
3. Parallel task scheduler with budgets/timeouts.
4. Adaptive replanning and uncertainty/assumption tracking.
5. Red-team/pre-mortem cognitive loops.
6. Evaluation harness and controlled improvement proposals.
