const clone = (value) => structuredClone(value);

function normalizeTask(task) {
  if (!task?.id) throw new Error('task id is required');
  const cost = Number(task.cost ?? 1);
  if (!Number.isFinite(cost) || cost < 0) throw new Error('task cost must be non-negative');
  return {
    ...clone(task),
    id: String(task.id),
    domain: task.domain || 'general',
    priority: Number(task.priority ?? 0),
    cost,
  };
}

export class BoundedWorkerScheduler {
  constructor({
    concurrency = 4,
    perDomainConcurrency = {},
    maxQueue = 100,
    leaseStore = null,
    leaseTtlMs = 30_000,
  } = {}) {
    this.concurrency = Math.max(1, Number(concurrency));
    this.perDomainConcurrency = { ...perDomainConcurrency };
    this.maxQueue = Math.max(1, Number(maxQueue));
    this.leaseStore = leaseStore;
    this.leaseTtlMs = Math.max(1000, Number(leaseTtlMs));
  }

  async run(tasks, {
    execute,
    budget = Infinity,
    ownerId = 'scheduler',
    signal = null,
  } = {}) {
    if (typeof execute !== 'function') throw new Error('execute is required');
    if (!Array.isArray(tasks)) throw new Error('tasks must be an array');
    if (tasks.length > this.maxQueue) throw new Error('scheduler backpressure: queue capacity exceeded');

    const pending = tasks.map(normalizeTask).sort((a, b) => b.priority - a.priority);
    const running = new Map();
    const activeByDomain = new Map();
    const results = [];
    let reservedCost = 0;

    const domainLimit = (domain) =>
      Math.max(1, Number(this.perDomainConcurrency[domain] ?? this.concurrency));

    const finish = async (entry, outcome) => {
      running.delete(entry.task.id);
      activeByDomain.set(entry.task.domain, Math.max(0, (activeByDomain.get(entry.task.domain) || 1) - 1));
      if (entry.parentAbort) signal?.removeEventListener('abort', entry.parentAbort);
      if (entry.lease && this.leaseStore) {
        await this.leaseStore.release(
          entry.lease.resourceId,
          entry.lease.ownerId,
          entry.lease.fencingToken,
        );
      }
      results.push(outcome);
    };

    while (pending.length || running.size) {
      if (signal?.aborted) {
        for (const task of pending.splice(0)) {
          results.push({ id: task.id, status: 'cancelled', cost: 0 });
        }
        for (const entry of running.values()) entry.controller.abort();
      }

      let launched = false;
      while (!signal?.aborted && running.size < this.concurrency && pending.length) {
        const index = pending.findIndex((task) =>
          (activeByDomain.get(task.domain) || 0) < domainLimit(task.domain),
        );
        if (index < 0) break;

        const task = pending[index];
        if (reservedCost + task.cost > budget) {
          pending.splice(index, 1);
          results.push({ id: task.id, status: 'budget_blocked', cost: 0 });
          continue;
        }

        let lease = null;
        if (this.leaseStore) {
          lease = await this.leaseStore.acquire(
            `task:${task.id}`,
            String(ownerId),
            { ttlMs: this.leaseTtlMs },
          );
          if (!lease) {
            pending.splice(index, 1);
            results.push({ id: task.id, status: 'lease_unavailable', cost: 0 });
            continue;
          }
        }

        pending.splice(index, 1);
        reservedCost += task.cost;
        activeByDomain.set(task.domain, (activeByDomain.get(task.domain) || 0) + 1);
        const controller = new AbortController();
        const parentAbort = signal ? () => controller.abort() : null;
        if (parentAbort) signal.addEventListener('abort', parentAbort, { once: true });

        const entry = { task, controller, lease, parentAbort };
        entry.promise = Promise.resolve()
          .then(() => execute(clone(task), {
            signal: controller.signal,
            fencingToken: lease?.fencingToken || null,
          }))
          .then(
            (output) => ({ id: task.id, status: 'completed', cost: task.cost, output: clone(output) }),
            (error) => ({
              id: task.id,
              status: controller.signal.aborted ? 'cancelled' : 'failed',
              cost: task.cost,
              error: error instanceof Error ? error.message : String(error),
            }),
          )
          .then(async (outcome) => {
            await finish(entry, outcome);
            return outcome;
          });

        running.set(task.id, entry);
        launched = true;
      }

      if (running.size) {
        await Promise.race([...running.values()].map((entry) => entry.promise));
        continue;
      }

      if (pending.length && !launched) {
        for (const task of pending.splice(0)) {
          results.push({ id: task.id, status: 'blocked', cost: 0, error: 'no_executable_capacity' });
        }
      }
    }

    return {
      budget,
      reservedCost,
      completedCost: results
        .filter((result) => result.status === 'completed')
        .reduce((sum, result) => sum + result.cost, 0),
      results: results.sort((a, b) => String(a.id).localeCompare(String(b.id))),
    };
  }
}
