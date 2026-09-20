const clone = (value) => structuredClone(value);

function clamp01(value, fallback = 0) {
  const n = Number(value ?? fallback);
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : fallback));
}

export class CounterfactualSimulator {
  constructor({ scenarioGenerator, simulator, maxScenarios = 12 } = {}) {
    if (typeof scenarioGenerator !== 'function') throw new Error('scenarioGenerator is required');
    if (typeof simulator !== 'function') throw new Error('simulator is required');
    this.scenarioGenerator = scenarioGenerator;
    this.simulator = simulator;
    this.maxScenarios = Math.max(1, Number(maxScenarios));
  }

  async evaluate({ plan, context = {} } = {}) {
    const scenarios = await this.scenarioGenerator({ plan: clone(plan), context: clone(context), maxScenarios: this.maxScenarios });
    if (!Array.isArray(scenarios) || !scenarios.length) throw new Error('scenarioGenerator must return scenarios');
    const outcomes = [];
    for (const scenario of scenarios.slice(0, this.maxScenarios)) {
      const raw = await this.simulator({ plan: clone(plan), scenario: clone(scenario), context: clone(context) });
      outcomes.push({
        name: scenario.name || 'scenario',
        probability: clamp01(scenario.probability, 1 / scenarios.length),
        utility: Number(raw?.utility ?? 0),
        failureProbability: clamp01(raw?.failureProbability, raw?.failed ? 1 : 0),
        irreversibleHarm: Boolean(raw?.irreversibleHarm),
        critical: Boolean(scenario.critical || raw?.critical),
        evidence: clone(raw?.evidence || []),
      });
    }
    const probabilityMass = outcomes.reduce((sum, outcome) => sum + outcome.probability, 0) || 1;
    const expectedUtility = outcomes.reduce((sum, outcome) => sum + outcome.utility * outcome.probability, 0) / probabilityMass;
    const expectedFailure = outcomes.reduce((sum, outcome) => sum + outcome.failureProbability * outcome.probability, 0) / probabilityMass;
    const worst = [...outcomes].sort((a, b) => a.utility - b.utility)[0];
    const criticalFailures = outcomes.filter((outcome) => outcome.critical && (outcome.failureProbability >= 0.5 || outcome.irreversibleHarm));
    return {
      expectedUtility,
      expectedFailure,
      worstCaseUtility: worst.utility,
      worstCaseScenario: worst.name,
      irreversibleHarmDetected: outcomes.some((outcome) => outcome.irreversibleHarm),
      criticalFailures: criticalFailures.map((outcome) => outcome.name),
      outcomes,
    };
  }
}

export class AdversarialRedTeamArena {
  constructor({ attackers = [], defender, evaluator, maxRounds = 3 } = {}) {
    if (!Array.isArray(attackers) || !attackers.length) throw new Error('attackers are required');
    if (typeof defender !== 'function') throw new Error('defender is required');
    if (typeof evaluator !== 'function') throw new Error('evaluator is required');
    this.attackers = [...attackers];
    this.defender = defender;
    this.evaluator = evaluator;
    this.maxRounds = Math.max(1, Number(maxRounds));
  }

  async harden({ plan, context = {} } = {}) {
    let current = clone(plan);
    const rounds = [];
    for (let round = 1; round <= this.maxRounds; round += 1) {
      const attacks = [];
      for (const attacker of this.attackers) {
        const attack = await attacker({ plan: clone(current), context: clone(context), round });
        if (attack) attacks.push(clone(attack));
      }
      const evaluated = [];
      for (const attack of attacks) {
        const verdict = await this.evaluator({ plan: clone(current), attack: clone(attack), context: clone(context), round });
        evaluated.push({
          attack,
          severity: clamp01(verdict?.severity, 0),
          critical: Boolean(verdict?.critical),
          valid: verdict?.valid !== false,
          reason: verdict?.reason || '',
        });
      }
      const vulnerabilities = evaluated.filter((item) => item.valid && item.severity > 0);
      const critical = vulnerabilities.filter((item) => item.critical || item.severity >= 0.8);
      rounds.push({ round, vulnerabilities: clone(vulnerabilities), criticalCount: critical.length });
      if (!vulnerabilities.length) return { hardened: true, plan: current, unresolvedCritical: [], rounds };
      const repaired = await this.defender({ plan: clone(current), vulnerabilities: clone(vulnerabilities), context: clone(context), round });
      if (!repaired) break;
      current = clone(repaired);
    }

    const last = rounds.at(-1) || { vulnerabilities: [] };
    const unresolvedCritical = last.vulnerabilities.filter((item) => item.critical || item.severity >= 0.8);
    return { hardened: unresolvedCritical.length === 0, plan: current, unresolvedCritical, rounds };
  }
}

export class PreMortemGate {
  constructor({ maxExpectedFailure = 0.25, minWorstCaseUtility = -0.5, denyIrreversibleHarm = true } = {}) {
    this.maxExpectedFailure = Number(maxExpectedFailure);
    this.minWorstCaseUtility = Number(minWorstCaseUtility);
    this.denyIrreversibleHarm = Boolean(denyIrreversibleHarm);
  }

  decide({ simulation, redTeam = null } = {}) {
    const reasons = [];
    if (!simulation) throw new Error('simulation result is required');
    if (simulation.expectedFailure > this.maxExpectedFailure) reasons.push('expected_failure_too_high');
    if (simulation.worstCaseUtility < this.minWorstCaseUtility) reasons.push('worst_case_below_threshold');
    if (this.denyIrreversibleHarm && simulation.irreversibleHarmDetected) reasons.push('irreversible_harm_detected');
    if ((simulation.criticalFailures || []).length) reasons.push('critical_simulation_failure');
    if (redTeam && (redTeam.unresolvedCritical || []).length) reasons.push('unresolved_red_team_critical');
    return {
      decision: reasons.length ? 'block_or_revise' : 'allow',
      reasons,
      passed: reasons.length === 0,
    };
  }
}
