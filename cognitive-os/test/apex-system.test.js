import test from 'node:test';
import assert from 'node:assert/strict';
import { MiraApexSystem } from './apex-system.js';

test('apex pre-execution path blocks plans that fail red-team/premortem gates', async()=>{
  const apex=new MiraApexSystem({
    executive:{health:()=>({architectureLevel:11})},
    redTeam:{harden:async({plan})=>({hardened:false,plan,unresolvedCritical:[{id:'x'}],rounds:[]})},
    simulator:{evaluate:async()=>({expectedFailure:0,worstCaseUtility:0,irreversibleHarmDetected:false,criticalFailures:[]})},
    preMortem:{decide:({redTeam})=>({passed:redTeam.unresolvedCritical.length===0,reasons:['unresolved_red_team_critical']})},
  });
  const result=await apex.prepareAction({plan:{id:'p'}});
  assert.equal(result.allowed,false);
  assert.equal(result.plan,null);
});

test('apex curriculum automatically targets weak capabilities and known unknowns', async()=>{
  let captured;
  const apex=new MiraApexSystem({
    executive:{},
    selfModel:{weakest:()=>[{domain:'research'}],openUnknowns:()=>[{key:'latency'}]},
    curriculum:{generate:async input=>{captured=input;return ['scenario'];}},
  });
  const result=await apex.expandCurriculum({failures:['f'],lessons:['l']});
  assert.deepEqual(result,['scenario']);
  assert.equal(captured.weakCapabilities[0].domain,'research');
  assert.equal(captured.unknowns[0].key,'latency');
});

test('apex bounds specialist spawning per cycle', async()=>{
  const calls=[];
  const apex=new MiraApexSystem({
    executive:{},maxSpecialistSpawnsPerCycle:2,
    lifecycle:{spawn:async(_factory,spec)=>{calls.push(spec.id);return spec;}},
  });
  const spawned=await apex.spawnSpecialists({factory:async()=>({}),specs:[{id:'a'},{id:'b'},{id:'c'}]});
  assert.deepEqual(calls,['a','b']);
  assert.equal(spawned.length,2);
});

test('apex health explicitly distinguishes 12.9 engineering target from AGI',()=>{
  const apex=new MiraApexSystem({executive:{health:()=>({architectureLevel:11,controlledLevel12:true})},council:{},portfolio:{}});
  const health=apex.health();
  assert.equal(health.engineeringPosition,'controlled-12.9-target');
  assert.equal(health.agiClaim,false);
  assert.equal(health.apexCapabilities.deliberativeCouncil,true);
});
