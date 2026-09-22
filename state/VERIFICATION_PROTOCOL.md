# 12.9R Verification Protocol

## Independent verifier input
The verifier receives:
- objective and completion contract;
- authoritative ledger;
- produced artifact/result;
- durable evidence.

The verifier must not rely on the executor's claim that work is complete.

## Checks
1. Objective fidelity — result solves the stated objective.
2. Premise integrity — load-bearing premises are evidenced or marked assumptions.
3. Scope/authority — no prohibited or unapproved action.
4. Evidence — each completion criterion has direct evidence.
5. State consistency — ledger matches durable sources.
6. Recovery — unresolved failures/blockers are not hidden.
7. Owner attention — no unnecessary escalation was introduced.

## Verdicts
- PASS: all completion criteria evidenced.
- CONDITIONAL: artifact valid but named evidence/dependency remains.
- FAIL: contradiction, missing critical criterion, authority breach, or unsupported completion claim.

## Handoff test
A fresh execution context passes handoff only if, from durable state alone, it can identify:
- current objective;
- current state;
- last verified checkpoint;
- permissions/prohibitions;
- blocker/dependency;
- exact next permitted action;
- completion criteria;
without owner reconstruction.

## Red-team gate
Before expensive expansion, ask:
- Does this solve an observed failure?
- Can a simpler existing mechanism solve it?
- Does it reduce owner attention?
- Does it introduce state fragmentation?
- Is verification independent enough?
- Is rollback/recovery defined?
If benefit is not demonstrated, do not expand.
