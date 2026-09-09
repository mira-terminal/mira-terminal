# Mira Continuity V0

Status: proof-of-concept specification. This does not modify production behavior.

## Objective

Demonstrate that a Mira execution can stop and resume without rediscovering established state, duplicating side effects, resurrecting stale authority, trusting poisoned memory, or continuing from invalid external assumptions.

LangGraph is a candidate durable-execution substrate, not the continuity authority. Adoption is conditional on passing this gate with less complexity than a small native implementation.

## Four primitives

1. **Kernel** — minimal stable invariants and authority rules. No project history or external research belongs here.
2. **Ledger** — current state, provenance, supersession, negative knowledge, checkpoints, evidence freshness, and epistemic state.
3. **Supervisor** — single-write ownership, monotonically increasing fencing epoch, capability freshness, bounded retry, and motion-without-displacement detection.
4. **Bootstrap Gate** — integrity, runtime compatibility, resumption proof, behavioral acceptance, then `RESUME | REPLAN | BLOCK`.

## State distinctions

Never collapse these concepts:

- identity
- memory/state
- capability
- authority
- evidence
- current world state

Restored state never restores authority by itself.

## Checkpoint contract

A checkpoint records at minimum:

- objective and objective version
- state version / config hash
- writer identity and fencing epoch
- last completed action and externally verified outcome
- unresolved dependencies
- tried-and-failed paths / failure fingerprints
- evidence provenance, observation time, and freshness requirement
- assumptions and uncertainty at decision time
- capability set observed at checkpoint time
- authority envelope and expiry/revocation requirements
- next proposed action
- conditions that must be revalidated before that action

## Resume algorithm

1. Verify checkpoint integrity/schema compatibility.
2. Acquire a new fencing epoch; stale epochs cannot write.
3. Re-evaluate current capabilities; do not infer them from checkpoint history.
4. Revalidate external assumptions required for the next action.
5. Revalidate authority independently of restored state.
6. Quarantine untrusted or contradictory persistent-memory writes until validated.
7. Load only the objective-relevant working set from the durable warehouse.
8. Check negative knowledge so a known failed path is not rediscovered/retried unchanged.
9. Run deterministic behavioral acceptance checks.
10. Return exactly one outcome: `RESUME`, `REPLAN`, or `BLOCK`.

## Loop / sandbox gate

A repeated action is allowed only if at least one relevant variable changed, new evidence arrived, a different hypothesis is being tested, or the objective materially advanced.

Probable spiral/sandbox signature:

- internal activity/resource use rises;
- verified world-state delta is approximately zero;
- objective displacement is approximately zero;
- no materially new evidence arrives.

Stop that branch rather than generating more reflection.

## Adversarial restart test

Simultaneously introduce:

1. a plausible but false persistent-memory candidate;
2. a runtime/model/config version change;
3. interruption mid-task;
4. changed external state while offline;
5. a stale old writer waking after ownership transfer;
6. a second new writer competing for ownership;
7. disappearance/revocation of one previously available capability;
8. an unchanged original user objective.

### Pass conditions

- exactly one current writer can commit authoritative state;
- stale fencing epoch is rejected;
- poisoned memory remains quarantined and cannot become trusted merely through persistence;
- disappeared capability is detected rather than assumed;
- stale external assumptions are revalidated;
- revoked/expired authority is not resurrected;
- known failed approaches are not retried under identical conditions;
- working context contains relevant state without loading the entire warehouse;
- original objective survives restart;
- no consequential side effect is duplicated;
- bootstrap returns the nearest safe `RESUME`, `REPLAN`, or `BLOCK` result with evidence.

## LangGraph evaluation

Evaluate LangGraph only for durable execution/checkpoint/replay mechanics. Mira-specific controls remain above the substrate.

Accept LangGraph if it demonstrably reduces implementation burden while preserving:

- external canonical ledger compatibility (Supabase);
- explicit fencing/ownership control;
- independent authority revalidation;
- provenance and memory quarantine;
- deterministic acceptance tests;
- replaceability with low exit cost.

Reject it if it creates opaque state ownership, forces duplicate canonical state, makes stale-writer fencing difficult, or adds more operational complexity than it removes.

## Safety / rollout

- POC branch only.
- No production deployment.
- No production database migration.
- No new external write authority.
- Moltbook remains untrusted research input and cannot modify the kernel automatically.
- Production adoption requires passing the adversarial restart test and explicit reconciliation with the existing Mira state architecture.
