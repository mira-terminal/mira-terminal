const clone = (value) => structuredClone(value);

export class MiraApexSystem {
  constructor({
    executive,
    council = null,
    portfolio = null,
    simulator = null,
    redTeam = null,
    preMortem = null,
    selfModel = null,
    curriculum = null,
    governanceAuditor = null,
    governor = null,
    lifecycle = null,
    improvementLab = null,
    maxSpecialistSpawnsPerCycle = 3,
  } = {}) {
    if (!executive) throw new Error('executive is required');
    this.executive = executive;
    this.council = council;
    this.portfolio = portfolio;
    this.simulator = simulator;
    this.redTeam = redTeam;
    this.preMortem = preMortem;
    this.selfModel = selfModel;
    this.curriculum = curriculum;
    this.governanceAuditor = governanceAuditor;
    this.governor = governor;
    this.lifecycle = lifecycle;
    this.improvementLab = improvementLab;
    this.maxSpecialistSpawnsPerCycle = Math.max(0, Number(maxSpecialistSpawnsPerCycle));
  }

  async deliberate(input) {
    if (!this.council) throw new Error('council is not configured');
    return this.council.deliberate(clone(input));
  }

  allocate(opportunities, { budget } = {}) {
    if (!this.portfolio) throw new Error('portfolio is not configured');
    if (typeof this.portfolio.allocate === 'function') return this.portfolio.allocate(clone(opportunities), { budget });
    if (typeof this.portfolio.rebalance === 'function') {
      for (const opportunity of opportunities) this.portfolio.upsert(clone(opportunity));
      return this.portfolio.rebalance({ budget });
    }
    throw new Error('portfolio allocator interface is not supported');
  }

  async prepareAction({ plan, context = {} } = {}) {
    if (!this.simulator || !this.preMortem) throw new Error('simulator and preMortem are required');
    let hardened = { hardened: true, plan: clone(plan), unresolvedCritical: [], rounds: [] };
    if (this.redTeam) hardened = await this.redTeam.harden({ plan: clone(plan), context: clone(context) });
    const simulation = await this.simulator.evaluate({ plan: clone(hardened.plan), context: clone(context) });
    const gate = this.preMortem.decide({ simulation, redTeam: hardened });
    return {
      allowed: gate.passed,
      plan: gate.passed ? clone(hardened.plan) : null,
      hardened,
      simulation,
      gate,
    };
  }

  auditGovernance() {
    if (!this.governanceAuditor || !this.governor) throw new Error('governanceAuditor and governor are required');
    return this.governanceAuditor.audit(this.governor);
  }

  async expandCurriculum({ failures = [], lessons = [], context = {} } = {}) {
    if (!this.curriculum || !this.selfModel) throw new Error('curriculum and selfModel are required');
    return this.curriculum.generate({
      failures: clone(failures),
      weakCapabilities: this.selfModel.weakest({ limit: 8 }),
      unknowns: this.selfModel.openUnknowns(),
      lessons: clone(lessons),
      context: clone(context),
    });
  }

  async spawnSpecialists({ factory, specs = [] } = {}) {
    if (!this.lifecycle) throw new Error('lifecycle is not configured');
    const spawned = [];
    for (const spec of specs.slice(0, this.maxSpecialistSpawnsPerCycle)) {
      spawned.push(await this.lifecycle.spawn(factory, clone(spec)));
    }
    return spawned;
  }

  async runImprovementCycle(input) {
    if (!this.improvementLab) throw new Error('improvementLab is not configured');
    return this.improvementLab.runCycle(clone(input));
  }

  health() {
    const base = typeof this.executive.health === 'function' ? this.executive.health() : {};
    return {
      ...clone(base),
      engineeringPosition: 'controlled-12.9-target',
      agiClaim: false,
      apexCapabilities: {
        deliberativeCouncil: Boolean(this.council),
        dynamicAgentLifecycle: Boolean(this.lifecycle),
        strategicPortfolio: Boolean(this.portfolio),
        counterfactualSimulation: Boolean(this.simulator),
        adversarialRedTeam: Boolean(this.redTeam),
        preMortemGate: Boolean(this.preMortem),
        calibratedSelfModel: Boolean(this.selfModel),
        generatedCurriculum: Boolean(this.curriculum),
        metaGovernanceAudit: Boolean(this.governanceAuditor && this.governor),
        boundedImprovementLab: Boolean(this.improvementLab),
      },
    };
  }
}
