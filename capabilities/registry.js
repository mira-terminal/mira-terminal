const definitions = [
  {
    id: "jev-ultrafast",
    upstream: "browser-use/jev-ultrafast",
    role: "browser-action decision and execution",
    mode: "external-python-runtime",
    env: ["JEV_RUNTIME_URL"],
    boundary: "Use only as a subordinate browser executor; Mira retains planning, authorization, and outcome verification.",
  },
  {
    id: "laya",
    upstream: "NandhaKishorM/laya",
    role: "fast typed choice, score, and yes/no decisions",
    mode: "external-service-or-local-runtime",
    env: ["LAYA_RUNTIME_URL"],
    boundary: "Use for bounded System-1 classification/routing only; consequential judgment remains with Mira.",
  },
  {
    id: "ax",
    upstream: "google/ax",
    role: "sandboxed multi-agent orchestration",
    mode: "kubernetes-control-plane",
    env: ["AX_CONTROL_PLANE"],
    boundary: "Use as execution infrastructure for isolated workers; it does not replace Mira's control or approval layer.",
  },
  {
    id: "hindsight",
    upstream: "vectorize-io/hindsight",
    role: "durable learning memory",
    mode: "external-service-or-self-hosted",
    env: ["HINDSIGHT_API_URL"],
    boundary: "Store only scoped, policy-approved memory. Personal/private memory must not be committed to this public repository.",
  },
  {
    id: "paperclip",
    upstream: "paperclipai/paperclip",
    role: "agent work management, budgets, roles, tickets, and governance",
    mode: "external-control-plane",
    env: ["PAPERCLIP_API_URL"],
    boundary: "Use for subordinate work coordination and auditability; do not create competing Mira identities.",
  },
];

export const CAPABILITY_DEFINITIONS = Object.freeze(
  definitions.map((item) => Object.freeze({ ...item, env: Object.freeze([...item.env]) })),
);

export function getCapabilityStatus(env = process.env) {
  return CAPABILITY_DEFINITIONS.map((capability) => {
    const missing = capability.env.filter((key) => !String(env[key] || "").trim());
    return {
      ...capability,
      integrated: true,
      configured: missing.length === 0,
      missingConfig: missing,
    };
  });
}
