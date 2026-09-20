function textContains(haystack, needle) {
  return JSON.stringify(haystack ?? '').toLowerCase().includes(String(needle).toLowerCase());
}

export class CompletionVerifier {
  async verifyTask(task, result) {
    if (result == null) return { ok: false, reasons: ['Agent returned no result'] };

    const missing = task.expectedOutputs.filter((item) => !textContains(result, item));
    if (missing.length) {
      return { ok: false, reasons: missing.map((x) => `Missing expected output: ${x}`) };
    }

    if (result.complete === false) {
      return { ok: false, reasons: [result.reason || 'Agent marked task incomplete'] };
    }

    return { ok: true, reasons: [] };
  }

  async verifyGoal(goal, tasks) {
    const unfinished = tasks.filter((t) => t.status !== 'completed');
    if (unfinished.length) {
      return { ok: false, reasons: unfinished.map((t) => `Task not completed: ${t.title}`) };
    }

    const resultCorpus = tasks.map((t) => t.result);
    const missingDeliverables = goal.deliverables.filter((d) => !textContains(resultCorpus, d));
    const missingCriteria = goal.successCriteria.filter((c) => !textContains(resultCorpus, c));

    const reasons = [
      ...missingDeliverables.map((x) => `Missing deliverable evidence: ${x}`),
      ...missingCriteria.map((x) => `Missing success-criterion evidence: ${x}`),
    ];

    return { ok: reasons.length === 0, reasons };
  }
}
