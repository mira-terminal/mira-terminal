const clone = (value) => structuredClone(value);

const DEFAULT_SENSITIVE = /(authorization|api[-_]?key|token|secret|password|cookie|credential)/i;

export function redact(value, { sensitivePattern = DEFAULT_SENSITIVE, replacement = '[REDACTED]' } = {}) {
  if (Array.isArray(value)) return value.map((item) => redact(item, { sensitivePattern, replacement }));
  if (!value || typeof value !== 'object') return value;

  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = sensitivePattern.test(key)
      ? replacement
      : redact(item, { sensitivePattern, replacement });
  }
  return output;
}

export class TraceRecorder {
  constructor({ maxEvents = 10_000 } = {}) {
    this.maxEvents = Math.max(1, Number(maxEvents));
    this.events = [];
  }

  record(type, attributes = {}) {
    const event = {
      sequence: this.events.length + 1,
      at: new Date().toISOString(),
      type: String(type),
      attributes: redact(clone(attributes)),
    };
    this.events.push(event);
    if (this.events.length > this.maxEvents) this.events.splice(0, this.events.length - this.maxEvents);
    return clone(event);
  }

  startSpan(name, attributes = {}) {
    const startedAt = Date.now();
    const start = this.record('span_started', { name, ...attributes });
    return {
      id: start.sequence,
      end: (result = {}) => this.record('span_finished', {
        name,
        spanId: start.sequence,
        durationMs: Math.max(0, Date.now() - startedAt),
        ...result,
      }),
    };
  }

  snapshot() { return clone(this.events); }
}

export class MetricsRegistry {
  constructor() {
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
  }

  increment(name, amount = 1) {
    const next = (this.counters.get(name) || 0) + Number(amount);
    this.counters.set(name, next);
    return next;
  }

  gauge(name, value) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error('gauge value must be finite');
    this.gauges.set(name, number);
    return number;
  }

  observe(name, value, { maxSamples = 1000 } = {}) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error('histogram value must be finite');
    const samples = this.histograms.get(name) || [];
    samples.push(number);
    if (samples.length > maxSamples) samples.splice(0, samples.length - maxSamples);
    this.histograms.set(name, samples);
    return number;
  }

  snapshot() {
    const histograms = {};
    for (const [name, values] of this.histograms.entries()) {
      const sorted = [...values].sort((a, b) => a - b);
      const percentile = (p) => {
        if (!sorted.length) return null;
        const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
        return sorted[index];
      };
      histograms[name] = {
        count: sorted.length,
        min: sorted[0] ?? null,
        max: sorted.at(-1) ?? null,
        mean: sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : null,
        p50: percentile(0.50),
        p95: percentile(0.95),
        p99: percentile(0.99),
      };
    }
    return {
      counters: Object.fromEntries(this.counters.entries()),
      gauges: Object.fromEntries(this.gauges.entries()),
      histograms,
    };
  }
}

export class RollingHealthMonitor {
  constructor({
    windowSize = 100,
    maxErrorRate = 0.2,
    maxP95LatencyMs = 30_000,
    maxBudgetUtilization = 1,
  } = {}) {
    this.windowSize = Math.max(1, Number(windowSize));
    this.maxErrorRate = Number(maxErrorRate);
    this.maxP95LatencyMs = Number(maxP95LatencyMs);
    this.maxBudgetUtilization = Number(maxBudgetUtilization);
    this.samples = [];
  }

  record({ ok, latencyMs = 0, budgetUsed = 0, budgetLimit = Infinity, governanceLedgerOk = true } = {}) {
    const sample = {
      ok: Boolean(ok),
      latencyMs: Math.max(0, Number(latencyMs)),
      budgetUtilization: Number.isFinite(Number(budgetLimit)) && Number(budgetLimit) > 0
        ? Number(budgetUsed) / Number(budgetLimit)
        : 0,
      governanceLedgerOk: governanceLedgerOk !== false,
      at: new Date().toISOString(),
    };
    this.samples.push(sample);
    if (this.samples.length > this.windowSize) this.samples.splice(0, this.samples.length - this.windowSize);
    return this.status();
  }

  status() {
    if (!this.samples.length) return { status: 'unknown', healthy: null, reasons: [] };
    const errorRate = this.samples.filter((sample) => !sample.ok).length / this.samples.length;
    const latency = this.samples.map((sample) => sample.latencyMs).sort((a, b) => a - b);
    const p95 = latency[Math.min(latency.length - 1, Math.ceil(0.95 * latency.length) - 1)];
    const maxBudget = Math.max(...this.samples.map((sample) => sample.budgetUtilization));
    const governanceOk = this.samples.every((sample) => sample.governanceLedgerOk);

    const reasons = [];
    if (errorRate > this.maxErrorRate) reasons.push('error_rate_exceeded');
    if (p95 > this.maxP95LatencyMs) reasons.push('latency_p95_exceeded');
    if (maxBudget > this.maxBudgetUtilization) reasons.push('budget_exhausted');
    if (!governanceOk) reasons.push('governance_integrity_failure');

    return {
      status: reasons.length ? 'degraded' : 'healthy',
      healthy: reasons.length === 0,
      reasons,
      samples: this.samples.length,
      errorRate,
      p95LatencyMs: p95,
      maxBudgetUtilization: maxBudget,
      governanceLedgerOk: governanceOk,
    };
  }
}

export class CircuitBreaker {
  constructor({ failureThreshold = 3, resetTimeoutMs = 30_000 } = {}) {
    this.failureThreshold = Math.max(1, Number(failureThreshold));
    this.resetTimeoutMs = Math.max(1, Number(resetTimeoutMs));
    this.failures = 0;
    this.state = 'closed';
    this.openedAt = null;
  }

  canAttempt(now = Date.now()) {
    if (this.state !== 'open') return true;
    if (now - this.openedAt >= this.resetTimeoutMs) {
      this.state = 'half_open';
      return true;
    }
    return false;
  }

  success() {
    this.failures = 0;
    this.state = 'closed';
    this.openedAt = null;
  }

  failure(now = Date.now()) {
    this.failures += 1;
    if (this.state === 'half_open' || this.failures >= this.failureThreshold) {
      this.state = 'open';
      this.openedAt = now;
    }
    return this.snapshot();
  }

  snapshot() {
    return { state: this.state, failures: this.failures, openedAt: this.openedAt };
  }
}
