import test from 'node:test';
import assert from 'node:assert/strict';
import { EvaluationHarness, ImprovementController } from '../src/evaluation.js';
import { CapabilityGovernor } from '../src/governance.js';
import { ImprovementLab } from '../src/improvement-lab.js';

function makeLab(generator,{maxCandidates=5}={}){
  const evaluator=new EvaluationHarness({scenarios:[
    {name:'quality',critical:true,run:async s=>({passed:s.quality>=0.8,score:s.quality})},
    {name:'reliability',run:async s=>({passed:s.reliability>=0.7,score:s.reliability})},
  ]});
  const controller=new ImprovementController({evaluator,minScoreDelta:0.02,requireApproval:true});
  const governor=new CapabilityGovernor();
  return {lab:new ImprovementLab({generator,improvementController:controller,capabilityGovernor:governor,maxCandidates}),governor};
}

test('improvement lab generates, evaluates and ranks candidates without activating them',async()=>{
  const {lab,governor}=makeLab(async()=>[
    {id:'good',subject:{quality:0.95,reliability:0.9}},
    {id:'bad',subject:{quality:0.7,reliability:1}},
  ]);
  const cycle=await lab.runCycle({baseline:{quality:0.8,reliability:0.7},lessons:['retry bottleneck']});
  assert.deepEqual(cycle.promotable.map(x=>x.id),['good']);
  assert.deepEqual(cycle.rejected,['bad']);
  assert.equal(cycle.activationPerformed,false);
  assert.equal(governor.get('good').status,'evaluated');
});

test('improvement lab enforces bounded candidate generation',async()=>{
  const {lab}=makeLab(async()=>[
    {id:'a',subject:{quality:0.9,reliability:0.8}},
    {id:'b',subject:{quality:0.91,reliability:0.8}},
    {id:'c',subject:{quality:0.92,reliability:0.8}},
  ],{maxCandidates:2});
  const cycle=await lab.runCycle({baseline:{quality:0.8,reliability:0.7}});
  assert.equal(cycle.candidateCount,2);
});

test('improvement lab refuses duplicate candidate identities',async()=>{
  const {lab}=makeLab(async()=>[
    {id:'same',subject:{quality:0.9,reliability:0.8}},
    {id:'same',subject:{quality:0.95,reliability:0.9}},
  ]);
  await assert.rejects(()=>lab.runCycle({baseline:{quality:0.8,reliability:0.7}}),/duplicate candidate id/);
});
