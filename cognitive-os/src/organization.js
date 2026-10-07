const clone = (value) => structuredClone(value);

export class DepartmentRegistry {
  constructor() { this.departments = new Map(); }
  register(name, handler, { capabilities = [], maxBudget = Infinity } = {}) {
    if (!name || typeof handler !== 'function') throw new Error('department name and handler are required');
    this.departments.set(name, { name, handler, capabilities: [...capabilities], maxBudget: Number(maxBudget) });
    return this;
  }
  get(name) { const d = this.departments.get(name); if (!d) throw new Error(`Unknown department: ${name}`); return d; }
  list() { return [...this.departments.values()].map(({ handler, ...d }) => clone(d)); }
}

export class AutonomousOrganization {
  constructor({ planner, departments, verifier = null, maxMissionBudget = Infinity } = {}) {
    if (!planner || typeof planner.plan !== 'function') throw new Error('planner is required');
    if (!departments) throw new Error('departments are required');
    this.planner = planner;
    this.departments = departments;
    this.verifier = verifier;
    this.maxMissionBudget = Number(maxMissionBudget);
    this.approvals = new Set();
    this.ledger = [];
  }

  approve(workstreamId) { this.approvals.add(workstreamId); }

  async run(mission) {
    const plan = await this.planner.plan(clone(mission), { departments: this.departments.list() });
    if (!Array.isArray(plan) || !plan.length) throw new Error('organization planner must return workstreams');
    const workstreams = plan.map((item) => ({ status: 'pending', dependsOn: [], cost: 0, riskClass: 'low', approvalRequired: false, ...clone(item), result: null, error: null }));
    const byId = new Map(workstreams.map((w) => [w.id, w]));
    const unknown = workstreams.flatMap((w) => w.dependsOn.filter((id) => !byId.has(id)).map((id) => `${w.id}->${id}`));
    if (unknown.length) return { status: 'failed', reason: 'unknown_dependencies', unknown, workstreams };

    let spent = 0;
    while (workstreams.some((w) => w.status === 'pending')) {
      let progressed = false;
      for (const work of workstreams.filter((w) => w.status === 'pending')) {
        const deps = work.dependsOn.map((id) => byId.get(id));
        if (deps.some((d) => ['failed','blocked'].includes(d.status))) { work.status = 'blocked'; progressed = true; continue; }
        if (deps.some((d) => d.status !== 'completed')) continue;
        if (work.approvalRequired && !this.approvals.has(work.id)) {
          work.status = 'waiting_approval';
          return { status: 'waiting_approval', blocker: work.id, spent, workstreams: clone(workstreams) };
        }
        const department = this.departments.get(work.department);
        if (work.cost > department.maxBudget || spent + work.cost > this.maxMissionBudget) {
          work.status = 'blocked'; work.error = 'budget_exceeded'; progressed = true; continue;
        }
        progressed = true; work.status = 'running';
        try {
          work.result = await department.handler({ mission: clone(mission), workstream: clone(work), completed: clone(workstreams.filter((w) => w.status === 'completed')) });
          work.status = work.result?.complete === false ? 'failed' : 'completed';
          if (work.status === 'completed') spent += work.cost;
        } catch (error) { work.status = 'failed'; work.error = error instanceof Error ? error.message : String(error); }
        this.ledger.push({ at: new Date().toISOString(), mission: mission.id || null, workstream: work.id, department: work.department, status: work.status, cost: work.status === 'completed' ? work.cost : 0 });
      }
      if (!progressed) return { status: 'blocked', reason: 'no_executable_workstream', spent, workstreams: clone(workstreams) };
    }

    if (workstreams.some((w) => ['failed','blocked'].includes(w.status))) return { status: 'failed', spent, workstreams: clone(workstreams) };
    const verification = this.verifier ? await this.verifier.verify(mission, workstreams) : { ok: true, reasons: [] };
    return { status: verification.ok ? 'completed' : 'failed', spent, verification, workstreams: clone(workstreams) };
  }

  ledgerSnapshot() { return clone(this.ledger); }
}
