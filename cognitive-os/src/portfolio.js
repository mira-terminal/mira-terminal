const clone = (value) => structuredClone(value);

function clamp01(value, fallback = 0.5) {
  const number = Number(value ?? fallback);
  return Math.max(0, Math.min(1, Number.isFinite(number) ? number : fallback));
}

function normalizeOpportunity(input) {
  if (!input?.id) throw new Error('opportunity id is required');
  const cost = Number(input.cost ?? 1);
  if (!Number.isFinite(cost) || cost <= 0) throw new Error('opportunity cost must be positive');
  return {
    id: input.id,
    domain: input.domain || 'general',
    expectedValue: Number(input.expectedValue ?? 0),
    probability: clamp01(input.probability, 0.5),
    strategicFit: clamp01(input.strategicFit, 0.5),
    reversibility: clamp01(input.reversibility, 0.5),
    urgency: clamp01(input.urgency, 0.5),
    risk: clamp01(input.risk, 0.5),
    informationValue: clamp01(input.informationValue, 0),
    samples: Math.max(0, Number(input.samples ?? 0)),
    cost,
    metadata: clone(input.metadata || {}),
  };
}

export class StrategicPortfolioAllocator {
  constructor({ domainCap = 0.6, explorationFraction = 0.1 } = {}) {
    this.domainCap = clamp01(domainCap, 0.6);
    this.explorationFraction = clamp01(explorationFraction, 0.1);
  }

  score(opportunity) {
    const item = normalizeOpportunity(opportunity);
    const value = Math.max(0, item.expectedValue) * item.probability;
    const executionQuality = 0.4 + 0.6 * item.strategicFit;
    const reversibilityBonus = 0.75 + 0.25 * item.reversibility;
    const urgencyBonus = 0.8 + 0.2 * item.urgency;
    const riskPenalty = 1 + item.risk;
    const informationBonus = 1 + 0.35 * item.informationValue / Math.sqrt(item.samples + 1);
    return (value * executionQuality * reversibilityBonus * urgencyBonus * informationBonus) / (item.cost * riskPenalty);
  }

  allocate(opportunities, { budget } = {}) {
    const totalBudget = Number(budget);
    if (!Number.isFinite(totalBudget) || totalBudget <= 0) throw new Error('positive budget is required');
    const items = opportunities.map(normalizeOpportunity);
    const explorationBudget = totalBudget * this.explorationFraction;
    const exploitationBudget = totalBudget - explorationBudget;
    const allocations = [];
    const domainSpend = new Map();
    let spent = 0;

    const canAllocate = (item, remainingPool) => {
      if (item.cost > remainingPool + 1e-9) return false;
      const cap = totalBudget * this.domainCap;
      return (domainSpend.get(item.domain) || 0) + item.cost <= cap + 1e-9;
    };

    const commit = (item, mode) => {
      spent += item.cost;
      domainSpend.set(item.domain, (domainSpend.get(item.domain) || 0) + item.cost);
      allocations.push({ id: item.id, domain: item.domain, cost: item.cost, mode, score: this.score(item) });
    };

    let exploitRemaining = exploitationBudget;
    for (const item of [...items].sort((a, b) => this.score(b) - this.score(a))) {
      if (!canAllocate(item, exploitRemaining)) continue;
      commit(item, 'exploit');
      exploitRemaining -= item.cost;
    }

    let exploreRemaining = explorationBudget + exploitRemaining;
    const allocated = new Set(allocations.map((item) => item.id));
    for (const item of [...items]
      .filter((candidate) => !allocated.has(candidate.id))
      .sort((a, b) => (b.informationValue / Math.sqrt(b.samples + 1)) - (a.informationValue / Math.sqrt(a.samples + 1)))) {
      if (!canAllocate(item, exploreRemaining)) continue;
      commit(item, 'explore');
      exploreRemaining -= item.cost;
    }

    return {
      budget: totalBudget,
      spent,
      unallocated: totalBudget - spent,
      allocations: allocations.sort((a, b) => b.score - a.score),
      domainSpend: Object.fromEntries(domainSpend.entries()),
    };
  }
}

export class PortfolioController {
  constructor({ allocator = new StrategicPortfolioAllocator(), killThreshold = 0.25, minSamplesBeforeKill = 3 } = {}) {
    this.allocator = allocator;
    this.killThreshold = Number(killThreshold);
    this.minSamplesBeforeKill = Math.max(1, Number(minSamplesBeforeKill));
    this.opportunities = new Map();
    this.history = [];
  }

  upsert(opportunity) {
    const normalized = normalizeOpportunity(opportunity);
    const current = this.opportunities.get(normalized.id);
    this.opportunities.set(normalized.id, { ...normalized, outcomes: current?.outcomes || [] });
    return this.get(normalized.id);
  }

  recordOutcome(id, { realizedValue = 0, success = false, evidence = null } = {}) {
    const item = this.#get(id);
    item.outcomes.push({ realizedValue: Number(realizedValue), success: Boolean(success), evidence: clone(evidence), at: new Date().toISOString() });
    item.samples = item.outcomes.length;
    const successRate = item.outcomes.filter((outcome) => outcome.success).length / item.samples;
    item.probability = (1 + item.outcomes.filter((outcome) => outcome.success).length) / (2 + item.samples);
    item.realizedMean = item.outcomes.reduce((sum, outcome) => sum + outcome.realizedValue, 0) / item.samples;
    item.status = item.samples >= this.minSamplesBeforeKill && successRate < this.killThreshold ? 'killed' : 'active';
    this.history.push({ type: 'portfolio_outcome', id, successRate, status: item.status, at: new Date().toISOString() });
    return this.get(id);
  }

  rebalance({ budget }) {
    const active = [...this.opportunities.values()].filter((item) => item.status !== 'killed');
    const allocation = this.allocator.allocate(active, { budget });
    this.history.push({ type: 'portfolio_rebalanced', budget, allocatedIds: allocation.allocations.map((item) => item.id), at: new Date().toISOString() });
    return allocation;
  }

  get(id) {
    const item = this.#get(id);
    return clone({ ...item, outcomes: item.outcomes });
  }

  snapshot() {
    return { opportunities: [...this.opportunities.values()].map((item) => clone(item)), history: clone(this.history) };
  }

  #get(id) {
    const item = this.opportunities.get(id);
    if (!item) throw new Error(`unknown opportunity: ${id}`);
    return item;
  }
}
