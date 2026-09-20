import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ToolDecision,
  ToolExecutor,
  ToolPolicyEngine,
  ToolRegistry,
  denyEffectWhenConstraintPresent,
} from '../src/index.js';

test('low-risk tool executes immediately and records only argument keys in audit metadata', async () => {
  const registry = new ToolRegistry().register('lookup', async ({ query }) => ({ answer: query.toUpperCase() }), {
    riskClass: 'low',
    permissions: ['read'],
  });
  const executor = new ToolExecutor({ registry });

  const result = await executor.execute({ toolName: 'lookup', args: { query: 'mira', secret: 'not-for-audit' } });

  assert.equal(result.status, 'completed');
  assert.equal(result.output.answer, 'MIRA');
  assert.deepEqual(result.argKeys.sort(), ['query', 'secret']);
  assert.equal(JSON.stringify(result).includes('not-for-audit'), false);
});

test('medium/high-risk tool waits for approval and approval is one-use', async () => {
  let calls = 0;
  const registry = new ToolRegistry().register('write', async () => { calls += 1; return { written: true }; }, {
    riskClass: 'high',
    reversible: false,
  });
  const executor = new ToolExecutor({ registry });

  const waiting = await executor.execute({ toolName: 'write' });
  assert.equal(waiting.status, 'waiting_approval');
  assert.equal(calls, 0);

  executor.approve(waiting.requestId);
  const completed = await executor.execute({ requestId: waiting.requestId, toolName: 'write' });
  assert.equal(completed.status, 'completed');
  assert.equal(calls, 1);

  const waitingAgain = await executor.execute({ requestId: waiting.requestId, toolName: 'write' });
  assert.equal(waitingAgain.status, 'waiting_approval');
  assert.equal(calls, 1);
});

test('critical-risk tool is denied by default', async () => {
  let executed = false;
  const registry = new ToolRegistry().register('critical-action', async () => { executed = true; }, { riskClass: 'critical' });
  const executor = new ToolExecutor({ registry });

  const result = await executor.execute({ toolName: 'critical-action' });

  assert.equal(result.status, 'denied');
  assert.equal(result.policy.decision, ToolDecision.DENY);
  assert.equal(executed, false);
});

test('goal constraints can deterministically deny matching tool effects', async () => {
  let executed = false;
  const registry = new ToolRegistry().register('publisher', async () => { executed = true; }, {
    riskClass: 'low',
    effects: ['publication'],
  });
  const policy = new ToolPolicyEngine({
    rules: [denyEffectWhenConstraintPresent({ effect: 'publication', constraint: 'do not publish' })],
  });
  const executor = new ToolExecutor({ registry, policy });

  const result = await executor.execute({
    toolName: 'publisher',
    goal: { constraints: ['do not publish'] },
  });

  assert.equal(result.status, 'denied');
  assert.match(result.policy.reason, /blocks tool effect/);
  assert.equal(executed, false);
});

test('tool timeout fails closed and aborts the supplied signal', async () => {
  let aborted = false;
  const registry = new ToolRegistry().register('slow', async (_args, { signal }) => new Promise((resolve) => {
    signal.addEventListener('abort', () => { aborted = true; resolve({ late: true }); });
  }), { riskClass: 'low', timeoutMs: 15 });
  const executor = new ToolExecutor({ registry });

  const result = await executor.execute({ toolName: 'slow' });

  assert.equal(result.status, 'failed');
  assert.match(result.error, /timed out/);
  assert.equal(aborted, true);
});
