import test from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityGovernor, HashChainedDecisionLedger, InvariantSet } from '../src/governance.js';

test('capability cannot self-promote without human approval', () => {
  const governor=new CapabilityGovernor();
  governor.propose({id:'p'});
  governor.attachEvaluation('p',{decision:'awaiting_promotion_approval',regressions:[],candidate:{criticalFailures:[]}});
  assert.throws(()=>governor.approve('p',{approverType:'agent'}),/human approval/);
  const approved=governor.approve('p',{approverType:'human',approverId:'owner'});
  assert.equal(approved.status,'approved');
});

test('regressed candidate is rejected before approval', () => {
  const governor=new CapabilityGovernor();
  governor.propose({id:'bad'});
  const result=governor.attachEvaluation('bad',{decision:'awaiting_promotion_approval',regressions:['accuracy'],candidate:{criticalFailures:[]}});
  assert.equal(result.status,'rejected');
  assert.throws(()=>governor.approve('bad',{approverType:'human'}),/pass evaluation/);
});

test('invariant can block activation after evaluation and approval', async()=>{
  const invariants=new InvariantSet().register('no-critical-kind',({proposal})=>proposal.kind==='critical'?'critical promotion blocked':true);
  const governor=new CapabilityGovernor({invariants});
  governor.propose({id:'c',kind:'critical'});
  governor.attachEvaluation('c',{decision:'awaiting_promotion_approval',regressions:[],candidate:{criticalFailures:[]}});
  governor.approve('c',{approverType:'human'});
  let applied=false;
  const result=await governor.activate('c',{apply:async()=>{applied=true;}});
  assert.equal(result.activated,false); assert.equal(applied,false); assert.equal(result.proposal.status,'blocked');
});

test('hash-chained decision ledger detects tampering', () => {
  const ledger=new HashChainedDecisionLedger();
  ledger.append({type:'a'}); ledger.append({type:'b'});
  assert.equal(ledger.verify(),true);
  ledger.entries[0].event.type='tampered';
  assert.equal(ledger.verify(),false);
});

test('approved reversible capability can activate and roll back', async()=>{
  const governor=new CapabilityGovernor();
  governor.propose({id:'x',reversible:true});
  governor.attachEvaluation('x',{decision:'awaiting_promotion_approval',regressions:[],candidate:{criticalFailures:[]}});
  governor.approve('x',{approverType:'human'});
  const active=await governor.activate('x',{apply:async()=>({version:2})});
  assert.equal(active.activated,true); assert.equal(active.proposal.status,'active');
  const rolled=await governor.rollback('x',{rollback:async()=>({version:1})});
  assert.equal(rolled.rolledBack,true); assert.equal(rolled.proposal.status,'rolled_back');
});
