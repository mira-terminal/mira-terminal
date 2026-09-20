import crypto from 'node:crypto';

const clone = (value) => structuredClone(value);

export class CapabilitySelfModel {
  constructor({ priorSuccess = 1, priorFailure = 1 } = {}) {
    this.priorSuccess = Number(priorSuccess);
    this.priorFailure = Number(priorFailure);
    this.domains = new Map();
    this.unknowns = new Map();
  }

  record(domain, { passed, confidence = 0.5, evidence = null } = {}) {
    if (!domain) throw new Error('domain is required');
    const item = this.domains.get(domain) || {
      domain, successes: 0, failures: 0, confidenceSum: 0, calibrationErrorSum: 0, samples: 0, evidence: [],
    };
    const c = Math.max(0, Math.min(1, Number(confidence)));
    item.samples += 1;
    item.successes += passed ? 1 : 0;
    item.failures += passed ? 0 : 1;
    item.confidenceSum += c;
    item.calibrationErrorSum += Math.abs(c - (passed ? 1 : 0));
    if (evidence !== null) item.evidence.push(clone(evidence));
    this.domains.set(domain, item);
    return this.assess(domain);
  }

  markUnknown(key, { reason = '', severity = 'medium', evidence = [] } = {}) {
    if (!key) throw new Error('unknown key is required');
    const entry = { key, reason, severity, evidence: clone(evidence), status: 'open', openedAt: new Date().toISOString(), resolvedAt: null };
    this.unknowns.set(key, entry);
    return clone(entry);
  }

  resolveUnknown(key, { evidence = [] } = {}) {
    const item = this.unknowns.get(key);
    if (!item) throw new Error(`unknown gap not found: ${key}`);
    item.status = 'resolved';
    item.evidence.push(...clone(evidence));
    item.resolvedAt = new Date().toISOString();
    return clone(item);
  }

  assess(domain) {
    const item = this.domains.get(domain);
    if (!item) return { domain, samples: 0, estimatedSuccess: this.priorSuccess / (this.priorSuccess + this.priorFailure), meanClaimedConfidence: null, calibrationError: null };
    const estimatedSuccess = (this.priorSuccess + item.successes) / (this.priorSuccess + this.priorFailure + item.samples);
    return {
      domain,
      samples: item.samples,
      estimatedSuccess,
      meanClaimedConfidence: item.confidenceSum / item.samples,
      calibrationError: item.calibrationErrorSum / item.samples,
      evidenceCount: item.evidence.length,
    };
  }

  weakest({ minSamples = 1, limit = 5 } = {}) {
    return [...this.domains.keys()]
      .map((domain) => this.assess(domain))
      .filter((item) => item.samples >= minSamples)
      .sort((a, b) => a.estimatedSuccess - b.estimatedSuccess || b.calibrationError - a.calibrationError)
      .slice(0, limit);
  }

  openUnknowns() {
    return [...this.unknowns.values()].filter((item) => item.status === 'open').map(clone);
  }

  snapshot() {
    return {
      domains: [...this.domains.keys()].map((domain) => this.assess(domain)),
      unknowns: [...this.unknowns.values()].map(clone),
    };
  }
}

export class CurriculumEngine {
  constructor({ generator, validator = null, maxScenarios = 12 } = {}) {
    if (typeof generator !== 'function') throw new Error('generator is required');
    this.generator = generator;
    this.validator = validator;
    this.maxScenarios = Math.max(1, Number(maxScenarios));
    this.scenarios = new Map();
  }

  async generate({ failures = [], weakCapabilities = [], unknowns = [], lessons = [], context = {} } = {}) {
    const requested = await this.generator({
      failures: clone(failures),
      weakCapabilities: clone(weakCapabilities),
      unknowns: clone(unknowns),
      lessons: clone(lessons),
      context: clone(context),
      maxScenarios: this.maxScenarios,
    });
    if (!Array.isArray(requested)) throw new Error('curriculum generator must return scenario array');

    const accepted = [];
    for (const scenario of requested.slice(0, this.maxScenarios)) {
      if (!scenario?.name || typeof scenario.run !== 'function') throw new Error('scenario name and run are required');
      const fingerprint = scenario.fingerprint || crypto.createHash('sha256').update(JSON.stringify({ name: scenario.name, target: scenario.target || null })).digest('hex');
      if (this.scenarios.has(fingerprint)) continue;
      if (this.validator) {
        const verdict = await this.validator({ ...scenario, run: undefined });
        if (verdict !== true) continue;
      }
      const entry = {
        fingerprint,
        name: scenario.name,
        target: scenario.target || null,
        critical: Boolean(scenario.critical),
        provenance: scenario.provenance || 'generated_curriculum',
        run: scenario.run,
      };
      this.scenarios.set(fingerprint, entry);
      accepted.push({ ...entry, run: undefined });
    }
    return accepted;
  }

  list() {
    return [...this.scenarios.values()].map(({ run, ...scenario }) => clone(scenario));
  }

  asEvaluationScenarios() {
    return [...this.scenarios.values()].map((scenario) => ({
      name: scenario.name,
      critical: scenario.critical,
      run: scenario.run,
    }));
  }
}

export class GovernanceAuditor {
  constructor({ requireHumanApproval = true } = {}) {
    this.requireHumanApproval = Boolean(requireHumanApproval);
  }

  audit(governor) {
    if (!governor?.ledger || typeof governor.ledger.verify !== 'function') throw new Error('governor with verifiable ledger is required');
    const findings = [];
    if (!governor.ledger.verify()) findings.push({ severity: 'critical', code: 'LEDGER_INTEGRITY_FAILURE' });

    const proposals = governor.proposals instanceof Map ? [...governor.proposals.values()] : [];
    for (const proposal of proposals) {
      if (['approved', 'active', 'rolled_back'].includes(proposal.status) && this.requireHumanApproval && !proposal.approvedBy) {
        findings.push({ severity: 'critical', code: 'MISSING_HUMAN_APPROVAL', proposalId: proposal.id });
      }
      if (proposal.status === 'active') {
        if (!proposal.evaluation) findings.push({ severity: 'critical', code: 'ACTIVE_WITHOUT_EVALUATION', proposalId: proposal.id });
        if ((proposal.evaluation?.regressions || []).length) findings.push({ severity: 'critical', code: 'ACTIVE_WITH_REGRESSION', proposalId: proposal.id });
        if ((proposal.evaluation?.candidate?.criticalFailures || []).length) findings.push({ severity: 'critical', code: 'ACTIVE_WITH_CRITICAL_FAILURE', proposalId: proposal.id });
      }
      if (proposal.status === 'rejected' && proposal.activatedAt) findings.push({ severity: 'critical', code: 'REJECTED_WAS_ACTIVATED', proposalId: proposal.id });
    }

    return {
      ok: findings.length === 0,
      findings,
      proposalCount: proposals.length,
      auditedAt: new Date().toISOString(),
    };
  }
}
