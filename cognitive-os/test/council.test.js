import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentLifecycleManager, DeliberativeCouncil } from '../src/council.js';

test('lifecycle ranks agents by observed performance and retires chronic underperformers', () => {
  const lifecycle = new AgentLifecycleManager({ minSamplesBeforeRetire: 2, retireBelowScore: 0.4 });
  lifecycle.register({ id:'a', role:'analyst', handler:async()=>({answer:'A'}), cost:2 });
  lifecycle.register({ id:'b', role:'analyst', handler:async()=>({answer:'B'}), cost:1 });
  lifecycle.recordOutcome('a',{passed:true,score:0.9});
  lifecycle.recordOutcome('a',{passed:true,score:0.8});
  lifecycle.recordOutcome('b',{passed:false,score:0.1});
  lifecycle.recordOutcome('b',{passed:false,score:0.2});
  assert.deepEqual(lifecycle.select({role:'analyst'}).map(x=>x.id),['a','b']);
  assert.deepEqual(lifecycle.retireUnderperformers(),['b']);
  assert.deepEqual(lifecycle.active().map(x=>x.id),['a']);
});

test('lifecycle can spawn bounded specialist agents', async () => {
  const lifecycle = new AgentLifecycleManager({ maxAgents: 2 });
  await lifecycle.spawn(async spec=>({ id:'spawned', role:spec.role, capabilities:['x'], handler:async()=>({ok:true}) }),{role:'researcher'});
  assert.equal(lifecycle.describe('spawned').provenance,'spawned');
  lifecycle.register({ id:'second', role:'researcher', handler:async()=>({ok:true}) });
  await assert.rejects(()=>lifecycle.spawn(async()=>({id:'third',role:'x',handler:async()=>({})})),/capacity/);
});

test('council gathers independent proposals and surfaces disagreement for escalation', async () => {
  const lifecycle = new AgentLifecycleManager();
  lifecycle.register({id:'one',role:'strategist',handler:async()=>({answer:'A'})});
  lifecycle.register({id:'two',role:'strategist',handler:async()=>({answer:'B'})});
  lifecycle.register({id:'three',role:'strategist',handler:async()=>({answer:'C'})});
  const scores={A:0.9,B:0.65,C:0.4};
  const council = new DeliberativeCouncil({ lifecycle, disagreementThreshold:0.3, evaluator:async({proposal})=>({score:scores[proposal.answer]}) });
  const result=await council.deliberate({question:'choose',role:'strategist',members:3});
  assert.equal(result.decision.answer,'A');
  assert.equal(result.selectedAgentId,'one');
  assert.equal(result.requiresEscalation,true);
  assert.equal(result.proposals.length,3);
});
