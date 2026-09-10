import assert from "node:assert/strict";
import crypto from "node:crypto";

const hash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

function validateRestoreAgainstSecurityAnchor(snapshot, anchor) {
  if (!anchor || anchor.rollbackDomain === "checkpoint") {
    return { ok: false, reason: "security_anchor_not_independent" };
  }
  if (snapshot.authorityEpochSeen < anchor.authorityEpoch) {
    return { ok: false, reason: "authority_epoch_rollback" };
  }
  if (snapshot.revocationSequenceSeen < anchor.revocationSequence) {
    return { ok: false, reason: "revocation_state_rollback" };
  }
  if (snapshot.policyFloorSeen < anchor.policyFloor) {
    return { ok: false, reason: "policy_floor_rollback" };
  }
  return { ok: true };
}

function decideUnknownOutcomeRecovery(effect, nowMs) {
  if (!effect?.intentHash || !effect?.idempotencyKey) {
    return { decision: "BLOCK", reason: "effect_identity_missing" };
  }
  if (effect.requestBodyHash !== effect.originalRequestBodyHash) {
    return { decision: "BLOCK", reason: "effect_semantics_changed" };
  }
  if (effect.phase === "OBSERVED" && effect.providerStatus === "COMMITTED") {
    return { decision: "NO_RETRY", reason: "effect_already_committed" };
  }
  if (effect.phase === "PARTIAL_COMMIT") {
    return { decision: "RECONCILE_OR_COMPENSATE", reason: "partial_commit" };
  }
  if (effect.phase === "UNKNOWN") {
    if (!effect.reconciliationReceipt) {
      return { decision: "RECONCILE_REQUIRED", reason: "outcome_ambiguous" };
    }
    if (effect.reconciliationReceipt.status === "COMMITTED") {
      return { decision: "NO_RETRY", reason: "commit_confirmed_after_timeout" };
    }
    if (effect.reconciliationReceipt.status === "NOT_COMMITTED") {
      if (nowMs >= effect.idempotencyExpiresAt) {
        return { decision: "REAUTHORIZE", reason: "idempotency_window_expired" };
      }
      return { decision: "RETRY_SAME_ID", reason: "non_commit_confirmed" };
    }
    return { decision: "RECONCILE_REQUIRED", reason: "reconciliation_inconclusive" };
  }
  if (effect.phase === "NOT_REQUESTED") {
    return { decision: "DISPATCH_ALLOWED", reason: "no_prior_effect" };
  }
  return { decision: "BLOCK", reason: "unsupported_effect_state" };
}

function validateEgress({
  sink,
  destination,
  destinationFromUntrusted = false,
  toolChoiceFromUntrusted = false,
  sensitivity = "public",
  declassificationReceipt = null,
  releaseAuthority = null,
}) {
  const outbound = ["email", "message", "publish", "network_write", "upload"].includes(sink);
  if (!outbound) return { ok: true };
  if (!releaseAuthority?.valid || !releaseAuthority?.scope?.includes(sink)) {
    return { ok: false, reason: "release_authority_missing" };
  }
  if (destinationFromUntrusted) return { ok: false, reason: "untrusted_destination_influence" };
  if (toolChoiceFromUntrusted) return { ok: false, reason: "untrusted_tool_influence" };
  if (["private", "secret"].includes(sensitivity)) {
    if (!declassificationReceipt?.approved) return { ok: false, reason: "declassification_required" };
    if (declassificationReceipt.destination !== destination) return { ok: false, reason: "declassification_scope_mismatch" };
  }
  return { ok: true };
}

class EgressBudget {
  constructor(limitBytes) {
    this.limitBytes = limitBytes;
    this.byRelease = new Map();
  }
  observe(releaseId, bytes) {
    const total = (this.byRelease.get(releaseId) || 0) + bytes;
    this.byRelease.set(releaseId, total);
    return total > this.limitBytes
      ? { ok: false, reason: "aggregate_egress_budget_exceeded", total }
      : { ok: true, total };
  }
}

export function runRecoveryGuardSuite() {
  const anchor = {
    rollbackDomain: "external_monotonic_store",
    authorityEpoch: 12,
    revocationSequence: 41,
    policyFloor: 8,
  };
  const currentSnapshot = {
    authorityEpochSeen: 12,
    revocationSequenceSeen: 41,
    policyFloorSeen: 8,
  };
  assert.deepEqual(validateRestoreAgainstSecurityAnchor(currentSnapshot, anchor), { ok: true });
  assert.equal(validateRestoreAgainstSecurityAnchor(
    { ...currentSnapshot, authorityEpochSeen: 11 }, anchor
  ).reason, "authority_epoch_rollback");
  assert.equal(validateRestoreAgainstSecurityAnchor(
    currentSnapshot, { ...anchor, rollbackDomain: "checkpoint" }
  ).reason, "security_anchor_not_independent");

  const effect = {
    intentHash: hash({ op: "send", target: "x" }),
    idempotencyKey: "run-7-send-x",
    requestBodyHash: hash({ op: "send", target: "x" }),
    originalRequestBodyHash: hash({ op: "send", target: "x" }),
    idempotencyExpiresAt: 2_000,
    phase: "UNKNOWN",
    reconciliationReceipt: null,
  };
  assert.equal(decideUnknownOutcomeRecovery(effect, 1_000).decision, "RECONCILE_REQUIRED");
  assert.equal(decideUnknownOutcomeRecovery({
    ...effect,
    reconciliationReceipt: { status: "COMMITTED", receiptId: "provider-ack-1" },
  }, 1_000).decision, "NO_RETRY");
  assert.equal(decideUnknownOutcomeRecovery({
    ...effect,
    reconciliationReceipt: { status: "NOT_COMMITTED", receiptId: "provider-ack-2" },
  }, 1_000).decision, "RETRY_SAME_ID");
  assert.equal(decideUnknownOutcomeRecovery({
    ...effect,
    reconciliationReceipt: { status: "NOT_COMMITTED", receiptId: "provider-ack-2" },
  }, 2_500).decision, "REAUTHORIZE");
  assert.equal(decideUnknownOutcomeRecovery({
    ...effect,
    requestBodyHash: hash({ op: "send", target: "y" }),
  }, 1_000).reason, "effect_semantics_changed");

  const releaseAuthority = { valid: true, scope: ["email", "network_write"] };
  assert.deepEqual(validateEgress({
    sink: "email",
    destination: "approved@example.test",
    sensitivity: "public",
    releaseAuthority,
  }), { ok: true });
  assert.equal(validateEgress({
    sink: "email",
    destination: "attacker.example",
    destinationFromUntrusted: true,
    sensitivity: "public",
    releaseAuthority,
  }).reason, "untrusted_destination_influence");
  assert.equal(validateEgress({
    sink: "email",
    destination: "approved@example.test",
    sensitivity: "private",
    releaseAuthority,
  }).reason, "declassification_required");
  assert.deepEqual(validateEgress({
    sink: "email",
    destination: "approved@example.test",
    sensitivity: "private",
    declassificationReceipt: { approved: true, destination: "approved@example.test" },
    releaseAuthority,
  }), { ok: true });

  const budget = new EgressBudget(100);
  assert.deepEqual(budget.observe("release-1", 40), { ok: true, total: 40 });
  assert.deepEqual(budget.observe("release-1", 40), { ok: true, total: 80 });
  assert.equal(budget.observe("release-1", 30).reason, "aggregate_egress_budget_exceeded");

  return { ok: true, tests: 15 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(runRecoveryGuardSuite(), null, 2));
}
