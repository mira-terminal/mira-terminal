import { makeId, RunStatus, TaskStatus, normalizeGoal } from './contracts.js';
import { MemoryStore } from './memory.js';
import { WorldModel } from './world-model.js';
import { ImprovementLog } from './improvement.js';

function clone(value) {
  return structuredClone(value);
}

export class CognitiveOrchestrator {
  constructor({ planner, registry, verifier, memory, worldModel, improvementLog } = {}) {
    if (!planner) throw new Error('planner is required');
    if (!registry) throw new Error('registry is required');
    if (!verifier) throw new Error('verifier is required');

    this.planner = planner;
    this.registry = registry;
    this.verifier = verifier;
    this.memory = memory || new MemoryStore();
    this.worldModel = worldModel || new WorldModel();
    this.improvementLog = improvementLog || new ImprovementLog();
    this.approvals = new Set();
  }

  approve(taskId) {
    this.approvals.add(taskId);
  }

  async run(goalInput) {
    const goal = normalizeGoal(goalInput);
    const run = {
      id: makeId('run'),
      goal,
      status: RunStatus.PLANNED,
      tasks: [],
      blockers: [],
      finalVerification: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };

    this.memory.setWorking(`run:${run.id}:goal`, goal);
    this.worldModel.observe({ type: 'goal_received', goalId: goal.id, objective: goal.objective });

    run.tasks = await this.planner.plan(goal, {
      memory: this.memory.snapshot(),
      world: this.worldModel.snapshot(),
    });
    run.status = RunStatus.RUNNING;

    const taskById = new Map(run.tasks.map((t) => [t.id, t]));
    const unknownDeps = run.tasks.flatMap((t) => t.dependsOn.filter((dep) => !taskById.has(dep)).map((dep) => ({ task: t, dep })));
    if (unknownDeps.length) {
      run.status = RunStatus.FAILED;
      run.blockers.push(...unknownDeps.map(({ task, dep }) => `Unknown dependency ${dep} for ${task.title}`));
      run.finishedAt = new Date().toISOString();
      return clone(run);
    }

    while (true) {
      const pending = run.tasks.filter((t) => t.status === TaskStatus.PENDING);
      if (!pending.length) break;

      let progressed = false;

      for (const task of pending) {
        const dependencies = task.dependsOn.map((id) => taskById.get(id));
        if (dependencies.some((d) => [TaskStatus.FAILED, TaskStatus.BLOCKED].includes(d.status))) {
          task.status = TaskStatus.BLOCKED;
          task.errors.push('Dependency failed or blocked');
          progressed = true;
          continue;
        }
        if (dependencies.some((d) => d.status !== TaskStatus.COMPLETED)) continue;

        if (task.approvalRequired && !this.approvals.has(task.id)) {
          task.status = TaskStatus.WAITING_APPROVAL;
          run.status = RunStatus.WAITING_APPROVAL;
          run.blockers.push(`Approval required for task ${task.id}: ${task.title}`);
          run.finishedAt = new Date().toISOString();
          return clone(run);
        }

        progressed = true;
        await this.#executeTask(task, run, goal);
      }

      if (!progressed) {
        run.status = RunStatus.BLOCKED;
        run.blockers.push('No executable task remains; dependency cycle or unresolved state detected');
        run.finishedAt = new Date().toISOString();
        return clone(run);
      }
    }

    if (run.tasks.some((t) => [TaskStatus.FAILED, TaskStatus.BLOCKED].includes(t.status))) {
      run.status = RunStatus.FAILED;
      run.finishedAt = new Date().toISOString();
      return clone(run);
    }

    run.finalVerification = await this.verifier.verifyGoal(goal, run.tasks);
    if (!run.finalVerification.ok) {
      run.status = RunStatus.FAILED;
      this.improvementLog.record({
        type: 'goal_verification_failure',
        goalId: goal.id,
        reasons: run.finalVerification.reasons,
      });
    } else {
      run.status = RunStatus.COMPLETED;
      this.memory.addEpisode({
        type: 'goal_completed',
        goalId: goal.id,
        objective: goal.objective,
        runId: run.id,
      });
    }

    run.finishedAt = new Date().toISOString();
    this.memory.setWorking(`run:${run.id}:final`, run);
    return clone(run);
  }

  async #executeTask(task, run, goal) {
    task.status = TaskStatus.RUNNING;

    while (task.attempts < task.maxAttempts) {
      task.attempts += 1;
      this.worldModel.observe({ type: 'task_attempt', taskId: task.id, attempt: task.attempts });

      try {
        const result = await this.registry.execute(task.role, {
          goal: clone(goal),
          task: clone(task),
          completedTasks: clone(run.tasks.filter((t) => t.status === TaskStatus.COMPLETED)),
          memory: this.memory.snapshot(),
          world: this.worldModel.snapshot(),
        });

        const verification = await this.verifier.verifyTask(task, result);
        task.result = clone(result);
        task.verification = clone(verification);

        if (verification.ok) {
          task.status = TaskStatus.COMPLETED;
          this.memory.addEpisode({
            type: 'task_completed',
            goalId: goal.id,
            taskId: task.id,
            title: task.title,
            attempt: task.attempts,
          });
          this.worldModel.observe({ type: 'task_completed', taskId: task.id });
          return;
        }

        task.errors.push(...verification.reasons);
        this.improvementLog.record({
          type: 'task_verification_failure',
          goalId: goal.id,
          taskId: task.id,
          attempt: task.attempts,
          reasons: verification.reasons,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        task.errors.push(message);
        this.improvementLog.record({
          type: 'task_execution_error',
          goalId: goal.id,
          taskId: task.id,
          attempt: task.attempts,
          error: message,
        });
      }
    }

    task.status = TaskStatus.FAILED;
    this.worldModel.observe({ type: 'task_failed', taskId: task.id, errors: task.errors });
  }
}
