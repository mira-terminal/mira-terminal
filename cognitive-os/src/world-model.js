export class WorldModel {
  constructor(snapshot = null) {
    this.version = 0;
    this.facts = new Map();
    this.assumptions = new Map();
    this.observations = [];
    if (snapshot) this.hydrate(snapshot);
  }

  hydrate(snapshot = {}) {
    this.version = Number(snapshot.version || 0);
    this.facts = new Map(Object.entries(snapshot.facts || {}));
    this.assumptions = new Map(Object.entries(snapshot.assumptions || {}));
    this.observations = structuredClone(snapshot.observations || []);
    return this;
  }

  observe(observation) {
    this.version += 1;
    const entry = {
      version: this.version,
      at: new Date().toISOString(),
      ...structuredClone(observation),
    };
    this.observations.push(entry);
    return structuredClone(entry);
  }

  setFact(key, value, provenance = 'runtime') {
    this.version += 1;
    this.facts.set(key, { value: structuredClone(value), provenance, version: this.version });
  }

  setAssumption(key, value, reason = '') {
    this.version += 1;
    this.assumptions.set(key, { value: structuredClone(value), reason, version: this.version });
  }

  snapshot() {
    return {
      version: this.version,
      facts: Object.fromEntries(this.facts.entries()),
      assumptions: Object.fromEntries(this.assumptions.entries()),
      observations: structuredClone(this.observations),
    };
  }
}
