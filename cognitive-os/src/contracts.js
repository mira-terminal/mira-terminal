import crypto from 'node:crypto';

export const RunStatus = Object.freeze({
  PLANNED: 'planned',
  RUNNING: 'running',
  WAITING_APPROVAL: 'waiting_approval',
  BLOCKED: 'blocked',
  FAILED: 'failed',
  COMPLETED: 'completed',
});

export const TaskStatus = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  WAITING_APPROVAL: 'waiting_approval',
  BLOCKED: 'blocked',
  FAILED: 'failed',
  COMPLETED: 'completed',
});

export function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function normalizeGoal(input = {}) {
  if (!input.objective || !String(input.objective).trim()) {
    throw new Error('Goal objective is required');
  }

  return {
    id: input.id || makeId('goal'),
    objective: String(input.objective).trim(),
    constraints: [...(input.constraints || [])],
    deliverables: [...(input.deliverables || [])],
    successCriteria: [...(input.successCriteria || [])],
    riskClass: input.riskClass || 'low',
    metadata: { ...(input.metadata || {}) },
  };
}

export function normalizeTask(input = {}, goalId) {
  if (!input.title || !String(input.title).trim()) {
    throw new Error('Task title is required');
  }

  return {
    id: input.id || makeId('task'),
    goalId,
    title: String(input.title).trim(),
    role: input.role || 'generalist',
    dependsOn: [...(input.dependsOn || [])],
    input: input.input ?? null,
    expectedOutputs: [...(input.expectedOutputs || [])],
    approvalRequired: Boolean(input.approvalRequired),
    maxAttempts: Math.max(1, Number(input.maxAttempts || 2)),
    status: TaskStatus.PENDING,
    attempts: 0,
    result: null,
    verification: null,
    errors: [],
    metadata: { ...(input.metadata || {}) },
  };
}
