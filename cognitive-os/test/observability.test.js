import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CircuitBreaker,
  MetricsRegistry,
  RollingHealthMonitor,
  TraceRecorder,
  redact,
} from '../src/observability.js';

test('redaction removes nested credentials without destroying safe context', () => {
  const value=redact({
    apiKey:'secret',
    nested:{Authorization:'Bearer x',safe:'keep'},
    arr:[{password:'p',value:7}],
  });
  assert.equal(value.apiKey,'[REDACTED]');
  assert.equal(value.nested.Authorization,'[REDACTED]');
  assert.equal(value.nested.safe,'keep');
  assert.equal(value.arr[0].password,'[REDACTED]');
});

test('trace recorder redacts secret attributes and bounds retained history', () => {
  const traces=new TraceRecorder({maxEvents:2});
  traces.record('a',{token:'x'});
  traces.record('b',{safe:1});
  traces.record('c',{safe:2});
  const snapshot=traces.snapshot();
  assert.equal(snapshot.length,2);
  assert.deepEqual(snapshot.map(x=>x.type),['b','c']);
  assert.equal(JSON.stringify(snapshot).includes('token'),false);
});

test('metrics registry summarizes histogram percentiles', () => {
  const metrics=new MetricsRegistry();
  metrics.increment('runs');
  metrics.increment('runs',2);
  metrics.gauge('queue',4);
  [1,2,3,100].forEach(v=>metrics.observe('latency',v));
  const snapshot=metrics.snapshot();
  assert.equal(snapshot.counters.runs,3);
  assert.equal(snapshot.gauges.queue,4);
  assert.equal(snapshot.histograms.latency.p95,100);
});

test('health monitor degrades on governance corruption even if execution succeeds', () => {
  const health=new RollingHealthMonitor({maxErrorRate:1,maxP95LatencyMs:999999});
  const status=health.record({ok:true,latencyMs:1,governanceLedgerOk:false});
  assert.equal(status.healthy,false);
  assert.ok(status.reasons.includes('governance_integrity_failure'));
});

test('circuit breaker opens after repeated failure and permits a half-open retry', () => {
  const breaker=new CircuitBreaker({failureThreshold:2,resetTimeoutMs:100});
  breaker.failure(0);
  assert.equal(breaker.canAttempt(10),true);
  breaker.failure(10);
  assert.equal(breaker.snapshot().state,'open');
  assert.equal(breaker.canAttempt(50),false);
  assert.equal(breaker.canAttempt(111),true);
  assert.equal(breaker.snapshot().state,'half_open');
  breaker.success();
  assert.equal(breaker.snapshot().state,'closed');
});
