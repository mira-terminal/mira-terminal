import test from 'node:test';
import assert from 'node:assert/strict';
import { AdversarialRedTeamArena, CounterfactualSimulator, PreMortemGate } from '../src/simulation.js';

test('counterfactual gate blocks catastrophic tail risk even when average utility is positive', async()=>{
  const simulator=new CounterfactualSimulator({
    scenarioGenerator:async()=>[
      {name:'normal',probability:0.9},
      {name:'tail',probability:0.1,critical:true},
    ],
    simulator:async({scenario})=>scenario.name==='normal'
      ? {utility:1,failureProbability:0.05}
      : {utility:-10,failureProbability:1,irreversibleHarm:true},
  });
  const evaluation=await simulator.evaluate({plan:{id:'p'}});
  const gate=new PreMortemGate({maxExpectedFailure:0.2,minWorstCaseUtility:-2});
  const decision=gate.decide({simulation:evaluation});
  assert.equal(decision.passed,false);
  assert.ok(decision.reasons.includes('irreversible_harm_detected'));
  assert.ok(decision.reasons.includes('worst_case_below_threshold'));
});

test('red team iteratively hardens a vulnerable plan', async()=>{
  const arena=new AdversarialRedTeamArena({
    attackers:[async({plan})=>plan.auth?'':{type:'missing_auth'}],
    evaluator:async({attack})=>attack?{valid:true,severity:0.9,critical:true}:{valid:false,severity:0},
    defender:async({plan,vulnerabilities})=>vulnerabilities.length?{...plan,auth:true}:plan,
    maxRounds:3,
  });
  const result=await arena.harden({plan:{id:'p',auth:false}});
  assert.equal(result.hardened,true);
  assert.equal(result.plan.auth,true);
  assert.equal(result.rounds.length,2);
});

test('red team returns unresolved criticals when bounded repair cannot fix them', async()=>{
  const arena=new AdversarialRedTeamArena({
    attackers:[async()=>({type:'structural'})],
    evaluator:async()=>({valid:true,severity:1,critical:true}),
    defender:async({plan})=>plan,
    maxRounds:2,
  });
  const result=await arena.harden({plan:{id:'p'}});
  assert.equal(result.hardened,false);
  assert.equal(result.unresolvedCritical.length,1);
  const gate=new PreMortemGate();
  const decision=gate.decide({simulation:{expectedFailure:0,worstCaseUtility:0,irreversibleHarmDetected:false,criticalFailures:[]},redTeam:result});
  assert.equal(decision.passed,false);
  assert.ok(decision.reasons.includes('unresolved_red_team_critical'));
});
