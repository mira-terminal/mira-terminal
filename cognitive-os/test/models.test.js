import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ModelPlanner,
  ModelRouter,
  StructuredModelAdapter,
  createModelAgent,
} from '../src/index.js';

test('structured adapter requests a repair after malformed model output', async () => {
  let calls = 0;
  const adapter = new StructuredModelAdapter({
    name: 'repairable',
    maxParseAttempts: 2,
    generate: async ({ repair }) => {
      calls += 1;
      if (calls === 1) {
        assert.equal(repair, null);
        return 'not-json';
      }
      assert.match(repair.message, /Unexpected token|JSON/);
      return '```json\n{"complete":true,"result":"fixed"}\n```';
    },
  });

  const value = await adapter.complete({
    validate: (candidate) => candidate.complete === true || 'complete required',
  });

  assert.equal(calls, 2);
  assert.equal(value.result, 'fixed');
});

test('model router falls back to the next compatible model route', async () => {
  const router = new ModelRouter()
    .register('primary', new StructuredModelAdapter({
      name: 'primary',
      maxParseAttempts: 1,
      generate: async () => { throw new Error('primary unavailable'); },
    }), { roles: ['research'], priority: 10 })
    .register('backup', new StructuredModelAdapter({
      name: 'backup',
      generate: async ({ role, modelRoute }) => ({ complete: true, role, modelRoute }),
    }), { roles: ['*'], priority: 1 });

  const result = await router.complete('research', {
    validate: (value) => value.complete === true || 'complete required',
  });

  assert.equal(result.modelRoute, 'backup');
  assert.equal(result.role, 'research');
});

test('model planner preserves the full goal contract and normalizes dependencies', async () => {
  let captured;
  const router = new ModelRouter().register('planner-model', new StructuredModelAdapter({
    name: 'planner-model',
    generate: async (request) => {
      captured = request;
      return {
        tasks: [
          { title: 'Research evidence', role: 'research', expectedOutputs: ['evidence'] },
          { title: 'Build artifact', role: 'builder', dependsOn: ['Research evidence'], expectedOutputs: ['artifact'] },
        ],
      };
    },
  }), { roles: ['planner'] });

  const planner = new ModelPlanner({ router });
  const goal = {
    id: 'goal_1',
    objective: 'Produce a validated artifact',
    constraints: ['do not publish'],
    deliverables: ['artifact'],
    successCriteria: ['validated'],
    riskClass: 'low',
    metadata: {},
  };
  const tasks = await planner.plan(goal, { world: { version: 3 }, memory: { episodes: [] } });

  assert.deepEqual(captured.input.goal.constraints, ['do not publish']);
  assert.deepEqual(captured.input.goal.deliverables, ['artifact']);
  assert.deepEqual(captured.input.goal.successCriteria, ['validated']);
  assert.equal(captured.input.contract.preserveConstraints, true);
  assert.equal(tasks[0].id, 'step_1');
  assert.equal(tasks[1].id, 'step_2');
  assert.deepEqual(tasks[1].dependsOn, ['step_1']);
});

test('model-backed specialist receives goal, task, memory and world context', async () => {
  let captured;
  const router = new ModelRouter().register('specialist-model', new StructuredModelAdapter({
    name: 'specialist-model',
    generate: async (request) => {
      captured = request;
      return { complete: true, evidence: 'checked' };
    },
  }), { roles: ['analyst'] });

  const agent = createModelAgent({ router, role: 'analyst', instructions: 'Verify before concluding.' });
  const result = await agent({
    goal: { objective: 'Check claim' },
    task: { title: 'Analyze' },
    memory: { semantic: { rule: 'truth first' } },
    world: { version: 7 },
    completedTasks: [],
  });

  assert.equal(result.complete, true);
  assert.equal(result.evidence, 'checked');
  assert.equal(captured.instructions, 'Verify before concluding.');
  assert.equal(captured.input.memory.semantic.rule, 'truth first');
  assert.equal(captured.input.world.version, 7);
});
