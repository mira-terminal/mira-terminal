const clone = (value) => structuredClone(value);

export class AgentLifecycleManager {
  constructor({ maxAgents = 24, minSamplesBeforeRetire = 3, retireBelowScore = 0.45 } = {}) {
    this.maxAgents = Math.max(1, Number(maxAgents));
    this.minSamplesBeforeRetire = Math.max(1, Number(minSamplesBeforeRetire));
    this.retireBelowScore = Number(retireBelowScore);
    this.agents = new Map();
    this.events = [];
  }

  register({ id, role, capabilities = [], cost = 1, handler, provenance = 'configured' } = {}) {
    if (!id || !role || typeof handler !== 'function') throw new Error('id, role and handler are required');
    if (this.agents.has(id)) throw new Error(`agent already exists: ${id}`);
    if (this.active().length >= this.maxAgents) throw new Error('agent capacity reached');
    const agent = {
      id, role, capabilities: [...capabilities], cost: Number(cost), handler,
      provenance, status: 'active', samples: 0, successes: 0, scoreSum: 0,
      createdAt: new Date().toISOString(), retiredAt: null,
    };
    this.agents.set(id, agent);
    this.events.push({ type: 'agent_registered', id, role, at: new Date().toISOString() });
    return this.describe(id);
  }

  async spawn(factory, spec = {}) {
    if (typeof factory !== 'function') throw new Error('factory is required');
    if (this.active().length >= this.maxAgents) throw new Error('agent capacity reached');
    const candidate = await factory(clone(spec));
    return this.register({ ...candidate, provenance: candidate.provenance || 'spawned' });
  }

  recordOutcome(id, { passed, score = passed ? 1 : 0 } = {}) {
    const agent = this.#get(id);
    if (agent.status !== 'active') throw new Error('cannot score retired agent');
    const normalized = Math.max(0, Math.min(1, Number(score)));
    agent.samples += 1;
    agent.successes += passed ? 1 : 0;
    agent.scoreSum += normalized;
    this.events.push({ type: 'agent_scored', id, passed: Boolean(passed), score: normalized, at: new Date().toISOString() });
    return this.describe(id);
  }

  retireUnderperformers() {
    const retired = [];
    for (const agent of this.agents.values()) {
      if (agent.status !== 'active' || agent.samples < this.minSamplesBeforeRetire) continue;
      const mean = agent.scoreSum / agent.samples;
      if (mean >= this.retireBelowScore) continue;
      agent.status = 'retired';
      agent.retiredAt = new Date().toISOString();
      retired.push(agent.id);
      this.events.push({ type: 'agent_retired', id: agent.id, meanScore: mean, at: agent.retiredAt });
    }
    return retired;
  }

  select({ role = null, capability = null, limit = 5 } = {}) {
    return this.active()
      .filter((agent) => !role || agent.role === role)
      .filter((agent) => !capability || agent.capabilities.includes(capability))
      .sort((a, b) => {
        const am = a.samples ? a.scoreSum / a.samples : 0.5;
        const bm = b.samples ? b.scoreSum / b.samples : 0.5;
        if (bm !== am) return bm - am;
        return a.cost - b.cost;
      })
      .slice(0, limit);
  }

  async execute(id, context) {
    const agent = this.#get(id);
    if (agent.status !== 'active') throw new Error(`agent is not active: ${id}`);
    return agent.handler(clone(context));
  }

  active() {
    return [...this.agents.values()].filter((agent) => agent.status === 'active').map((agent) => this.#describe(agent));
  }

  describe(id) { return this.#describe(this.#get(id)); }
  snapshot() { return { agents: [...this.agents.values()].map((a) => this.#describe(a)), events: clone(this.events) }; }

  #describe(agent) {
    return {
      id: agent.id, role: agent.role, capabilities: [...agent.capabilities], cost: agent.cost,
      provenance: agent.provenance, status: agent.status, samples: agent.samples, successes: agent.successes,
      meanScore: agent.samples ? agent.scoreSum / agent.samples : null,
      createdAt: agent.createdAt, retiredAt: agent.retiredAt,
    };
  }

  #get(id) {
    const agent = this.agents.get(id);
    if (!agent) throw new Error(`unknown agent: ${id}`);
    return agent;
  }
}

export class DeliberativeCouncil {
  constructor({ lifecycle, evaluator, minMembers = 2, disagreementThreshold = 0.25 } = {}) {
    if (!lifecycle) throw new Error('lifecycle is required');
    if (typeof evaluator !== 'function') throw new Error('evaluator is required');
    this.lifecycle = lifecycle;
    this.evaluator = evaluator;
    this.minMembers = Math.max(2, Number(minMembers));
    this.disagreementThreshold = Number(disagreementThreshold);
  }

  async deliberate({ question, role = null, capability = null, context = {}, members = 3 } = {}) {
    const selected = this.lifecycle.select({ role, capability, limit: Math.max(this.minMembers, members) });
    if (selected.length < this.minMembers) throw new Error('insufficient independent council members');

    const proposals = [];
    for (const agent of selected) {
      try {
        const output = await this.lifecycle.execute(agent.id, { question, context: clone(context), instruction: 'Reason independently. Do not imitate other agents.' });
        proposals.push({ agentId: agent.id, output: clone(output) });
      } catch (error) {
        proposals.push({ agentId: agent.id, error: error instanceof Error ? error.message : String(error) });
      }
    }

    const valid = proposals.filter((p) => !p.error);
    if (valid.length < this.minMembers) throw new Error('insufficient successful council responses');

    const scored = [];
    for (const proposal of valid) {
      const verdict = await this.evaluator({ question, proposal: clone(proposal.output), context: clone(context) });
      const score = Math.max(0, Math.min(1, Number(verdict?.score ?? 0)));
      scored.push({ ...proposal, score, reasons: clone(verdict?.reasons || []) });
      this.lifecycle.recordOutcome(proposal.agentId, { passed: score >= 0.5, score });
    }
    scored.sort((a, b) => b.score - a.score);
    const top = scored[0];
    const bottom = scored.at(-1);
    const disagreement = top.score - bottom.score;
    return {
      decision: clone(top.output),
      selectedAgentId: top.agentId,
      confidence: top.score,
      disagreement,
      requiresEscalation: disagreement >= this.disagreementThreshold,
      proposals: scored.map(({ agentId, output, score, reasons }) => ({ agentId, output: clone(output), score, reasons: clone(reasons) })),
    };
  }
}
