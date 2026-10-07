import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AgentRegistry,
  CognitiveOrchestrator,
  CompletionVerifier,
  StaticPlanner,
} from '../src/index.js';

function makeRuntime(taskFactory, registerAgents) {
  const planner = new StaticPlanner(taskFactory);
  const registry = new AgentRegistry();
  registerAgents(registry);
  return new CognitiveOrchestrator({ planner, registry, verifier: new CompletionVerifier() });
}

test('completes a multi-stage goal and performs final verification', async () => {
  let firstId;
  const runtime = makeRuntime(
    async () => {
      firstId = 'task_research';
      return [
        { id: firstId, title: 'Research', role: 'researcher', expectedOutputs: ['evidence'] },
        { id: 'task_build', title: 'Build', role: 'builder', dependsOn: [firstId], expectedOutputs: ['artifact'] },
      ];
    },
    (registry) => {
      registry.register('researcher', async () => ({ complete: true, evidence: 'evidence gathered' }));
      registry.register('builder', async ({ completedTasks }) => ({
        complete: true,
        artifact: `artifact created from ${completedTasks.length} completed dependency`,
        criterion: 'validated',
      }));
    },
  );

  const run = await runtime.run({
    objective: 'Produce a validated artifact',
    deliverables: ['artifact'],
    successCriteria: ['validated'],
  });

  assert.equal(run.status, 'completed');
  assert.equal(run.tasks[0].status, 'completed');
  assert.equal(run.tasks[1].status, 'completed');
  assert.equal(run.finalVerification.ok, true);
});

test('retries when verification fails and records recovery lesson', async () => {
  let calls = 0;
  const runtime = makeRuntime(
    async () => [{ id: 'task_retry', title: 'Retryable task', role: 'worker', expectedOutputs: ['done'], maxAttempts: 2 }],
    (registry) => registry.register('worker', async () => {
      calls += 1;
      return calls === 1 ? { complete: true, note: 'not yet' } : { complete: true, done: true };
    }),
  );

  const run = await runtime.run({ objective: 'Finish retryable work', deliverables: ['done'] });

  assert.equal(run.status, 'completed');
  assert.equal(run.tasks[0].attempts, 2);
  assert.equal(runtime.improvementLog.snapshot().length, 1);
});

test('stops at an approval gate before consequential execution', async () => {
  let executed = false;
  const runtime = makeRuntime(
    async () => [{ id: 'task_sensitive', title: 'Consequential action', role: 'operator', approvalRequired: true }],
    (registry) => registry.register('operator', async () => {
      executed = true;
      return { complete: true };
    }),
  );

  const run = await runtime.run({ objective: 'Execute governed action', riskClass: 'high' });

  assert.equal(run.status, 'waiting_approval');
  assert.equal(run.tasks[0].status, 'waiting_approval');
  assert.equal(executed, false);
});

test('detects unknown dependencies instead of silently narrowing the plan', async () => {
  const runtime = makeRuntime(
    async () => [{ id: 'task_bad', title: 'Broken task', role: 'worker', dependsOn: ['missing_task'] }],
    (registry) => registry.register('worker', async () => ({ complete: true })),
  );

  const run = await runtime.run({ objective: 'Run valid dependency graph' });

  assert.equal(run.status, 'failed');
  assert.match(run.blockers[0], /Unknown dependency/);
});
