# Mira Cognitive Architecture

## Control loop

```text
Goal Contract
    ↓
World State + Memory
    ↓
Planner
    ↓
Dependency Graph
    ↓
Risk / Approval Gate
    ↓
Specialist Agent Registry
    ↓
Execution Result
    ↓
Task Verification ──fail──> bounded retry / recovery lesson
    ↓ pass
World + Memory Update
    ↓
Final Goal Verification ──fail──> incomplete/failed, never false-complete
    ↓ pass
Completed Run + Episode
```

## Design principles

1. **Truth over completion theater.** A run is complete only after verification.
2. **The original goal remains authoritative.** Agents cannot silently narrow deliverables or constraints.
3. **Model independence.** Models are interchangeable workers, not the operating system itself.
4. **State is explicit.** Goals, tasks, dependencies, attempts, blockers, observations, and verification are structured data.
5. **Failure is information.** Failed attempts become improvement data.
6. **Consequential actions are governed.** Approval gates occur before execution.
7. **Memory has types.** Working state, episodes, and durable semantic knowledge are separated.
8. **World-state changes are versioned.** Planning can later re-evaluate based on new observations.

## Road to Level 10

### v0.1 — Cognitive kernel (current)
Goal/state/memory/planning/orchestration/verification/recovery/governance primitives.

### v0.2 — Persistence (current)
Durable file/in-memory run ledger, append-only event journal, cognitive snapshots, checkpoint/resume, and no-repeat continuation of completed work.

### v0.2.1 — Production persistence
Postgres/Supabase adapter, optimistic concurrency, run leases, and multi-worker safety.

### v0.3 — Intelligence adapters
Provider-neutral LLM interface, model routing, specialist roles, structured-output enforcement.

### v0.4 — Tool execution plane
Browser, code sandbox, web research, files, APIs, database and connector adapters with permissions.

### v0.5 — Adaptive cognition
Replanning from changed world state, uncertainty tracking, assumption challenges, alternative-plan generation, pre-mortem/red-team loops.

### v0.6 — Evaluation + controlled improvement
Regression suite, task benchmarks, execution traces, candidate workflow improvements, sandbox evaluation, gated promotion.

### v1.0 — Persistent cognitive operating system
Long-horizon resumable objectives, multi-agent execution, durable institutional memory, policy-aware autonomy, and verified completion.
