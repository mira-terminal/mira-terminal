import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getVercelRuntime,
  resetVercelRuntimeForTests,
  safeHealthPayload,
  safeReadinessPayload,
} from '../src/vercel-runtime.js';

test.afterEach(async () => {
  await resetVercelRuntimeForTests();
});

test('Vercel runtime boots development in memory without external secrets', async () => {
  const { runtime, query, pool } = await getVercelRuntime({
    env:{
      MIRA_ENV:'development',
      MIRA_MODEL_PROVIDER:'none',
      MIRA_PERSISTENCE:'memory',
    },
  });
  assert.equal(runtime.config.mode,'development');
  assert.equal(query,null);
  assert.equal(pool,null);
});

test('Vercel production runtime fails closed without database URL', async () => {
  await assert.rejects(
    () => getVercelRuntime({
      env:{
        MIRA_ENV:'production',
        MIRA_MODEL_PROVIDER:'openai',
        MIRA_MODEL:'model-x',
        OPENAI_API_KEY:'secret',
        MIRA_PERSISTENCE:'postgres',
      },
    }),
    /database_not_configured/,
  );
});

test('Vercel runtime caches configured pool/runtime by safe configuration fingerprint', async () => {
  let poolCount=0;
  const pool={
    query:async()=>({rows:[{ok:1}]}),
    end:async()=>{},
  };
  const options={
    env:{
      MIRA_ENV:'production',
      MIRA_MODEL_PROVIDER:'openai',
      MIRA_MODEL:'model-x',
      OPENAI_API_KEY:'secret',
      MIRA_PERSISTENCE:'postgres',
      DATABASE_URL:'postgres://example',
    },
    fetchImpl:async()=>({}),
    poolFactory:()=>{poolCount++;return pool;},
  };
  const first=await getVercelRuntime(options);
  const second=await getVercelRuntime(options);
  assert.equal(first.runtime,second.runtime);
  assert.equal(poolCount,1);
});

test('safe health payload contains no raw credential values', async () => {
  const { runtime }=await getVercelRuntime({
    env:{
      MIRA_ENV:'test',
      MIRA_MODEL_PROVIDER:'openai',
      MIRA_MODEL:'model-x',
      OPENAI_API_KEY:'very-secret',
      MIRA_PERSISTENCE:'memory',
    },
    fetchImpl:async()=>({}),
  });
  const payload=safeHealthPayload(runtime);
  assert.equal(JSON.stringify(payload).includes('very-secret'),false);
});

test('readiness performs live database check when persistence is postgres', async () => {
  let calls=0;
  const runtime={
    config:{modelProvider:'openai',modelConfigured:true,persistence:'postgres'},
  };
  const payload=await safeReadinessPayload({
    runtime,
    query:async()=>{calls++;return {rows:[{ok:1}]};},
  });
  assert.equal(payload.ready,true);
  assert.equal(calls,1);
});
