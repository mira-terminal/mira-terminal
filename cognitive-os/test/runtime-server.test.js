import test from 'node:test';
import assert from 'node:assert/strict';
import { healthPayload, readinessPayload, startMiraRuntime } from '../src/runtime-server.js';

function fakeRuntime(overrides = {}) {
  return {
    config: {
      mode:'production',
      modelProvider:'openai',
      modelConfigured:true,
      persistence:'postgres',
      ...overrides,
    },
    observability:{
      health:{status:()=>({status:'healthy',healthy:true,reasons:[]})},
      modelCircuit:{snapshot:()=>({state:'closed',failures:0,openedAt:null})},
      traces:{record:()=>{}},
    },
  };
}

test('health payload contains only safe runtime configuration', () => {
  const payload=healthPayload(fakeRuntime());
  assert.equal(payload.ok,true);
  assert.equal(payload.config.modelConfigured,true);
  assert.equal(JSON.stringify(payload).includes('OPENAI_API_KEY'),false);
});

test('readiness fails closed when postgres cannot be queried', async () => {
  const payload=await readinessPayload({
    runtime:fakeRuntime(),
    query:async()=>{throw new Error('offline');},
  });
  assert.equal(payload.ready,false);
  assert.equal(payload.checks.database,false);
});

test('readiness succeeds after database check and configured model', async () => {
  const payload=await readinessPayload({
    runtime:fakeRuntime(),
    query:async()=>({rows:[{ok:1}]}),
  });
  assert.equal(payload.ready,true);
});

test('production runtime refuses postgres startup without DATABASE_URL before loading pg', async () => {
  let pgLoaded=false;
  await assert.rejects(
    ()=>startMiraRuntime({
      env:{
        MIRA_ENV:'production',
        MIRA_PERSISTENCE:'postgres',
        MIRA_MODEL_PROVIDER:'openai',
        MIRA_MODEL:'model-x',
        OPENAI_API_KEY:'secret',
      },
      pgLoader:async()=>{pgLoaded=true;return {};},
    }),
    /DATABASE_URL/,
  );
  assert.equal(pgLoaded,false);
});
