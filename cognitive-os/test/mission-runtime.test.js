import test from 'node:test';
import assert from 'node:assert/strict';
import { DepartmentRegistry } from '../src/organization.js';
import { EventDrivenMissionRouter, MissionRuntime } from '../src/mission-runtime.js';

class Store {
  constructor(){this.map=new Map();}
  async save(state){this.map.set(state.id,structuredClone(state));return structuredClone(state);}
  async load(id){const v=this.map.get(id);return v?structuredClone(v):null;}
}
class Journal { constructor(){this.events=[];} async append(e){this.events.push(structuredClone(e));} }

test('persistent mission resumes after approval without repeating completed department work', async()=>{
  const counters={research:0,ops:0};
  const departments=new DepartmentRegistry()
    .register('research',async()=>{counters.research++;return {complete:true,evidence:'x'};},{maxBudget:10})
    .register('ops',async()=>{counters.ops++;return {complete:true,artifact:'done'};},{maxBudget:10});
  const planner={plan:async()=>[
    {id:'r',department:'research',cost:1},
    {id:'o',department:'ops',dependsOn:['r'],approvalRequired:true,cost:1},
  ]};
  const store=new Store(); const journal=new Journal();
  const first=new MissionRuntime({planner,departments,store,journal,maxMissionBudget:5});
  const waiting=await first.start({id:'m',objective:'operate'});
  assert.equal(waiting.status,'waiting_approval'); assert.equal(counters.research,1); assert.equal(counters.ops,0);
  const restarted=new MissionRuntime({planner,departments,store,journal,maxMissionBudget:5});
  await restarted.approve('m','o');
  const finished=await restarted.resume('m');
  assert.equal(finished.status,'completed'); assert.equal(counters.research,1); assert.equal(counters.ops,1); assert.equal(finished.spent,2);
  assert.ok(journal.events.some(e=>e.type==='mission_resumed'));
});

test('event router launches matching missions and ignores nonmatches', async()=>{
  const calls=[];
  const runtime={start:async mission=>{calls.push(mission);return {status:'completed',id:mission.id};}};
  const router=new EventDrivenMissionRouter({runtime})
    .register('alert',e=>e.type==='alert',e=>({id:`alert_${e.id}`,objective:'investigate'}));
  const none=await router.dispatch({type:'noop',id:'1'});
  const one=await router.dispatch({type:'alert',id:'2'});
  assert.equal(none.length,0); assert.equal(one.length,1); assert.equal(calls[0].id,'alert_2');
});

test('persistent mission fails closed on unknown dependencies', async()=>{
  const departments=new DepartmentRegistry().register('ops',async()=>({complete:true}));
  const runtime=new MissionRuntime({planner:{plan:async()=>[{id:'x',department:'ops',dependsOn:['missing']}]},departments,store:new Store()});
  await assert.rejects(()=>runtime.start({id:'bad'}),/Unknown mission dependencies/);
});
