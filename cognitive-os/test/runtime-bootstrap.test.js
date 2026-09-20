import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bootstrapMiraInfrastructure,
  publicRuntimeConfig,
  readMiraRuntimeConfig,
} from '../src/runtime-bootstrap.js';

test('production fails closed when model credentials are missing', () => {
  assert.throws(
    () => readMiraRuntimeConfig({
      MIRA_ENV:'production',
      MIRA_MODEL_PROVIDER:'openai',
      MIRA_MODEL:'model-x',
      MIRA_PERSISTENCE:'postgres',
    }),
    /OPENAI_API_KEY/,
  );
});

test('production postgres configuration refuses to boot without query adapter', () => {
  assert.throws(
    () => bootstrapMiraInfrastructure({
      env:{
        MIRA_ENV:'production',
        MIRA_MODEL_PROVIDER:'openai',
        MIRA_MODEL:'model-x',
        OPENAI_API_KEY:'secret',
        MIRA_PERSISTENCE:'postgres',
      },
      fetchImpl:async()=>({}),
    }),
    /query adapter/,
  );
});

test('production bootstrap creates model, scheduler and database adapters without exposing secret', () => {
  const runtime=bootstrapMiraInfrastructure({
    env:{
      MIRA_ENV:'production',
      MIRA_MODEL_PROVIDER:'openai',
      MIRA_MODEL:'model-x',
      OPENAI_API_KEY:'secret-value',
      MIRA_PERSISTENCE:'postgres',
      MIRA_WORKER_CONCURRENCY:'8',
    },
    query:async()=>({rows:[]}),
    fetchImpl:async()=>({}),
  });
  assert.equal(runtime.config.mode,'production');
  assert.equal(runtime.config.modelConfigured,true);
  assert.equal(runtime.config.workerConcurrency,8);
  assert.ok(runtime.modelAdapter);
  assert.ok(runtime.leaseStore);
  assert.equal(JSON.stringify(runtime.config).includes('secret-value'),false);
});

test('development can boot entirely in memory with no model credentials', () => {
  const runtime=bootstrapMiraInfrastructure({
    env:{
      MIRA_ENV:'development',
      MIRA_MODEL_PROVIDER:'none',
      MIRA_PERSISTENCE:'memory',
    },
  });
  assert.equal(runtime.modelAdapter,null);
  assert.equal(runtime.leaseStore,null);
  assert.equal(runtime.config.databaseConfigured,false);
});

test('public configuration never includes raw API key', () => {
  const config=readMiraRuntimeConfig({
    MIRA_ENV:'test',
    MIRA_MODEL_PROVIDER:'openai',
    MIRA_MODEL:'m',
    OPENAI_API_KEY:'highly-secret',
    MIRA_PERSISTENCE:'memory',
  });
  const safe=publicRuntimeConfig(config);
  assert.equal('openaiApiKey' in safe,false);
  assert.equal(JSON.stringify(safe).includes('highly-secret'),false);
});
