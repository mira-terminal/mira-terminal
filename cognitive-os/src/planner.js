import { normalizeTask } from './contracts.js';

export class StaticPlanner {
  constructor(taskFactory) {
    this.taskFactory = taskFactory;
  }

  async plan(goal, context) {
    const rawTasks = await this.taskFactory(goal, context);
    if (!Array.isArray(rawTasks) || rawTasks.length === 0) {
      throw new Error('Planner must return at least one task');
    }
    return rawTasks.map((task) => normalizeTask(task, goal.id));
  }
}
