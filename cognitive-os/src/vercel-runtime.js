import { Pool } from 'pg';
import { bootstrapMiraInfrastructure } from './runtime-bootstrap.js';

let cachedPool = null;
let cachedRuntime = null;
let cachedQuery = null;
let cachedFingerprint = null;

function fingerprint(env) {
  return [
    env.MIRA_ENV || '',
    env.MIRA_MODEL_PROVIDER || '',
    env.MIRA_MODEL || '',
    env.MIRA_PERSISTENCE || '',
    env.MIRA_POSTGRES_SCHEMA || '',
    env.DATABASE_URL ? 'db:configured' : 'db:missing',
    env.OPENAI_API_KEY ? 'key:configured' : 'key:missing',
  ].join('|');
}

export async function getVercelRuntime({
  env = process.env,
  fetchImpl = globalThis.fetch,
  poolFactory = (options) => new Pool(options),
} = {}) {
  const nextFingerprint = fingerprint(env);
  if (cachedRuntime && cachedFingerprint === nextFingerprint) {
    return { runtime: cachedRuntime, query: cachedQuery, pool: cachedPool };
  }

  const persistence = String(
    env.MIRA_PERSISTENCE || (env.MIRA_ENV === 'production' ? 'postgres' : 'memory'),
  ).toLowerCase();

  let query = null;
  let pool = null;

  if (persistence === 'postgres') {
    const databaseUrl = String(env.DATABASE_URL || '').trim();
    if (!databaseUrl) throw new Error('database_not_configured');

    pool = poolFactory({
      connectionString: databaseUrl,
      max: Number(env.MIRA_DB_POOL_MAX || 1),
      idleTimeoutMillis: Number(env.MIRA_DB_IDLE_TIMEOUT_MS || 30_000),
      connectionTimeoutMillis: Number(env.MIRA_DB_CONNECT_TIMEOUT_MS || 10_000),
      ssl: String(env.MIRA_DB_SSL || 'true').toLowerCase() === 'true'
        ? {
            rejectUnauthorized:
              String(env.MIRA_DB_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() === 'true',
          }
        : false,
    });

    if (!pool || typeof pool.query !== 'function') throw new Error('database_pool_invalid');
    query = (sql, params = []) => pool.query(sql, params);
  }

  const runtime = bootstrapMiraInfrastructure({ env, query, fetchImpl });

  if (cachedPool && cachedPool !== pool && typeof cachedPool.end === 'function') {
    try { await cachedPool.end(); } catch {}
  }

  cachedPool = pool;
  cachedRuntime = runtime;
  cachedQuery = query;
  cachedFingerprint = nextFingerprint;

  return { runtime, query, pool };
}

export function safeHealthPayload(runtime) {
  return {
    ok: true,
    service: 'mira-cognitive-os',
    config: runtime.config,
    health: runtime.observability.health.status(),
    modelCircuit: runtime.observability.modelCircuit.snapshot(),
  };
}

export async function safeReadinessPayload({ runtime, query = null } = {}) {
  const checks = {
    configuration: true,
    modelConfigured:
      runtime.config.modelProvider === 'none' ? true : Boolean(runtime.config.modelConfigured),
    database: runtime.config.persistence === 'memory',
  };

  if (runtime.config.persistence === 'postgres') {
    if (typeof query !== 'function') {
      checks.database = false;
    } else {
      try {
        await query('select 1 as ok', []);
        checks.database = true;
      } catch {
        checks.database = false;
      }
    }
  }

  const ready = Object.values(checks).every(Boolean);
  return { ready, checks };
}

export async function resetVercelRuntimeForTests() {
  if (cachedPool && typeof cachedPool.end === 'function') {
    try { await cachedPool.end(); } catch {}
  }
  cachedPool = null;
  cachedRuntime = null;
  cachedQuery = null;
  cachedFingerprint = null;
}
