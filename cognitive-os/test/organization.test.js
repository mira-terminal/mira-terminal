import test from 'node:test';
import assert from 'node:assert/strict';
import { AutonomousOrganization, DepartmentRegistry } from '../src/organization.js';

test('autonomous organization delegates across departments and respects dependencies', async()=>{
  const departments=new DepartmentRegistry()
    .register('research',async()=>({complete:true,evidence:'x'}),{maxBudget:10})
    .register('engineering',async({completed})=>({complete:true,artifact:`built:${completed.length}`}),{maxBudget:20});
  const planner={plan:async()=>[
    {id:'r',department:'research',cost:5},
    {id:'e',department:'engineering',dependsOn:['r'],cost:10},
  ]};
  const org=new AutonomousOrganization({planner,departments,maxMissionBudget:20});
  const result=await org.run({id:'m1',objective:'build'});
  assert.equal(result.status,'completed'); assert.equal(result.spent,15); assert.equal(result.workstreams[1].result.artifact,'built:1');
});

test('organization stops before approval-required work', async()=>{
  let called=false;
  const departments=new DepartmentRegistry().register('ops',async()=>{called=true;return {complete:true};});
  const org=new AutonomousOrganization({planner:{plan:async()=>[{id:'x',department:'ops',approvalRequired:true}]},departments});
  const result=await org.run({id:'m2'});
  assert.equal(result.status,'waiting_approval'); assert.equal(called,false);
});

test('organization blocks work that exceeds department or mission budget', async()=>{
  const departments=new DepartmentRegistry().register('eng',async()=>({complete:true}),{maxBudget:5});
  const org=new AutonomousOrganization({planner:{plan:async()=>[{id:'x',department:'eng',cost:6}]},departments,maxMissionBudget:100});
  const result=await org.run({id:'m3'});
  assert.equal(result.status,'failed'); assert.equal(result.workstreams[0].error,'budget_exceeded');
});
