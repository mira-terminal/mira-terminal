export class AgentRegistry {
  constructor() {
    this.agents = new Map();
  }

  register(role, handler) {
    if (!role || typeof handler !== 'function') throw new Error('role and handler are required');
    this.agents.set(role, handler);
    return this;
  }

  has(role) {
    return this.agents.has(role);
  }

  async execute(role, context) {
    const handler = this.agents.get(role) || this.agents.get('generalist');
    if (!handler) throw new Error(`No agent registered for role: ${role}`);
    return handler(context);
  }
}
