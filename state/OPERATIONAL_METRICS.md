# 12.9R Operational Metrics

Primary:
1. verified_completion_rate
2. owner_interventions_per_objective
3. repair_rework_rate
4. context_restatement_rate
5. recovery_success_rate
6. owner_attention_minutes_per_completed_objective

North star:
verified_useful_outcomes / owner_attention

## Baseline observations
- 2026-09-21 Pigeon P1C reconstruction: conversational memory was directionally correct but insufficiently precise; connected GitHub evidence recovered exact resource ID, control sequence, prohibited retry path, unused idempotency key and next permitted action.
- Result: demonstrated need for G1 State Integrity.
- Owner restatement required for reconstruction: 0 after authorization to proceed.
