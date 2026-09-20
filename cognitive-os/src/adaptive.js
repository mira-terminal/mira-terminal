import { TaskStatus } from './contracts.js';

const clone = (value) => structuredClone(value);
const RETIRED = 'retired';

function materialSignal(result, threshold) {
  const signal = result?.adaptation;
  if (!signal || signal.material !== true) return null;
  const reason = String(signal.reason || '').trim();
  if (!reason) throw new Error('Material adaptation signal requires a reason');
  const confidence = Number(signal.confidence ?? 1);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error('Adaptation confidence must be between 0 and 1');
  }
  if (confidence < threshold) return null;
  return {
    material: true,
    reason,
    confidence,
    evidence: clone(signal.evidence || []),
    provenance: signal.provenance || 'verified_task_result',
  };
}

function remapTasks(freshTasks, completedTasks, generation) {
  const completedIds = new Set(completedTasks.map((task) => task.id));
  const completedTitles = new Map(completedTasks.map((task) => [task.title, task.id]));
  const used = new Set(completedIds);
  const idMap = new Map();

  for (const [index, task] of freshTasks.entries()) {
    if (completedIds.has(task.id) || completedTitles.has(task.title)) continue;
    const base = task.id || `step_${index + 1}`;
    let id = base;
    while (used.has(id)) id = `r${generation}_${id}`;
    used.add(id);
    idMap.set(base, id);
  }

  return freshTasks
    .filter((task) => !completedIds.has(task.id) && !completedTitles.has(task.title))
    .map((task, index) => {
      const base = task.id || `step_${index + 1}`;
      return {
        ...clone(task),
        id: idMap.get(base) || base,
        dependsOn: (task.dependsOn || []).map((dep) => {
          if (completedIds.has(dep)) return dep;
          if (completedTitles.has(dep)) return completedTitles.get(dep);
          return idMap.get(dep) || dep;
        }),
        status: task.status || TaskStatus.PENDING,
      };
    });
}

export class AdaptiveSupervisor {
  constructor({ planner, maxReplans = 3, materialityThreshold = 0.65 } = {}) {
    if (!planner || typeof planner.plan !== 'function') throw new Error('planner is required');
    this.planner = planner;
    this.maxReplans = Math.max(0, Number(maxReplans));
    this.materialityThreshold = Number(materialityThreshold);
  }

  assess(result) {
    return materialSignal(result, this.materialityThreshold);
  }

  async revise({ goal, tasks, result, memory = {}, world = {}, history = [] } = {}) {
    const signal = this.assess(result);
    if (!signal) return { changed: false, reason: 'no_material_signal' };
    if (history.length >= this.maxReplans) {
      return { changed: false, blocked: true, reason: 'replan_budget_exhausted', signal };
    }

    const completed = tasks.filter((task) => task.status === TaskStatus.COMPLETED);
    const retired = tasks.filter((task) => task.status !== TaskStatus.COMPLETED).map((task) => ({
      ...clone(task), status: RETIRED, retiredReason: signal.reason,
    }));
    const generation = history.length + 1;
    const fresh = await this.planner.plan(clone(goal), {
      memory: clone(memory), world: clone(world),
      adaptation: {
        generation,
        reason: signal.reason,
        confidence: signal.confidence,
        evidence: clone(signal.evidence),
        provenance: signal.provenance,
        preserveGoalContract: true,
        completedTasks: clone(completed),
        retiredTasks: clone(retired),
      },
    });
    const replacements = remapTasks(fresh, completed, generation);
    if (!replacements.length) {
      return { changed: false, blocked: true, reason: 'replan_produced_no_unfinished_work', signal };
    }
    return {
      changed: true,
      generation,
      signal,
      completedTasks: clone(completed),
      retiredTasks: retired,
      replacementTasks: replacements,
      tasks: [...clone(completed), ...replacements],
      event: {
        type: 'plan_revised', generation, reason: signal.reason,
        preservedTaskIds: completed.map((t) => t.id),
        retiredTaskIds: retired.map((t) => t.id),
        replacementTaskIds: replacements.map((t) => t.id),
      },
    };
  }
}

export class EvidenceLedger {
  constructor(snapshot = []) { this.entries = clone(snapshot); }
  record({ key, value, confidence = 0.5, evidence = [], provenance = 'runtime', status = 'active' }) {
    if (!key) throw new Error('key is required');
    if (!Number.isFinite(Number(confidence)) || confidence < 0 || confidence > 1) throw new Error('confidence must be between 0 and 1');
    const entry = { key, value: clone(value), confidence: Number(confidence), evidence: clone(evidence), provenance, status, version: this.entries.length + 1, at: new Date().toISOString() };
    this.entries.push(entry); return clone(entry);
  }
  invalidate(key, { reason = '', evidence = [] } = {}) {
    const current = [...this.entries].reverse().find((entry) => entry.key === key && entry.status === 'active');
    if (!current) throw new Error(`No active evidence entry: ${key}`);
    return this.record({ ...current, key, status: 'invalidated', confidence: 0, evidence: [...current.evidence, ...clone(evidence)], provenance: current.provenance, value: current.value, reason });
  }
  current(key) { const found = [...this.entries].reverse().find((entry) => entry.key === key); return found ? clone(found) : undefined; }
  snapshot() { return clone(this.entries); }
}
