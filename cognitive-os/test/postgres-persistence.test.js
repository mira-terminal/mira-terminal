import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ConcurrencyConflictError,
  PostgresEventJournal,
  PostgresLeaseStore,
  PostgresStateStore,
} from '../src/postgres-persistence.js';

test('persistence adapter rejects unsafe schema identifiers', () => {
  assert.throws(() => new PostgresStateStore({ query: async()=>({rows:[]}), schema:'mira_core;drop' }), /unsafe SQL identifier/);
});

test('state store uses optimistic version check and surfaces conflict', async () => {
  const calls=[];
  const query=async(sql,params)=>{calls.push({sql,params});return {rows:[]};};
  const store=new PostgresStateStore({query});
  await assert.rejects(
    () => store.save({id:'run_1',status:'running',_version:3}),
    ConcurrencyConflictError,
  );
  assert.match(calls[0].sql,/where mira_core\.state\.version = \$5/);
  assert.equal(calls[0].params[4],3);
});

test('state store round-trips returned database version', async () => {
  const query=async()=>({rows:[{version:4,status:'running'}]});
  const store=new PostgresStateStore({query});
  const saved=await store.save({id:'run_1',status:'running',value:7,_version:3});
  assert.equal(saved._version,4);
  assert.equal(saved.value,7);
});

test('event journal appends ordered event metadata', async () => {
  let params;
  const journal=new PostgresEventJournal({query:async(_sql,p)=>{params=p;return {rows:[{sequence:12,created_at:'now'}]};}});
  const event=await journal.append({type:'task_completed',runId:'r1',payload:{ok:true}});
  assert.equal(params[0],'r1');
  assert.equal(event.sequence,12);
});

test('lease acquisition uses a fencing token and release requires the same token', async () => {
  const calls=[];
  const query=async(sql,params)=>{
    calls.push({sql,params});
    if (sql.trim().startsWith('insert')) return {rows:[{resource_id:'m1',owner_id:'w1',fencing_token:params[2],expires_at:'later'}]};
    return {rows:[{resource_id:'m1'}]};
  };
  const leases=new PostgresLeaseStore({query});
  const lease=await leases.acquire('m1','w1',{ttlMs:5000});
  assert.ok(lease.fencingToken);
  const released=await leases.release('m1','w1',lease.fencingToken);
  assert.equal(released,true);
  assert.equal(calls[1].params[2],lease.fencingToken);
});
