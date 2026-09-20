import test from 'node:test';
import assert from 'node:assert/strict';
import { CapabilitySelfModel, CurriculumEngine, GovernanceAuditor } from './meta-cognition.js';

test('self model tracks competence and calibration instead of raw confidence alone', () => {
  const model = new CapabilitySelfModel();
  model.record('research',{passed:true,confidence:0.9});
  model.record('research',{passed:false,confidence:0.9});
  model.record('coding',{passed:true,confidence:0.7});
  const research=model.assess('research');
  assert.equal(research.samples,2);
  assert.ok(research.calibrationError>0.4);
  assert.equal(model.weakest({limit:1})[0].domain,'research');
});

test('self model keeps explicit known-unknowns until evidence resolves them', () => {
  const model=new CapabilitySelfModel();
  model.markUnknown('provider:latency',{reason:'not benchmarked',severity:'high'});
  assert.equal(model.openUnknowns().length,1);
  model.resolveUnknown('provider:latency',{evidence:['benchmark-1']});
  assert.equal(model.openUnknowns().length,0);
});

test('curriculum generates bounded unique validated evaluation scenarios from weaknesses', async()=>{
  const engine=new CurriculumEngine({
    maxScenarios:2,
    validator:async scenario=>scenario.target==='research',
    generator:async()=>[
      {name:'hard research 1',target:'research',run:async()=>({passed:true,score:1})},
      {name:'hard research 2',target:'research',run:async()=>({passed:true,score:1})},
      {name:'ignored third',target:'research',run:async()=>({passed:true,score:1})},
    ],
  });
  const first=await engine.generate({weakCapabilities:[{domain:'research'}]});
  assert.equal(first.length,2);
  const second=await engine.generate({weakCapabilities:[{domain:'research'}]});
  assert.equal(second.length,0);
  assert.equal(engine.asEvaluationScenarios().length,2);
});

test('governance auditor detects both ledger tampering and illegal active state', () => {
  const fakeGovernor={
    proposals:new Map([['p',{id:'p',status:'active',approvedBy:null,evaluation:{regressions:['accuracy'],candidate:{criticalFailures:[]}},activatedAt:'x'}]]),
    ledger:{verify:()=>false},
  };
  const audit=new GovernanceAuditor().audit(fakeGovernor);
  assert.equal(audit.ok,false);
  assert.ok(audit.findings.some(f=>f.code==='LEDGER_INTEGRITY_FAILURE'));
  assert.ok(audit.findings.some(f=>f.code==='MISSING_HUMAN_APPROVAL'));
  assert.ok(audit.findings.some(f=>f.code==='ACTIVE_WITH_REGRESSION'));
});
