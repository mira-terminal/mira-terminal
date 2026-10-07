import test from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveSupervisor, EvidenceLedger } from '../src/adaptive.js';
import { TaskStatus } from '../src/contracts.js';

test('replans only on material high-confidence evidence and preserves completed work', async () => {
  let captured;
  const planner = { plan: async (_goal, ctx) => { captured = ctx; return [
    { id:'research', title:'Research', status:'pending' },
    { id:'new-build', title:'Build new path', dependsOn:['Research'], status:'pending' },
  ]; } };
  const supervisor = new AdaptiveSupervisor({ planner, materialityThreshold:0.7 });
  const tasks = [
    { id:'research', title:'Research', status:TaskStatus.COMPLETED },
    { id:'old-build', title:'Build old path', status:TaskStatus.PENDING },
  ];
  const result = await supervisor.revise({ goal:{id:'g',objective:'ship'}, tasks, result:{ adaptation:{material:true, confidence:0.9, reason:'new constraint', evidence:['e1']} } });
  assert.equal(result.changed,true);
  assert.deepEqual(result.tasks.filter(t=>t.status===TaskStatus.COMPLETED).map(t=>t.id),['research']);
  assert.equal(result.retiredTasks[0].id,'old-build');
  assert.equal(result.replacementTasks[0].id,'new-build');
  assert.equal(captured.adaptation.preserveGoalContract,true);
});

test('replan budget fails closed', async () => {
  const supervisor = new AdaptiveSupervisor({ planner:{plan:async()=>[]}, maxReplans:1 });
  const result = await supervisor.revise({ goal:{}, tasks:[], history:[{}], result:{adaptation:{material:true,reason:'change',confidence:1}} });
  assert.equal(result.blocked,true); assert.equal(result.reason,'replan_budget_exhausted');
});

test('low-confidence adaptation does not churn the plan', async () => {
  const supervisor = new AdaptiveSupervisor({ planner:{plan:async()=>{throw new Error('should not run');}}, materialityThreshold:0.8 });
  const result = await supervisor.revise({ result:{adaptation:{material:true,reason:'weak',confidence:0.4}}, tasks:[] });
  assert.equal(result.changed,false);
});

test('evidence ledger tracks confidence and invalidation', () => {
  const ledger = new EvidenceLedger();
  ledger.record({key:'assumption:x',value:true,confidence:0.8,evidence:['a']});
  const invalid = ledger.invalidate('assumption:x',{reason:'disproved',evidence:['b']});
  assert.equal(invalid.status,'invalidated'); assert.equal(invalid.confidence,0); assert.deepEqual(invalid.evidence,['a','b']);
});
