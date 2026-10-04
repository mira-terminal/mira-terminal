# Orchestration Contract

## Intake
1. Resolve objective.
2. Load authoritative ledger.
3. Identify load-bearing premises.
4. Select operating state.
5. Define completion contract before substantial execution.

## Execution
- Use reversible/read-only paths first.
- Create checkpoints before consequential branches.
- Keep side effects idempotent where possible.
- Record external identifiers immediately after verified creation.
- Never treat tool return as real-world success until the relevant state is reread when reread is available.

## Specialist decision
Use a specialist/worker only if at least one applies:
- independent verification is materially stronger;
- work can run independently in parallel;
- domain-specific tooling/context is required;
- adversarial separation reduces correlated error.

Otherwise keep the task in one execution path.

## Integration
Integrator must reconcile:
- facts vs assumptions
- worker conflicts
- completion criteria
- evidence
- permissions
- unresolved risks

## Escalation
Escalate only:
- consequential owner decision;
- authorization/authentication requiring owner;
- unresolved evidence conflict;
- unavailable required capability;
- prohibited boundary would need crossing.

## Reporting
Default executive report:
current state / result
next action
deadline if any
blocker/risk if any
owner decision only if needed
