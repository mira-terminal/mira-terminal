# Mira 12.9R Capability Registry — Initial Baseline

Date: 2026-09-21
Rule: this registry records only what has been observed in the current architecture audit.

| Capability | Observed state | Evidence / limitation |
|---|---|---|
| GPT reasoning | executable | Current conversation runtime |
| Web research | executable | Current tool surface |
| Python/code execution | executable | Current tool surface |
| File generation | executable | Current tool surface |
| Project/memory context | available | Useful but not authoritative state |
| GitHub | connected + authenticated + executable + verified | Read private pigeon repo; created this isolated development branch |
| Gmail | connected + authenticated + read-executable + verified | INBOX label read succeeded during 12.9R audit; no mutation performed |
| Google Calendar | connected + authenticated + read-executable + verified | Calendar-list read succeeded; no mutation performed |
| Google Drive | connected + authenticated + read-executable + verified | Bounded one-result metadata search succeeded; no mutation performed |
| Vercel | connected + authenticated + read-executable + verified | Team-list read succeeded; no deployment/mutation performed |
| Supabase | connected + authenticated + read-executable + verified | Project-list read succeeded; no database/project mutation performed |
| Automations | available | Not exercised in this audit |
| ChatGPT Work | available product execution environment | Separate runtime; handoff test still required |
| Computer/browser operation | environment-dependent | Do not infer attached authenticated owner session |
| Parallel specialist workers | environment-dependent | Not yet promoted for 12.9R |
| Durable Git-backed ledger | executable | This branch is the first implementation |
| Continuous autonomous runtime | unavailable in ordinary chat | Requires supported execution/automation substrate |

## Promotion rule
Never upgrade a row because documentation says a capability exists. Upgrade only after a scoped successful observation in the relevant environment.
