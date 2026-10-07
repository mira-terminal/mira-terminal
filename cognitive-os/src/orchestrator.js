import { makeId, RunStatus, TaskStatus, normalizeGoal } from './contracts.js';
import { MemoryStore } from './memory.js';
import { WorldModel } from './world-model.js';
import { ImprovementLog } from './improvement.js';

function clone(value) {
  return structuredClone(value);
}

export class CognitiveOrchestrator {
  constructor({ planner, registry, verifier, memory, worldModel, improvementLog, runStore = null, journal = null } = {}) {
    if (!planner) throw new Error('planner is required');
    if (!registry) throw new Error('registry is required');
    if (!verifier) throw new Error('verifier is required');

    this.planner = planner;
    this.registry = registry;
    this.verifier = verifier;
    this.memory = memory || new MemoryStore();
    this.worldModel = worldModel || new WorldModel();
    this.improvementLog = improvementLog || new ImprovementLog();
    this.runStore = runStore;
    this.journal = journal;
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
      cognition: null,
      startedAt: new Date().toISOString(),
      updatedAt: null,
      finishedAt: null,
    };

    this.memory.setWorking(`run:${run.id}:goal`, goal);
    this.worldModel.observe({ type: 'goal_received', goalId: goal.id, objective: goal.objective });

    run.tasks = await this.planner.plan(goal, {
      memory: this.memory.snapshot(),
      world: this.worldModel.snapshot(),
    });
    run.status = RunStatus.RUNNING;
    await this.#checkpoint(run, 'run_planned', { taskCount: run.tasks.length });

    return this.#drive(run);
  }

  async resume(runId) {
    if (!this.runStore) throw new Error('resume requires a runStore');
    const run = await this.runStore.load(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    if ([RunStatus.COMPLETED, RunStatus.FAILED].includes(run.status)) return clone(run);

    this.#restoreCognition(run.cognition);
    run.blockers = [];
    run.finishedAt = null;

    for (const task of run.tasks) {
      if (task.status === TaskStatus.WAITING_APPROVAL && this.approvals.has(task.id)) {
        task.status = TaskStatus.PENDING;
      }
    }

    const stillWaiting = run.tasks.find((task) => task.status === TaskStatus.WAITING_APPROVAL);
    if (stillWaiting) {
      run.status = RunStatus.WAITING_APPROVAL;
      run.blockers.push(`Approval required for task ${stillWaiting.id}: ${stillWaiting.title}`);
      await this.#checkpoint(run, 'resume_waiting_approval', { taskId: stillWaiting.id });
      return clone(run);
    }

    run.status = RunStatus.RUNNING;
    this.worldModel.observe({ type: 'run_resumed', runId: run.id });
    await this.#checkpoint(run, 'run_resumed');
    return this.#drive(run);
  }

  async #drive(run) {
    const goal = run.goal;
    const taskById = new Map(run.tasks.map((t) => [t.id, t]));
    const unknownDeps = run.tasks.flatMap((t) => t.dependsOn.filter((dep) => !taskById.has(dep)).map((dep) => ({ task: t, dep })));
    if (unknownDeps.length) {
      run.status = RunStatus.FAILED;
      run.blockers.push(...unknownDeps.map(({ task, dep }) => `Unknown dependency ${dep} for ${task.title}`));
      run.finishedAt = new Date().toISOString();
      await this.#checkpoint(run, 'run_failed', { reason: 'unknown_dependency' });
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
          await this.#checkpoint(run, 'task_blocked', { taskId: task.id });
          continue;
        }
        if (dependencies.some((d) => d.status !== TaskStatus.COMPLETED)) continue;

        if (task.approvalRequired && !this.approvals.has(task.id)) {
          task.status = TaskStatus.WAITING_APPROVAL;
          run.status = RunStatus.WAITING_APPROVAL;
          run.blockers = [`Approval required for task ${task.id}: ${task.title}`];
          run.finishedAt = new Date().toISOString();
          await this.#checkpoint(run, 'waiting_approval', { taskId: task.id });
          return clone(run);
        }

        progressed = true;
        await this.#executeTask(task, run, goal);
        await this.#checkpoint(run, task.status === TaskStatus.COMPLETED ? 'task_completed' : 'task_failed', { taskId: task.id });
      }

      if (!progressed) {
        run.status = RunStatus.BLOCKED;
        run.blockers.push('No executable task remains; dependency cycle or unresolved state detected');
        run.finishedAt = new Date().toISOString();
        await this.#checkpoint(run, 'run_blocked', { reason: 'no_executable_task' });
        return clone(run);
      }
    }

    if (run.tasks.some((t) => [TaskStatus.FAILED, TaskStatus.BLOCKED].includes(t.status))) {
      run.status = RunStatus.FAILED;
      run.finishedAt = new Date().toISOString();
      await this.#checkpoint(run, 'run_failed', { reason: 'task_failure' });
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
    await this.#checkpoint(run, run.status === RunStatus.COMPLETED ? 'run_completed' : 'run_failed');
    return clone(run);
  }

  #restoreCognition(cognition) {
    if (!cognition) return;
    this.memory = new MemoryStore(cognition.memory);
    this.worldModel = new WorldModel(cognition.world);
    this.improvementLog = new ImprovementLog(cognition.improvements);
  }

  async #checkpoint(run, type, payload = {}) {
    run.updatedAt = new Date().toISOString();
    run.cognition = {
      memory: this.memory.snapshot(),
      world: this.worldModel.snapshot(),
      improvements: this.improvementLog.snapshot(),
    };
    if (this.runStore) await this.runStore.save(run);
    if (this.journal) await this.journal.append({ type, runId: run.id, payload: clone(payload) });
  }

  async #executeTask(task, run, goal) {
    task.status = TaskStatus.RUNNING;

    while (task.attempts < task.maxAttempts) {
      task.attempts += 1;
      this.worldModel.observe({ type: 'task_attempt', taskId: task.id, attempt: task.attempts });
      await this.#checkpoint(run, 'task_attempt', { taskId: task.id, attempt: task.attempts });

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
        await this.#checkpoint(run, 'task_verification_failed', { taskId: task.id, attempt: task.attempts, reasons: verification.reasons });
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
        await this.#checkpoint(run, 'task_execution_error', { taskId: task.id, attempt: task.attempts, error: message });
      }
    }

    task.status = TaskStatus.FAILED;
    this.worldModel.observe({ type: 'task_failed', taskId: task.id, errors: task.errors });
  }
}
