const clone = (value) => structuredClone(value);

export class ImprovementLab {
  constructor({ generator, improvementController, capabilityGovernor, maxCandidates = 5 } = {}) {
    if (typeof generator !== 'function') throw new Error('generator is required');
    if (!improvementController || typeof improvementController.assess !== 'function') throw new Error('improvementController is required');
    if (!capabilityGovernor) throw new Error('capabilityGovernor is required');
    this.generator = generator;
    this.improvementController = improvementController;
    this.capabilityGovernor = capabilityGovernor;
    this.maxCandidates = Math.max(1, Number(maxCandidates));
    this.cycles = [];
  }

  async runCycle({ baseline, lessons = [], context = {}, constraints = [] } = {}) {
    const generated = await this.generator({
      baseline: clone(baseline),
      lessons: clone(lessons),
      context: clone(context),
      constraints: clone(constraints),
      maxCandidates: this.maxCandidates,
    });
    if (!Array.isArray(generated)) throw new Error('generator must return candidate array');

    const seen = new Set();
    const candidates = generated.slice(0, this.maxCandidates);
    const results = [];
    for (const candidate of candidates) {
      if (!candidate?.id) throw new Error('candidate id is required');
      if (seen.has(candidate.id)) throw new Error(`duplicate candidate id: ${candidate.id}`);
      seen.add(candidate.id);
      this.capabilityGovernor.propose({
        id: candidate.id,
        description: candidate.description || '',
        kind: candidate.kind || 'workflow',
        artifact: candidate.artifact || null,
        reversible: candidate.reversible !== false,
      });
      const evaluation = await this.improvementController.assess({
        id: candidate.id,
        description: candidate.description || '',
        baseline,
        candidate: candidate.subject,
      });
      const governed = this.capabilityGovernor.attachEvaluation(candidate.id, evaluation);
      results.push({ id: candidate.id, evaluation: clone(evaluation), governed: clone(governed) });
    }

    const promotable = results
      .filter((item) => item.governed.status === 'evaluated')
      .sort((a, b) => b.evaluation.delta - a.evaluation.delta)
      .map((item) => ({ id: item.id, delta: item.evaluation.delta, status: item.governed.status }));
    const rejected = results.filter((item) => item.governed.status === 'rejected').map((item) => item.id);
    const record = {
      at: new Date().toISOString(),
      candidateCount: results.length,
      promotable,
      rejected,
      results,
      activationPerformed: false,
    };
    this.cycles.push(clone(record));
    return record;
  }

  history() { return clone(this.cycles); }
}
