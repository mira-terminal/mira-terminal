export class ImprovementLog {
  constructor(snapshot = null) {
    this.lessons = structuredClone(snapshot || []);
  }

  hydrate(snapshot = []) {
    this.lessons = structuredClone(snapshot);
    return this;
  }

  record(lesson) {
    const entry = { at: new Date().toISOString(), ...structuredClone(lesson) };
    this.lessons.push(entry);
    return entry;
  }

  snapshot() {
    return structuredClone(this.lessons);
  }
}
