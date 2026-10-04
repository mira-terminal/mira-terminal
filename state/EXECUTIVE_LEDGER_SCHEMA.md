# Executive State + Evidence Ledger Schema

Use one record per substantial active process.

## Identity
- process_id:
- title:
- objective:
- priority:
- owner:

## Truth
- verified_facts: [{fact, source, observed_at}]
- assumptions: [{assumption, consequence_if_false, status}]
- decisions: [{decision, authority, source, timestamp}]
- conflicts: [{claim_a, claim_b, resolution}]

## Execution
- current_state:
- completed_work:
- open_work:
- dependencies:
- deadline:
- permissions:
- prohibited_actions:
- risks:
- last_verified_checkpoint:
- next_permitted_action:

## Completion contract
- completion_criteria:
- required_evidence:
- completion_state: planned | attempted | executed | observed | verified | completed
- completion_evidence:

## Recovery
- failure_class:
- last_failure:
- preserved_work:
- recovery_path:

## Capability dependencies
For each capability:
conceptual | available | exposed | connected | authenticated | authorized | executable | verified

## Update rules
1. Latest owner correction wins.
2. Evidence must be cited to a durable source where available.
3. Generated inference never silently becomes verified fact.
4. A failed premise invalidates only dependent branches.
5. Do not erase historical evidence to make current state look cleaner.
6. "Done" requires every completion criterion and required evidence.
