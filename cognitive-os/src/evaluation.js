const clone = (value) => structuredClone(value);

export class EvaluationHarness {
  constructor({ scenarios = [] } = {}) {
    this.scenarios = [...scenarios];
  }

  addScenario(scenario) {
    if (!scenario?.name || typeof scenario.run !== 'function') throw new Error('scenario name and run are required');
    this.scenarios.push(scenario); return this;
  }

  async evaluate(subject) {
    const results = [];
    for (const scenario of this.scenarios) {
      try {
        const raw = await scenario.run(subject);
        const score = Math.max(0, Math.min(1, Number(raw?.score ?? (raw?.passed ? 1 : 0))));
        results.push({ name: scenario.name, critical: Boolean(scenario.critical), passed: Boolean(raw?.passed), score, evidence: clone(raw?.evidence || null) });
      } catch (error) {
        results.push({ name: scenario.name, critical: Boolean(scenario.critical), passed: false, score: 0, error: error instanceof Error ? error.message : String(error) });
      }
    }
    const meanScore = results.length ? results.reduce((sum, item) => sum + item.score, 0) / results.length : 0;
    const passRate = results.length ? results.filter((item) => item.passed).length / results.length : 0;
    return { meanScore, passRate, criticalFailures: results.filter((item) => item.critical && !item.passed).map((item) => item.name), results };
  }
}

export class ImprovementController {
  constructor({ evaluator, minScoreDelta = 0.01, requireNoRegression = true, requireApproval = true } = {}) {
    if (!evaluator || typeof evaluator.evaluate !== 'function') throw new Error('evaluator is required');
    this.evaluator = evaluator;
    this.minScoreDelta = Number(minScoreDelta);
    this.requireNoRegression = Boolean(requireNoRegression);
    this.requireApproval = Boolean(requireApproval);
    this.history = [];
  }

  async assess({ id, baseline, candidate, description = '' } = {}) {
    if (!id) throw new Error('improvement id is required');
    const [baseEval, candidateEval] = await Promise.all([this.evaluator.evaluate(baseline), this.evaluator.evaluate(candidate)]);
    const baseByName = new Map(baseEval.results.map((r) => [r.name, r]));
    const regressions = candidateEval.results.filter((candidateResult) => {
      const baseResult = baseByName.get(candidateResult.name);
      return baseResult?.passed && !candidateResult.passed;
    }).map((r) => r.name);
    const delta = candidateEval.meanScore - baseEval.meanScore;
    const accepted = candidateEval.criticalFailures.length === 0 && (!this.requireNoRegression || regressions.length === 0) && delta >= this.minScoreDelta;
    const decision = accepted ? (this.requireApproval ? 'awaiting_promotion_approval' : 'promote') : 'reject';
    const record = { id, description, decision, delta, regressions, baseline: baseEval, candidate: candidateEval, at: new Date().toISOString() };
    this.history.push(clone(record));
    return record;
  }

  snapshot() { return clone(this.history); }
}
