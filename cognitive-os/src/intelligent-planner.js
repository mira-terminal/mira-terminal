import { normalizeTask } from './contracts.js';

function validatePlan(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Plan must be an object';
  if (!Array.isArray(value.tasks) || value.tasks.length === 0) return 'Plan must include at least one task';
  for (const [index, task] of value.tasks.entries()) {
    if (!task || typeof task !== 'object') return `Task ${index + 1} must be an object`;
    if (!task.title || !String(task.title).trim()) return `Task ${index + 1} requires a title`;
  }
  return true;
}

function normalizeDependencies(tasks) {
  const prepared = tasks.map((task, index) => ({
    ...task,
    id: task.id || `step_${index + 1}`,
  }));

  const aliases = new Map();
  prepared.forEach((task, index) => {
    aliases.set(String(task.id), task.id);
    aliases.set(String(task.title), task.id);
    aliases.set(String(index + 1), task.id);
  });

  return prepared.map((task) => ({
    ...task,
    dependsOn: (task.dependsOn || []).map((dependency) => aliases.get(String(dependency)) || dependency),
  }));
}

export class ModelPlanner {
  constructor({ router, role = 'planner', instructions = '' } = {}) {
    if (!router || typeof router.complete !== 'function') throw new Error('router is required');
    this.router = router;
    this.role = role;
    this.instructions = instructions;
  }

  async plan(goal, context = {}) {
    const plan = await this.router.complete(this.role, {
      kind: 'planning',
      instructions: this.instructions,
      input: {
        goal: structuredClone(goal),
        context: structuredClone(context),
        contract: {
          preserveObjective: true,
          preserveConstraints: true,
          coverDeliverables: true,
          coverSuccessCriteria: true,
          explicitDependencies: true,
        },
      },
      validate: validatePlan,
    });

    return normalizeDependencies(plan.tasks).map((task) => normalizeTask(task, goal.id));
  }
}
