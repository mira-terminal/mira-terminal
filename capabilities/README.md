# Mira capability integrations

Mira remains one executive reasoning/control identity. These projects are subordinate capabilities, not replacement agents.

| Capability | Role in Mira | Activation boundary |
| --- | --- | --- |
| `browser-use/jev-ultrafast` | Fast browser-action decision/execution | External Python/browser runtime. Mira verifies outcomes. |
| `NandhaKishorM/laya` | Fast bounded typed decisions | Routing/classification only; not final consequential judgment. |
| `google/ax` | Sandboxed multi-agent execution | Requires Kubernetes + Agent Substrate; use only as worker infrastructure. |
| `vectorize-io/hindsight` | Durable learning memory | Scoped memory only; never commit private memory into this public repo. |
| `paperclipai/paperclip` | Work orchestration, budgets, roles, tickets, governance | Separate control plane for subordinate workers; no competing Mira identity. |

## Runtime configuration

The Mira runtime exposes integration readiness at `GET /api/capabilities`.

Configuration keys are deliberately endpoint/control-plane references rather than embedded credentials:

- `JEV_RUNTIME_URL`
- `LAYA_RUNTIME_URL`
- `AX_CONTROL_PLANE`
- `HINDSIGHT_API_URL`
- `PAPERCLIP_API_URL`

The registry is fail-closed: a capability is integrated into Mira's architecture but is not reported as configured until its runtime reference is present. This prevents documentation-only adoption from being misrepresented as a live installation.

## Integration policy

1. Mira owns goals, authorization, priority, and completion criteria.
2. Subordinate components may decide or execute only within their bounded role.
3. Consequential actions require the same approval rules as any other Mira tool path.
4. Completion must be verified from an independent evidence source whenever practical.
5. External projects are pinned/evaluated before production use; upstream popularity is not a security review.
6. Personal/private state and secrets do not belong in this public repository.
