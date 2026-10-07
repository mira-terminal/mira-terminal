import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  AgentRegistry,
  CognitiveOrchestrator,
  CompletionVerifier,
  FileEventJournal,
  FileRunStore,
  StaticPlanner,
} from '../src/index.js';

function buildRuntime({ store, journal, counters }) {
  const planner = new StaticPlanner(async () => [
    { id: 'research', title: 'Research once', role: 'research', expectedOutputs: ['evidence'] },
    {
      id: 'consequential',
      title: 'Governed execution',
      role: 'operator',
      dependsOn: ['research'],
      approvalRequired: true,
      expectedOutputs: ['artifact'],
    },
  ]);

  const registry = new AgentRegistry()
    .register('research', async () => {
      counters.research += 1;
      return { complete: true, evidence: 'evidence' };
    })
    .register('operator', async () => {
      counters.operator += 1;
      return { complete: true, artifact: 'artifact' };
    });

  return new CognitiveOrchestrator({
    planner,
    registry,
    verifier: new CompletionVerifier(),
    runStore: store,
    journal,
  });
}

test('persists a stopped run and resumes after restart without repeating completed work', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mira-cog-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const store = new FileRunStore({ directory: path.join(dir, 'runs') });
  const journal = new FileEventJournal({ file: path.join(dir, 'events.jsonl') });
  const counters = { research: 0, operator: 0 };

  const firstRuntime = buildRuntime({ store, journal, counters });
  const firstRun = await firstRuntime.run({ objective: 'Create governed artifact', deliverables: ['artifact'] });

  assert.equal(firstRun.status, 'waiting_approval');
  assert.equal(firstRun.tasks[0].status, 'completed');
  assert.equal(firstRun.tasks[1].status, 'waiting_approval');
  assert.equal(counters.research, 1);
  assert.equal(counters.operator, 0);

  const persisted = await store.load(firstRun.id);
  assert.equal(persisted.status, 'waiting_approval');
  assert.ok(persisted.cognition.memory.episodes.some((e) => e.type === 'task_completed'));

  const restartedRuntime = buildRuntime({ store, journal, counters });
  restartedRuntime.approve('consequential');
  const resumed = await restartedRuntime.resume(firstRun.id);

  assert.equal(resumed.status, 'completed');
  assert.equal(resumed.tasks[0].attempts, 1);
  assert.equal(resumed.tasks[1].attempts, 1);
  assert.equal(counters.research, 1, 'completed research must not rerun');
  assert.equal(counters.operator, 1);
  assert.ok(restartedRuntime.memory.snapshot().episodes.some((e) => e.type === 'goal_completed'));
  assert.ok(restartedRuntime.worldModel.snapshot().observations.some((e) => e.type === 'run_resumed'));

  const events = await journal.read(firstRun.id);
  assert.ok(events.some((e) => e.type === 'waiting_approval'));
  assert.ok(events.some((e) => e.type === 'run_resumed'));
  assert.ok(events.some((e) => e.type === 'run_completed'));
});

test('resume remains stopped when required approval was not restored', async () => {
  const store = new (await import('../src/persistence.js')).InMemoryRunStore();
  const counters = { research: 0, operator: 0 };
  const first = buildRuntime({ store, journal: null, counters });
  const waiting = await first.run({ objective: 'Governed run', deliverables: ['artifact'] });

  const restarted = buildRuntime({ store, journal: null, counters });
  const stillWaiting = await restarted.resume(waiting.id);

  assert.equal(stillWaiting.status, 'waiting_approval');
  assert.equal(counters.research, 1);
  assert.equal(counters.operator, 0);
});
