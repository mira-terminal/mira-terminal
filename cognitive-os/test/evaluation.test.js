import test from 'node:test';
import assert from 'node:assert/strict';
import { EvaluationHarness, ImprovementController } from '../src/evaluation.js';

const harness = new EvaluationHarness({scenarios:[
  {name:'accuracy',critical:true,run:async subject=>({passed:subject.accuracy>=0.9,score:subject.accuracy})},
  {name:'speed',run:async subject=>({passed:subject.speed>=0.5,score:subject.speed})},
]});

test('evaluation harness aggregates pass rate and critical failures', async()=>{
  const r=await harness.evaluate({accuracy:0.95,speed:0.4});
  assert.equal(r.passRate,0.5); assert.deepEqual(r.criticalFailures,[]);
});

test('controlled improvement rejects regression even when average score rises', async()=>{
  const c=new ImprovementController({evaluator:harness,minScoreDelta:0});
  const r=await c.assess({id:'p1',baseline:{accuracy:0.95,speed:0.2},candidate:{accuracy:0.85,speed:1}});
  assert.equal(r.decision,'reject'); assert.deepEqual(r.regressions,['accuracy']);
});

test('controlled improvement requires promotion approval when candidate improves without regression', async()=>{
  const c=new ImprovementController({evaluator:harness,minScoreDelta:0.05,requireApproval:true});
  const r=await c.assess({id:'p2',baseline:{accuracy:0.9,speed:0.5},candidate:{accuracy:1,speed:0.7}});
  assert.equal(r.decision,'awaiting_promotion_approval'); assert.ok(r.delta>=0.05);
});
