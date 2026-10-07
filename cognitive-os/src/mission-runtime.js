import crypto from 'node:crypto';

const clone = (value) => structuredClone(value);

function normalizeWorkstream(item) {
  return {
    id: item.id || `work_${crypto.randomUUID()}`,
    department: item.department,
    title: item.title || item.id || 'workstream',
    dependsOn: [...(item.dependsOn || [])],
    cost: Number(item.cost || 0),
    riskClass: item.riskClass || 'low',
    approvalRequired: Boolean(item.approvalRequired),
    status: 'pending',
    result: null,
    error: null,
  };
}

export class MissionRuntime {
  constructor({ planner, departments, store, journal = null, verifier = null, maxMissionBudget = Infinity } = {}) {
    if (!planner || typeof planner.plan !== 'function') throw new Error('planner is required');
    if (!departments) throw new Error('departments are required');
    if (!store || typeof store.save !== 'function' || typeof store.load !== 'function') throw new Error('store is required');
    this.planner = planner;
    this.departments = departments;
    this.store = store;
    this.journal = journal;
    this.verifier = verifier;
    this.maxMissionBudget = Number(maxMissionBudget);
  }

  async start(mission) {
    const state = {
      id: mission.id || `mission_${crypto.randomUUID()}`,
      mission: clone(mission),
      status: 'planning',
      workstreams: [],
      approvals: [],
      spent: 0,
      blockers: [],
      verification: null,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      finishedAt: null,
    };
    const plan = await this.planner.plan(clone(mission), { departments: this.departments.list() });
    if (!Array.isArray(plan) || !plan.length) throw new Error('mission planner must return workstreams');
    state.workstreams = plan.map(normalizeWorkstream);
    this.#validateGraph(state.workstreams);
    state.status = 'running';
    await this.#checkpoint(state, 'mission_planned');
    return this.#drive(state);
  }

  async approve(missionId, workstreamId) {
    const state = await this.#load(missionId);
    if (!state.workstreams.some((work) => work.id === workstreamId)) throw new Error(`Unknown workstream: ${workstreamId}`);
    if (!state.approvals.includes(workstreamId)) state.approvals.push(workstreamId);
    await this.#checkpoint(state, 'mission_approval_granted', { workstreamId });
    return clone(state);
  }

  async resume(missionId) {
    const state = await this.#load(missionId);
    if (['completed', 'failed'].includes(state.status)) return clone(state);
    for (const work of state.workstreams) {
      if (work.status === 'waiting_approval' && state.approvals.includes(work.id)) work.status = 'pending';
    }
    const waiting = state.workstreams.find((work) => work.status === 'waiting_approval');
    if (waiting) {
      state.status = 'waiting_approval';
      state.blockers = [`Approval required for ${waiting.id}`];
      await this.#checkpoint(state, 'mission_resume_waiting_approval', { workstreamId: waiting.id });
      return clone(state);
    }
    state.status = 'running';
    state.blockers = [];
    state.finishedAt = null;
    await this.#checkpoint(state, 'mission_resumed');
    return this.#drive(state);
  }

