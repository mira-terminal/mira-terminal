export class ImprovementLog {
  constructor() {
    this.lessons = [];
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
