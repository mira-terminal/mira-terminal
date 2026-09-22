# Pilot Ledger — North American Racing Pigeon / P1C

process_id: pigeon-p1c
objective: Provision the already-authorized isolated pilot resources without publication, access widening, migrations, fixtures, real data, protected-environment changes or a new paid commitment.
priority: high
owner: user

## Verified facts
- Repository: mira-terminal/north-american-racing-pigeon.
- main baseline: P1B merge 63b63185a2e37e8aad5525337f74d892d9007900.
- Issue #47 is open and P1C incomplete.
- PR #48 is open and unmerged.
- Existing pilot Site: appgprj_6aad5de4fed08191a6cc25e38bfb47de.
- Last recorded pilot state: version0, owner-only/private, unpublished, no live/preview URL.
- No D1 binding has been verified as created.
- Reserved DB idempotency key: P1C:create:test-db:issue47:v1; recorded unused.
- Latest control path requires MIRA DECISION seq55 -> WORK ACK before further resource action.
- Failed unattended Google verification route must not be retried/bypassed.
- External alpha remains NO-GO.

Evidence: GitHub Issue #47 and PR #48, read 2026-09-21 through connected GitHub.

## Current state
BLOCKED on supported authenticated owner-session access to the existing pilot management/settings surface.

## Permissions
Allowed only within existing authorization: inspect supported authenticated management/settings for this exact pilot and, after required ACK, create exactly one empty D1 binding only if an explicit no-publication path exists.

## Prohibited actions
No new Site; source push/save-version; deploy/publication; access widening; tester identities/contact; migrations; fixtures/data; real data; production credentials/linkage; v49/v5 changes; production DB/DNS changes; language approval; alpha launch; new paid commitment.

## Next permitted action
Using a supported authenticated owner session, re-read seq55, append required WORK ACK in the established control process, inspect only the existing pilot management/settings surface for explicit no-publication Add storage/D1.

If unavailable or coupled to prohibited action: record BLOCKED/NEEDS_DECISION and stop.

## Completion contract
P1C is completed only after:
1. existing isolated pilot Site is verified;
2. exactly one empty isolated test D1 binding exists;
3. privacy/isolation/no-publication boundaries are re-read and verified;
4. no prohibited action occurred;
5. durable completion evidence is recorded;
6. independent review passes.

completion_state: observed (Site) / not executed (D1) / not completed (P1C)
