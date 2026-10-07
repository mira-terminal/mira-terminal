import fs from 'node:fs/promises';
import path from 'node:path';

function clone(value) {
  return structuredClone(value);
}

function safeId(id) {
  if (!/^[A-Za-z0-9_-]+$/.test(String(id))) throw new Error(`Unsafe persistence id: ${id}`);
  return String(id);
}

export class InMemoryRunStore {
  constructor() {
    this.runs = new Map();
  }

  async save(run) {
    this.runs.set(run.id, clone(run));
    return clone(run);
  }

  async load(runId) {
    const run = this.runs.get(runId);
    return run ? clone(run) : null;
  }

  async list() {
    return [...this.runs.values()].map(clone);
  }
}

export class FileRunStore {
  constructor({ directory }) {
    if (!directory) throw new Error('directory is required');
    this.directory = directory;
  }

  async #ensureDirectory() {
    await fs.mkdir(this.directory, { recursive: true });
  }

  #runPath(runId) {
    return path.join(this.directory, `${safeId(runId)}.json`);
  }

  async save(run) {
    await this.#ensureDirectory();
    const target = this.#runPath(run.id);
    const temp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temp, `${JSON.stringify(run, null, 2)}\n`, 'utf8');
    await fs.rename(temp, target);
    return clone(run);
  }

  async load(runId) {
    try {
      const raw = await fs.readFile(this.#runPath(runId), 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async list() {
    await this.#ensureDirectory();
    const entries = await fs.readdir(this.directory, { withFileTypes: true });
    const runs = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const raw = await fs.readFile(path.join(this.directory, entry.name), 'utf8');
      runs.push(JSON.parse(raw));
    }
    return runs;
  }
}

export class InMemoryEventJournal {
  constructor() {
    this.events = [];
  }

  async append(event) {
    const entry = { at: new Date().toISOString(), ...clone(event) };
    this.events.push(entry);
    return clone(entry);
  }

  async read(runId = null) {
    const events = runId ? this.events.filter((e) => e.runId === runId) : this.events;
    return clone(events);
  }
}

export class FileEventJournal {
  constructor({ file }) {
    if (!file) throw new Error('file is required');
    this.file = file;
  }

  async append(event) {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const entry = { at: new Date().toISOString(), ...clone(event) };
    await fs.appendFile(this.file, `${JSON.stringify(entry)}\n`, 'utf8');
    return clone(entry);
  }

  async read(runId = null) {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const events = raw
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      return runId ? events.filter((e) => e.runId === runId) : events;
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
  }
}
