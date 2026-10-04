# 12.9R Failure Classification + Recovery

Classify before retry:
- wrong premise
- stale state
- missing context
- instruction drift
- syntax
- unsupported capability
- authentication
- authorization
- permission
- tool failure
- integration failure
- environment/session incompatibility
- verification failure
- external dependency

Recovery algorithm:
1. Stop only the affected branch.
2. Preserve verified outputs and evidence.
3. Identify last reliable checkpoint.
4. Do not repeat an identical failed action without new evidence.
5. Select a supported alternate path or record a blocker.
6. Re-execute the smallest necessary scope.
7. Independently verify.
8. Update ledger with failure, intervention, result and reusable lesson.

Learning record:
Situation -> cause -> intervention -> observed result -> reusable rule.

Merge duplicate lessons; retire obsolete ones.
