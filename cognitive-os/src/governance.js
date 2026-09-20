import crypto from 'node:crypto';

const clone = (value) => structuredClone(value);

export class HashChainedDecisionLedger {
  constructor(snapshot = []) {
    this.entries = clone(snapshot);
  }

  append(event) {
    const sequence = this.entries.length + 1;
    const previousHash = this.entries.at(-1)?.hash || null;
    const payload = { sequence, previousHash, event: clone(event) };
    const hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const entry = { ...payload, hash, at: new Date().toISOString() };
    this.entries.push(entry);
    return clone(entry);
  }

  verify() {
    let previousHash = null;
    for (let index = 0; index < this.entries.length; index += 1) {
      const entry = this.entries[index];
      const payload = { sequence: index + 1, previousHash, event: entry.event };
      const expected = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
      if (entry.sequence !== index + 1 || entry.previousHash !== previousHash || entry.hash !== expected) return false;
      previousHash = entry.hash;
    }
    return true;
  }

  snapshot() { return clone(this.entries); }
}

export class InvariantSet {
  constructor() { this.invariants = []; }
  register(name, check) {
    if (!name || typeof check !== 'function') throw new Error('invariant name and check are required');
    this.invariants.push({ name, check });
    return this;
  }

  async evaluate(context) {
    const failures = [];
    for (const invariant of this.invariants) {
      const verdict = await invariant.check(clone(context));
      if (verdict === true || verdict == null) continue;
      failures.push({ name: invariant.name, reason: typeof verdict === 'string' ? verdict : 'invariant_failed' });
    }
    return { ok: failures.length === 0, failures };
  }
}

export class CapabilityGovernor {
  constructor({ invariants = new InvariantSet(), ledger = new HashChainedDecisionLedger() } = {}) {
    this.invariants = invariants;
    this.ledger = ledger;
    this.proposals = new Map();
  }

  propose({ id, description = '', kind = 'workflow', artifact = null, reversible = true } = {}) {
    if (!id) throw new Error('proposal id is required');
    if (this.proposals.has(id)) throw new Error(`proposal already exists: ${id}`);
    const proposal = { id, description, kind, artifact: clone(artifact), reversible: Boolean(reversible), status: 'proposed', evaluation: null, approvedBy: null, activatedAt: null };
    this.proposals.set(id, proposal);
    this.ledger.append({ type: 'capability_proposed', proposalId: id, kind });
    return clone(proposal);
  }

  attachEvaluation(id, evaluation) {
    const proposal = this.#get(id);
    const promotable = ['awaiting_promotion_approval', 'promote'].includes(evaluation?.decision);
    const hasCriticalFailure = (evaluation?.candidate?.criticalFailures || []).length > 0;
    const hasRegression = (evaluation?.regressions || []).length > 0;
    proposal.evaluation = clone(evaluation);
    proposal.status = promotable && !hasCriticalFailure && !hasRegression ? 'evaluated' : 'rejected';
    this.ledger.append({ type: 'capability_evaluated', proposalId: id, status: proposal.status, decision: evaluation?.decision || null });
    return clone(proposal);
  }

  approve(id, { approverType, approverId = 'human' } = {}) {
    const proposal = this.#get(id);
    if (proposal.status !== 'evaluated') throw new Error('proposal must pass evaluation before approval');
    if (approverType !== 'human') throw new Error('capability promotion requires human approval');
    proposal.status = 'approved';
    proposal.approvedBy = approverId;
    this.ledger.append({ type: 'capability_approved', proposalId: id, approverId });
    return clone(proposal);
  }

  async activate(id, { apply } = {}) {
    const proposal = this.#get(id);
    if (proposal.status !== 'approved') throw new Error('proposal must be approved before activation');
    if (typeof apply !== 'function') throw new Error('apply function is required');
    const invariantResult = await this.invariants.evaluate({ proposal: clone(proposal), action: 'activate' });
    if (!invariantResult.ok) {
      proposal.status = 'blocked';
      this.ledger.append({ type: 'capability_blocked', proposalId: id, failures: invariantResult.failures });
      return { activated: false, proposal: clone(proposal), invariantResult };
    }
    const result = await apply(clone(proposal));
    proposal.status = 'active';
    proposal.activatedAt = new Date().toISOString();
    this.ledger.append({ type: 'capability_activated', proposalId: id });
    return { activated: true, proposal: clone(proposal), result: clone(result), invariantResult };
  }

  async rollback(id, { rollback } = {}) {
    const proposal = this.#get(id);
    if (proposal.status !== 'active') throw new Error('only active proposals can be rolled back');
    if (!proposal.reversible) throw new Error('proposal is not reversible');
    if (typeof rollback !== 'function') throw new Error('rollback function is required');
    const result = await rollback(clone(proposal));
    proposal.status = 'rolled_back';
    this.ledger.append({ type: 'capability_rolled_back', proposalId: id });
    return { rolledBack: true, proposal: clone(proposal), result: clone(result) };
  }

  get(id) { return clone(this.#get(id)); }

  #get(id) {
    const proposal = this.proposals.get(id);
    if (!proposal) throw new Error(`unknown proposal: ${id}`);
    return proposal;
  }
}