  async #load(missionId) {
    const state = await this.store.load(missionId);
    if (!state) throw new Error(`Mission not found: ${missionId}`);
    return state;
  }

  #validateGraph(workstreams) {
    const ids = new Set(workstreams.map((work) => work.id));
    if (ids.size !== workstreams.length) throw new Error('duplicate workstream id');
    const unknown = workstreams.flatMap((work) => work.dependsOn.filter((id) => !ids.has(id)).map((id) => `${work.id}->${id}`));
    if (unknown.length) throw new Error(`Unknown mission dependencies: ${unknown.join(', ')}`);
  }

  async #drive(state) {
    const byId = new Map(state.workstreams.map((work) => [work.id, work]));
    while (state.workstreams.some((work) => work.status === 'pending')) {
      let progressed = false;
      for (const work of state.workstreams.filter((item) => item.status === 'pending')) {
        const dependencies = work.dependsOn.map((id) => byId.get(id));
        if (dependencies.some((dep) => ['failed', 'blocked'].includes(dep.status))) {
          work.status = 'blocked';
          work.error = 'dependency_failed';
          progressed = true;
          await this.#checkpoint(state, 'mission_workstream_blocked', { workstreamId: work.id });
          continue;
        }
        if (dependencies.some((dep) => dep.status !== 'completed')) continue;
        if (work.approvalRequired && !state.approvals.includes(work.id)) {
          work.status = 'waiting_approval';
          state.status = 'waiting_approval';
          state.blockers = [`Approval required for ${work.id}`];
          state.finishedAt = new Date().toISOString();
          await this.#checkpoint(state, 'mission_waiting_approval', { workstreamId: work.id });
          return clone(state);
        }
        const department = this.departments.get(work.department);
        if (work.cost > department.maxBudget || state.spent + work.cost > this.maxMissionBudget) {
          work.status = 'blocked';
          work.error = 'budget_exceeded';
          progressed = true;
          await this.#checkpoint(state, 'mission_workstream_blocked', { workstreamId: work.id, reason: 'budget_exceeded' });
          continue;
        }
        progressed = true;
        work.status = 'running';
        await this.#checkpoint(state, 'mission_workstream_started', { workstreamId: work.id });
        try {
          work.result = await department.handler({
            mission: clone(state.mission),
            workstream: clone(work),
            completed: clone(state.workstreams.filter((item) => item.status === 'completed')),
          });
          work.status = work.result?.complete === false ? 'failed' : 'completed';
          if (work.status === 'completed') state.spent += work.cost;
        } catch (error) {
          work.status = 'failed';
          work.error = error instanceof Error ? error.message : String(error);
        }
        await this.#checkpoint(state, work.status === 'completed' ? 'mission_workstream_completed' : 'mission_workstream_failed', { workstreamId: work.id });
      }
      if (!progressed) {
        state.status = 'blocked';
        state.blockers = ['No executable workstream remains'];
        state.finishedAt = new Date().toISOString();
        await this.#checkpoint(state, 'mission_blocked');
        return clone(state);
      }
    }

    if (state.workstreams.some((work) => ['failed', 'blocked'].includes(work.status))) {
      state.status = 'failed';
      state.finishedAt = new Date().toISOString();
      await this.#checkpoint(state, 'mission_failed');
      return clone(state);
    }
    state.verification = this.verifier ? await this.verifier.verify(state.mission, state.workstreams) : { ok: true, reasons: [] };
    state.status = state.verification.ok ? 'completed' : 'failed';
    state.finishedAt = new Date().toISOString();
    await this.#checkpoint(state, state.status === 'completed' ? 'mission_completed' : 'mission_failed');
    return clone(state);
  }

  async #checkpoint(state, type, payload = {}) {
    state.updatedAt = new Date().toISOString();
    await this.store.save(state);
    if (this.journal) await this.journal.append({ type, missionId: state.id, payload: clone(payload) });
  }
}

export class EventDrivenMissionRouter {
  constructor({ runtime } = {}) {
    if (!runtime || typeof runtime.start !== 'function') throw new Error('runtime is required');
    this.runtime = runtime;
    this.rules = [];
  }

  register(name, predicate, missionFactory) {
    if (!name || typeof predicate !== 'function' || typeof missionFactory !== 'function') throw new Error('name, predicate and missionFactory are required');
    this.rules.push({ name, predicate, missionFactory });
    return this;
  }

  async dispatch(event) {
    const launches = [];
    for (const rule of this.rules) {
      if (!(await rule.predicate(clone(event)))) continue;
      const mission = await rule.missionFactory(clone(event));
      launches.push({ rule: rule.name, result: await this.runtime.start(mission) });
    }
    return launches;
  }
}
