import crypto from 'node:crypto';

const clone = (value) => structuredClone(value);

function safeIdentifier(value) {
  const text = String(value || '');
  if (!/^[a-z_][a-z0-9_]*$/.test(text)) throw new Error(`unsafe SQL identifier: ${value}`);
  return text;
}

function rowsOf(result) {
  return result?.rows || result?.data || [];
}

export class ConcurrencyConflictError extends Error {
  constructor(message = 'state version conflict') {
    super(message);
    this.name = 'ConcurrencyConflictError';
  }
}

export class PostgresStateStore {
  constructor({ query, schema = 'mira_core' } = {}) {
    if (typeof query !== 'function') throw new Error('query function is required');
    this.query = query;
    this.schema = safeIdentifier(schema);
  }

  async load(id, { kind = 'run' } = {}) {
    const result = await this.query(
      `select payload, version, status from ${this.schema}.state where id = $1 and kind = $2`,
      [String(id), String(kind)],
    );
    const row = rowsOf(result)[0];
    if (!row) return null;
    return { ...clone(row.payload), _version: Number(row.version), _status: row.status };
  }

  async save(state, { kind = 'run', expectedVersion = state?._version ?? 0, status = state?.status ?? null } = {}) {
    if (!state?.id) throw new Error('state.id is required');
    const payload = clone(state);
    delete payload._version;
    delete payload._status;

    const result = await this.query(
      `insert into ${this.schema}.state (id, kind, payload, status, version)
       values ($1, $2, $3::jsonb, $4, 1)
       on conflict (kind, id) do update
       set payload = excluded.payload,
           status = excluded.status,
           version = ${this.schema}.state.version + 1,
           updated_at = now()
       where ${this.schema}.state.version = $5
       returning version, status`,
      [String(state.id), String(kind), JSON.stringify(payload), status, Number(expectedVersion)],
    );

    const row = rowsOf(result)[0];
    if (!row) throw new ConcurrencyConflictError();
    return { ...payload, _version: Number(row.version), _status: row.status };
  }

  async list({ kind = 'run', status = null, limit = 100 } = {}) {
    const result = await this.query(
      `select id, payload, version, status from ${this.schema}.state
       where kind = $1 and ($2::text is null or status = $2)
       order by updated_at desc
       limit $3`,
      [String(kind), status, Math.max(1, Number(limit))],
    );
    return rowsOf(result).map((row) => ({
      ...clone(row.payload),
      id: row.id,
      _version: Number(row.version),
      _status: row.status,
    }));
  }
}

export class PostgresEventJournal {
  constructor({ query, schema = 'mira_core' } = {}) {
    if (typeof query !== 'function') throw new Error('query function is required');
    this.query = query;
    this.schema = safeIdentifier(schema);
  }

  async append(event) {
    const streamId = String(event.streamId || event.runId || event.missionId || 'global');
    const eventType = String(event.type || 'event');
    const result = await this.query(
      `insert into ${this.schema}.event (stream_id, event_type, payload)
       values ($1, $2, $3::jsonb)
       returning sequence, created_at`,
      [streamId, eventType, JSON.stringify(clone(event))],
    );
    const row = rowsOf(result)[0];
    return { ...clone(event), sequence: Number(row?.sequence || 0), createdAt: row?.created_at || null };
  }

  async read(streamId, { afterSequence = 0, limit = 1000 } = {}) {
    const result = await this.query(
      `select sequence, event_type, payload, created_at
       from ${this.schema}.event
       where stream_id = $1 and sequence > $2
       order by sequence asc
       limit $3`,
      [String(streamId), Number(afterSequence), Math.max(1, Number(limit))],
    );
    return rowsOf(result).map((row) => ({
      ...clone(row.payload),
      sequence: Number(row.sequence),
      eventType: row.event_type,
      createdAt: row.created_at,
    }));
  }
}

export class PostgresLeaseStore {
  constructor({ query, schema = 'mira_core', defaultTtlMs = 30_000 } = {}) {
    if (typeof query !== 'function') throw new Error('query function is required');
    this.query = query;
    this.schema = safeIdentifier(schema);
    this.defaultTtlMs = Math.max(1000, Number(defaultTtlMs));
  }

  async acquire(resourceId, ownerId, { ttlMs = this.defaultTtlMs } = {}) {
    const token = crypto.randomUUID();
    const result = await this.query(
      `insert into ${this.schema}.lease (resource_id, owner_id, fencing_token, expires_at)
       values ($1, $2, $3, now() + ($4 * interval '1 millisecond'))
       on conflict (resource_id) do update
       set owner_id = excluded.owner_id,
           fencing_token = excluded.fencing_token,
           expires_at = excluded.expires_at,
           updated_at = now()
       where ${this.schema}.lease.expires_at <= now()
          or ${this.schema}.lease.owner_id = excluded.owner_id
       returning resource_id, owner_id, fencing_token, expires_at`,
      [String(resourceId), String(ownerId), token, Math.max(1000, Number(ttlMs))],
    );
    const row = rowsOf(result)[0];
    if (!row) return null;
    return {
      resourceId: row.resource_id,
      ownerId: row.owner_id,
      fencingToken: row.fencing_token,
      expiresAt: row.expires_at,
    };
  }

  async release(resourceId, ownerId, fencingToken) {
    const result = await this.query(
      `delete from ${this.schema}.lease
       where resource_id = $1 and owner_id = $2 and fencing_token = $3
       returning resource_id`,
      [String(resourceId), String(ownerId), String(fencingToken)],
    );
    return rowsOf(result).length === 1;
  }
}
