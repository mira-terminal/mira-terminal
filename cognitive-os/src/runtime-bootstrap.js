import {
  InMemoryEventJournal,
  InMemoryRunStore,
} from './persistence.js';
import {
  PostgresEventJournal,
  PostgresLeaseStore,
  PostgresStateStore,
} from './postgres-persistence.js';
import { BoundedWorkerScheduler } from './scheduler.js';
import { OpenAIResponsesAdapter } from './openai-responses.js';
import {
  CircuitBreaker,
  MetricsRegistry,
  RollingHealthMonitor,
  TraceRecorder,
} from './observability.js';

function enumValue(value, allowed, fallback) {
  const normalized = String(value ?? fallback).toLowerCase();
  if (!allowed.includes(normalized)) {
    throw new Error(`unsupported configuration value: ${normalized}`);
  }
  return normalized;
}

function integer(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`invalid integer configuration: ${value}`);
  }
  return parsed;
}

function number(value, fallback, { min = 0, max = Infinity } = {}) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`invalid numeric configuration: ${value}`);
  }
  return parsed;
}

export function readMiraRuntimeConfig(env = {}) {
  const mode = enumValue(env.MIRA_ENV, ['development', 'test', 'production'], 'development');
  const modelProvider = enumValue(env.MIRA_MODEL_PROVIDER, ['none', 'openai'], mode === 'production' ? 'openai' : 'none');
  const persistence = enumValue(env.MIRA_PERSISTENCE, ['memory', 'postgres'], mode === 'production' ? 'postgres' : 'memory');
  const model = String(env.MIRA_MODEL || '').trim() || null;
  const openaiApiKey = String(env.OPENAI_API_KEY || '').trim() || null;

  const config = {
    mode,
    modelProvider,
    persistence,
    model,
    openaiApiKey,
    postgresSchema: String(env.MIRA_POSTGRES_SCHEMA || 'mira_core').trim(),
    workerConcurrency: integer(env.MIRA_WORKER_CONCURRENCY, 4, { min: 1, max: 128 }),
    maxQueue: integer(env.MIRA_MAX_QUEUE, 100, { min: 1, max: 100_000 }),
    leaseTtlMs: integer(env.MIRA_LEASE_TTL_MS, 30_000, { min: 1000 }),
    modelTimeoutMs: integer(env.MIRA_MODEL_TIMEOUT_MS, 60_000, { min: 1000 }),
    healthWindow: integer(env.MIRA_HEALTH_WINDOW, 100, { min: 1, max: 100_000 }),
    maxErrorRate: number(env.MIRA_MAX_ERROR_RATE, 0.2, { min: 0, max: 1 }),
    maxP95LatencyMs: integer(env.MIRA_MAX_P95_LATENCY_MS, 30_000, { min: 1 }),
  };

  if (mode === 'production' && modelProvider === 'none') {
    throw new Error('production requires a model provider');
  }
  if (modelProvider === 'openai' && !model) {
    throw new Error('OpenAI model provider requires MIRA_MODEL');
  }
  if (modelProvider === 'openai' && !openaiApiKey) {
    throw new Error('OpenAI model provider requires OPENAI_API_KEY');
  }
  if (mode === 'production' && persistence !== 'postgres') {
    throw new Error('production requires postgres persistence');
  }

  return config;
}

export function publicRuntimeConfig(config) {
  return {
    mode: config.mode,
    modelProvider: config.modelProvider,
    persistence: config.persistence,
    model: config.model,
    modelConfigured: config.modelProvider === 'none' ? false : Boolean(config.openaiApiKey && config.model),
    databaseConfigured: config.persistence === 'postgres',
    postgresSchema: config.postgresSchema,
    workerConcurrency: config.workerConcurrency,
    maxQueue: config.maxQueue,
    leaseTtlMs: config.leaseTtlMs,
    modelTimeoutMs: config.modelTimeoutMs,
    healthWindow: config.healthWindow,
    maxErrorRate: config.maxErrorRate,
    maxP95LatencyMs: config.maxP95LatencyMs,
  };
}

export function bootstrapMiraInfrastructure({
  env = process.env,
  query = null,
  fetchImpl = globalThis.fetch,
} = {}) {
  const config = readMiraRuntimeConfig(env);

  let stateStore;
  let journal;
  let leaseStore = null;

  if (config.persistence === 'postgres') {
    if (typeof query !== 'function') {
      throw new Error('postgres persistence requires a query adapter');
    }
    stateStore = new PostgresStateStore({ query, schema: config.postgresSchema });
    journal = new PostgresEventJournal({ query, schema: config.postgresSchema });
    leaseStore = new PostgresLeaseStore({
      query,
      schema: config.postgresSchema,
      defaultTtlMs: config.leaseTtlMs,
    });
  } else {
    stateStore = new InMemoryRunStore();
    journal = new InMemoryEventJournal();
  }

  let modelAdapter = null;
  if (config.modelProvider === 'openai') {
    modelAdapter = new OpenAIResponsesAdapter({
      apiKey: config.openaiApiKey,
      model: config.model,
      fetchImpl,
      timeoutMs: config.modelTimeoutMs,
    });
  }

  const traces = new TraceRecorder();
  const metrics = new MetricsRegistry();
  const health = new RollingHealthMonitor({
    windowSize: config.healthWindow,
    maxErrorRate: config.maxErrorRate,
    maxP95LatencyMs: config.maxP95LatencyMs,
  });
  const modelCircuit = new CircuitBreaker();
  const scheduler = new BoundedWorkerScheduler({
    concurrency: config.workerConcurrency,
    maxQueue: config.maxQueue,
    leaseStore,
    leaseTtlMs: config.leaseTtlMs,
  });

  return {
    config: publicRuntimeConfig(config),
    stateStore,
    journal,
    leaseStore,
    modelAdapter,
    scheduler,
    observability: {
      traces,
      metrics,
      health,
      modelCircuit,
    },
  };
}
