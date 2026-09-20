import crypto from 'node:crypto';

export const ToolDecision = Object.freeze({
  ALLOW: 'allow',
  REQUIRE_APPROVAL: 'require_approval',
  DENY: 'deny',
});

const riskRank = Object.freeze({ low: 0, medium: 1, high: 2, critical: 3 });

function normalizeRisk(value) {
  const risk = String(value || 'low').toLowerCase();
  if (!(risk in riskRank)) throw new Error(`Unsupported tool risk class: ${value}`);
  return risk;
}

export class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  register(name, handler, metadata = {}) {
    if (!name || typeof handler !== 'function') throw new Error('tool name and handler are required');
    if (this.tools.has(name)) throw new Error(`Tool already registered: ${name}`);
    this.tools.set(name, {
      name,
      handler,
      metadata: {
        ...metadata,
        riskClass: normalizeRisk(metadata.riskClass),
        reversible: metadata.reversible !== false,
        permissions: [...(metadata.permissions || [])],
        effects: [...(metadata.effects || [])],
        timeoutMs: Math.max(1, Number(metadata.timeoutMs || 30_000)),
      },
    });
    return this;
  }

  get(name) {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    return tool;
  }

  list() {
    return [...this.tools.values()].map(({ name, metadata }) => ({ name, metadata: structuredClone(metadata) }));
  }
}

export class ToolPolicyEngine {
  constructor({ rules = [], approvalAtOrAbove = 'medium', denyCritical = true } = {}) {
    this.rules = [...rules];
    this.approvalAtOrAbove = normalizeRisk(approvalAtOrAbove);
    this.denyCritical = Boolean(denyCritical);
  }

  async evaluate(request) {
    for (const rule of this.rules) {
      const verdict = await rule(request);
      if (verdict) return normalizeVerdict(verdict);
    }

    const risk = normalizeRisk(request.tool.metadata.riskClass);
    if (this.denyCritical && risk === 'critical') {
      return { decision: ToolDecision.DENY, reason: 'Critical-risk tools are denied by default' };
    }
    if (riskRank[risk] >= riskRank[this.approvalAtOrAbove]) {
      return { decision: ToolDecision.REQUIRE_APPROVAL, reason: `${risk} risk requires approval` };
    }
    return { decision: ToolDecision.ALLOW, reason: 'Policy allows low-risk execution' };
  }
}

function normalizeVerdict(verdict) {
  if (typeof verdict === 'string') return { decision: verdict, reason: '' };
  if (!Object.values(ToolDecision).includes(verdict.decision)) {
    throw new Error(`Invalid policy decision: ${verdict.decision}`);
  }
  return { decision: verdict.decision, reason: verdict.reason || '' };
}

export function denyEffectWhenConstraintPresent({ effect, constraint }) {
  return ({ tool, goal }) => {
    const constraints = (goal?.constraints || []).map((item) => String(item).trim().toLowerCase());
    const effects = (tool.metadata.effects || []).map((item) => String(item).trim().toLowerCase());
    if (effects.includes(String(effect).toLowerCase()) && constraints.includes(String(constraint).toLowerCase())) {
      return { decision: ToolDecision.DENY, reason: `Goal constraint blocks tool effect: ${effect}` };
    }
    return null;
  };
}

export class ToolExecutor {
  constructor({ registry, policy = new ToolPolicyEngine(), journal = null } = {}) {
    if (!registry) throw new Error('registry is required');
    this.registry = registry;
    this.policy = policy;
    this.journal = journal;
    this.approvals = new Set();
    this.audit = [];
  }

  approve(requestId) {
    if (!requestId) throw new Error('requestId is required');
    this.approvals.add(requestId);
  }

  async execute({ requestId = null, toolName, args = {}, goal = null, context = {} } = {}) {
    const id = requestId || `toolreq_${crypto.randomUUID()}`;
    const tool = this.registry.get(toolName);
    const policy = await this.policy.evaluate({ requestId: id, tool, args, goal, context });

    if (policy.decision === ToolDecision.DENY) {
      return this.#record({ id, toolName, status: 'denied', policy, args });
    }

    if (policy.decision === ToolDecision.REQUIRE_APPROVAL && !this.approvals.has(id)) {
      return this.#record({ id, toolName, status: 'waiting_approval', policy, args });
    }

    this.approvals.delete(id);
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeoutMs = tool.metadata.timeoutMs;
    let timer;

    try {
      const output = await Promise.race([
        Promise.resolve(tool.handler(structuredClone(args), {
          goal: structuredClone(goal),
          context: structuredClone(context),
          signal: controller.signal,
          requestId: id,
        })),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error(`Tool timed out after ${timeoutMs}ms`));
          }, timeoutMs);
        }),
      ]);
      return this.#record({
        id,
        toolName,
        status: 'completed',
        policy,
        args,
        durationMs: Date.now() - startedAt,
        output,
      });
    } catch (error) {
      return this.#record({
        id,
        toolName,
        status: 'failed',
        policy,
        args,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async #record({ id, toolName, status, policy, args, durationMs = 0, output = undefined, error = undefined }) {
    const event = {
      at: new Date().toISOString(),
      requestId: id,
      toolName,
      status,
      policy: structuredClone(policy),
      argKeys: Object.keys(args || {}),
      durationMs,
      ...(output === undefined ? {} : { output: structuredClone(output) }),
      ...(error === undefined ? {} : { error }),
    };
    this.audit.push(event);
    if (this.journal) await this.journal.append({ type: 'tool_execution', ...structuredClone(event) });
    return structuredClone(event);
  }

  auditTrail() {
    return structuredClone(this.audit);
  }
}
