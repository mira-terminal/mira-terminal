import express from 'express';
import { bootstrapMiraInfrastructure } from './runtime-bootstrap.js';

export function healthPayload(runtime) {
  return {
    ok: true,
    service: 'mira-cognitive-os',
    config: runtime.config,
    health: runtime.observability.health.status(),
    modelCircuit: runtime.observability.modelCircuit.snapshot(),
  };
}

export async function readinessPayload({ runtime, query = null } = {}) {
  const checks = {
    configuration: true,
    modelConfigured: runtime.config.modelConfigured || runtime.config.modelProvider === 'none',
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

export function createReadOnlyRuntimeApp({ runtime, query = null } = {}) {
  if (!runtime) throw new Error('runtime is required');
  const app = express();
  app.disable('x-powered-by');

  app.get('/health', (_req, res) => {
    res.json(healthPayload(runtime));
  });

  app.get('/ready', async (_req, res) => {
    const payload = await readinessPayload({ runtime, query });
    res.status(payload.ready ? 200 : 503).json(payload);
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  return app;
}

export async function startMiraRuntime({
  env = process.env,
  fetchImpl = globalThis.fetch,
  pgLoader = () => import('pg'),
  expressFactory = createReadOnlyRuntimeApp,
} = {}) {
  const databaseUrl = String(env.DATABASE_URL || '').trim();
  if (String(env.MIRA_PERSISTENCE || (env.MIRA_ENV === 'production' ? 'postgres' : 'memory')).toLowerCase() === 'postgres' && !databaseUrl) {
    throw new Error('postgres runtime requires DATABASE_URL');
  }

  let pool = null;
  let query = null;

  if (databaseUrl) {
    const { Pool } = await pgLoader();
    pool = new Pool({
      connectionString: databaseUrl,
      max: Number(env.MIRA_DB_POOL_MAX || 10),
      idleTimeoutMillis: Number(env.MIRA_DB_IDLE_TIMEOUT_MS || 30_000),
      connectionTimeoutMillis: Number(env.MIRA_DB_CONNECT_TIMEOUT_MS || 10_000),
      ssl: String(env.MIRA_DB_SSL || 'true').toLowerCase() === 'true'
        ? { rejectUnauthorized: String(env.MIRA_DB_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() === 'true' }
        : false,
    });
    query = (sql, params = []) => pool.query(sql, params);
  }

  const runtime = bootstrapMiraInfrastructure({ env, query, fetchImpl });
  const app = expressFactory({ runtime, query });
  const port = Number(env.PORT || 8080);
  const host = String(env.HOST || '0.0.0.0');

  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(port, host, () => resolve(instance));
    instance.once('error', reject);
  });

  const close = async () => {
    await new Promise((resolve) => server.close(resolve));
    if (pool) await pool.end();
  };

  return { app, server, pool, runtime, close };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  startMiraRuntime()
    .then(({ runtime }) => {
      runtime.observability.traces.record('runtime_started', {
        mode: runtime.config.mode,
        persistence: runtime.config.persistence,
        modelProvider: runtime.config.modelProvider,
      });
      process.stdout.write('Mira Cognitive OS runtime online\n');
    })
    .catch((error) => {
      process.stderr.write(`Mira runtime failed to start: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
