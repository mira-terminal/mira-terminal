import test from 'node:test';
import assert from 'node:assert/strict';
import { BoundedWorkerScheduler } from '../src/scheduler.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('scheduler enforces global and per-domain concurrency', async () => {
  let active=0, maxActive=0, activeA=0, maxA=0;
  const scheduler=new BoundedWorkerScheduler({concurrency:2,perDomainConcurrency:{a:1}});
  const result=await scheduler.run([
    {id:'1',domain:'a'},{id:'2',domain:'a'},{id:'3',domain:'b'},
  ],{
    execute:async(task)=>{
      active++; maxActive=Math.max(maxActive,active);
      if(task.domain==='a'){activeA++;maxA=Math.max(maxA,activeA);}
      await sleep(10);
      if(task.domain==='a')activeA--;
      active--;
      return {ok:true};
    }
  });
  assert.equal(maxActive,2);
  assert.equal(maxA,1);
  assert.equal(result.results.filter(x=>x.status==='completed').length,3);
});

test('scheduler blocks tasks beyond run budget', async () => {
  const scheduler=new BoundedWorkerScheduler({concurrency:2});
  const result=await scheduler.run([
    {id:'a',cost:4,priority:10},{id:'b',cost:4,priority:1},
  ],{budget:5,execute:async()=>({ok:true})});
  assert.equal(result.results.find(x=>x.id==='a').status,'completed');
  assert.equal(result.results.find(x=>x.id==='b').status,'budget_blocked');
});

test('scheduler uses distributed lease fencing and releases lease', async () => {
  const calls=[];
  const leaseStore={
    acquire:async(resource,owner)=>({resourceId:resource,ownerId:owner,fencingToken:'f1'}),
    release:async(...args)=>{calls.push(args);return true;},
  };
  const scheduler=new BoundedWorkerScheduler({leaseStore});
  let token;
  const result=await scheduler.run([{id:'x'}],{
    ownerId:'worker-1',
    execute:async(_task,ctx)=>{token=ctx.fencingToken;return {ok:true};},
  });
  assert.equal(result.results[0].status,'completed');
  assert.equal(token,'f1');
  assert.deepEqual(calls[0],['task:x','worker-1','f1']);
});

test('scheduler enforces queue backpressure', async () => {
  const scheduler=new BoundedWorkerScheduler({maxQueue:1});
  await assert.rejects(
    ()=>scheduler.run([{id:'a'},{id:'b'}],{execute:async()=>({})}),
    /queue capacity exceeded/,
  );
});
