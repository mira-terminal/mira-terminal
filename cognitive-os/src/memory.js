export class MemoryStore {
  constructor(snapshot = null) {
    this.working = new Map();
    this.episodes = [];
    this.semantic = new Map();
    if (snapshot) this.hydrate(snapshot);
  }

  hydrate(snapshot = {}) {
    this.working = new Map(Object.entries(snapshot.working || {}));
    this.episodes = structuredClone(snapshot.episodes || []);
    this.semantic = new Map(Object.entries(snapshot.semantic || {}));
    return this;
  }

  setWorking(key, value) {
    this.working.set(key, structuredClone(value));
  }

  getWorking(key) {
    const value = this.working.get(key);
    return value === undefined ? undefined : structuredClone(value);
  }

  addEpisode(episode) {
    this.episodes.push({
      at: new Date().toISOString(),
      ...structuredClone(episode),
    });
  }

  remember(key, value, { confidence = 1, provenance = 'runtime' } = {}) {
    this.semantic.set(key, {
      value: structuredClone(value),
      confidence,
      provenance,
      updatedAt: new Date().toISOString(),
    });
  }

  recall(key) {
    const item = this.semantic.get(key);
    return item ? structuredClone(item) : undefined;
  }

  snapshot() {
    return {
      working: Object.fromEntries(this.working.entries()),
      episodes: structuredClone(this.episodes),
      semantic: Object.fromEntries(this.semantic.entries()),
    };
  }
}
