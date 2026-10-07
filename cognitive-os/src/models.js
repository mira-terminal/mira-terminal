function clone(value) {
  return structuredClone(value);
}

function normalizePayload(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    if ('output' in raw) return normalizePayload(raw.output);
    if ('output_text' in raw) return normalizePayload(raw.output_text);
    if ('content' in raw && Object.keys(raw).length === 1) return normalizePayload(raw.content);
    return clone(raw);
  }

  if (typeof raw !== 'string') {
    throw new Error(`Model returned unsupported payload type: ${typeof raw}`);
  }

  const text = raw.trim();
  if (!text) throw new Error('Model returned empty output');

  const unfenced = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  return JSON.parse(unfenced);
}

export class StructuredModelAdapter {
  constructor({ name = 'model', generate, maxParseAttempts = 2 } = {}) {
    if (typeof generate !== 'function') throw new Error('generate function is required');
    this.name = name;
    this.generate = generate;
    this.maxParseAttempts = Math.max(1, Number(maxParseAttempts || 1));
  }

  async complete(request = {}) {
    let lastError = null;
    const { validate, ...modelRequest } = request;

    for (let attempt = 1; attempt <= this.maxParseAttempts; attempt += 1) {
      try {
        const raw = await this.generate({
          ...clone(modelRequest),
          attempt,
          repair: lastError ? {
            message: lastError.message,
            instruction: 'Return only a valid structured result matching the requested contract.',
          } : null,
        });
        const value = normalizePayload(raw);
        if (validate) {
          const verdict = await validate(value);
          if (verdict !== true) {
            const reason = typeof verdict === 'string' ? verdict : 'Structured result failed validation';
            throw new Error(reason);
          }
        }
        return value;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw new Error(`${this.name} failed structured completion after ${this.maxParseAttempts} attempt(s): ${lastError?.message || 'unknown error'}`);
  }
}

export class ModelRouter {
  constructor() {
    this.routes = [];
  }

  register(name, adapter, { roles = ['*'], priority = 0 } = {}) {
    if (!name || !adapter || typeof adapter.complete !== 'function') {
      throw new Error('name and adapter.complete are required');
    }
    this.routes.push({ name, adapter, roles: [...roles], priority: Number(priority || 0) });
    return this;
  }

  candidates(role) {
    return this.routes
      .filter((route) => route.roles.includes('*') || route.roles.includes(role))
      .sort((a, b) => b.priority - a.priority);
  }

  async complete(role, request = {}) {
    const candidates = this.candidates(role);
    if (!candidates.length) throw new Error(`No model route registered for role: ${role}`);

    const failures = [];
    for (const route of candidates) {
      try {
        const { validate, ...modelRequest } = request;
        return await route.adapter.complete({ ...clone(modelRequest), validate, role, modelRoute: route.name });
      } catch (error) {
        failures.push(`${route.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    throw new Error(`All model routes failed for role ${role}: ${failures.join(' | ')}`);
  }
}

function validateAgentResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Agent result must be an object';
  if (value.complete !== true && value.complete !== false) return 'Agent result must include boolean complete';
  return true;
}

export function createModelAgent({ router, role, instructions = '' } = {}) {
  if (!router || typeof router.complete !== 'function') throw new Error('router is required');
  if (!role) throw new Error('role is required');

  return async (context) => router.complete(role, {
    kind: 'specialist_execution',
    instructions,
    input: clone(context),
    validate: validateAgentResult,
  });
}
