import test from 'node:test';
import assert from 'node:assert/strict';
import { EvaluationHarness, ImprovementController } from '../src/evaluation.js';
import { CapabilityGovernor } from '../src/governance.js';
import { EvidenceLedger } from '../src/adaptive.js';
import { MiraExecutiveSystem } from '../src/executive-system.js';

test('executive system delegates persistent mission control', async()=>{
  const calls=[];
  const missionRuntime={
    start:async m=>{calls.push(['start',m.id]);return {status:'completed'};},
    resume:async id=>{calls.push(['resume',id]);return {status:'completed'};},
    approve:async (m,w)=>{calls.push(['approve',m,w]);return {status:'waiting_approval'};},
  };
  const executive=new MiraExecutiveSystem({missionRuntime});
  await executive.startMission({id:'m'}); await executive.approveWorkstream('m','w'); await executive.resumeMission('m');
  assert.deepEqual(calls,[['start','m'],['approve','m','w'],['resume','m']]);
});

test('executive improvement path evaluates then waits for human promotion approval', async()=>{
  const evaluator=new EvaluationHarness({scenarios:[{name:'quality',critical:true,run:async s=>({passed:s.q>=0.8,score:s.q})}]});
  const improvements=new ImprovementController({evaluator,minScoreDelta:0.05,requireApproval:true});
  const governor=new CapabilityGovernor();
  const executive=new MiraExecutiveSystem({missionRuntime:{start(){},resume(){},approve(){}},improvementController:improvements,capabilityGovernor:governor});
  const result=await executive.proposeImprovement({proposal:{id:'better',description:'better planner'},baseline:{q:0.8},candidate:{q:0.95}});
  assert.equal(result.evaluation.decision,'awaiting_promotion_approval');
  assert.equal(result.governed.status,'evaluated');
  const approved=executive.approveImprovement('better',{approverId:'owner'});
  assert.equal(approved.status,'approved');
  const activated=await executive.activateImprovement('better',{apply:async()=>({active:'v2'})});
  assert.equal(activated.activated,true);
});

test('executive health reports Level 11 plus controlled Level 12 when governance exists',()=>{
  const executive=new MiraExecutiveSystem({
    missionRuntime:{start(){},resume(){},approve(){}},
    improvementController:{assess(){}},
    capabilityGovernor:new CapabilityGovernor(),
    evidenceLedger:new EvidenceLedger(),
  });
  const health=executive.health();
  assert.equal(health.architectureLevel,11); assert.equal(health.controlledLevel12,true); assert.equal(health.governanceLedgerOk,true);
});
