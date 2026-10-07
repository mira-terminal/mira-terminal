const clone = (value) => structuredClone(value);

export class MiraExecutiveSystem {
  constructor({
    missionRuntime,
    eventRouter = null,
    adaptiveSupervisor = null,
    improvementController = null,
    capabilityGovernor = null,
    toolExecutor = null,
    evidenceLedger = null,
  } = {}) {
    if (!missionRuntime) throw new Error('missionRuntime is required');
    this.missionRuntime = missionRuntime;
    this.eventRouter = eventRouter;
    this.adaptiveSupervisor = adaptiveSupervisor;
    this.improvementController = improvementController;
    this.capabilityGovernor = capabilityGovernor;
    this.toolExecutor = toolExecutor;
    this.evidenceLedger = evidenceLedger;
  }

  async startMission(mission) {
    return this.missionRuntime.start(clone(mission));
  }

  async resumeMission(missionId) {
    return this.missionRuntime.resume(missionId);
  }

  async approveWorkstream(missionId, workstreamId) {
    return this.missionRuntime.approve(missionId, workstreamId);
  }

  async dispatchEvent(event) {
    if (!this.eventRouter) throw new Error('eventRouter is not configured');
    return this.eventRouter.dispatch(clone(event));
  }

  async executeTool(request) {
    if (!this.toolExecutor) throw new Error('toolExecutor is not configured');
    return this.toolExecutor.execute(clone(request));
  }

  async adapt(input) {
    if (!this.adaptiveSupervisor) throw new Error('adaptiveSupervisor is not configured');
    return this.adaptiveSupervisor.revise(clone(input));
  }

  recordEvidence(entry) {
    if (!this.evidenceLedger) throw new Error('evidenceLedger is not configured');
    return this.evidenceLedger.record(clone(entry));
  }

  async proposeImprovement({ proposal, baseline, candidate } = {}) {
    if (!this.improvementController || !this.capabilityGovernor) {
      throw new Error('improvementController and capabilityGovernor are required');
    }
    const proposed = this.capabilityGovernor.propose(clone(proposal));
    const evaluation = await this.improvementController.assess({
      id: proposal.id,
      description: proposal.description || '',
      baseline,
      candidate,
    });
    const governed = this.capabilityGovernor.attachEvaluation(proposal.id, evaluation);
    return { proposed, evaluation, governed };
  }

  approveImprovement(proposalId, { approverId = 'owner' } = {}) {
    if (!this.capabilityGovernor) throw new Error('capabilityGovernor is not configured');
    return this.capabilityGovernor.approve(proposalId, { approverType: 'human', approverId });
  }

  async activateImprovement(proposalId, { apply } = {}) {
    if (!this.capabilityGovernor) throw new Error('capabilityGovernor is not configured');
    return this.capabilityGovernor.activate(proposalId, { apply });
  }

  async rollbackImprovement(proposalId, { rollback } = {}) {
    if (!this.capabilityGovernor) throw new Error('capabilityGovernor is not configured');
    return this.capabilityGovernor.rollback(proposalId, { rollback });
  }

  health() {
    const governanceLedgerOk = this.capabilityGovernor?.ledger?.verify?.() ?? null;
    return {
      architectureLevel: 11,
      controlledLevel12: Boolean(this.improvementController && this.capabilityGovernor),
      capabilities: {
        persistentMissions: Boolean(this.missionRuntime),
        eventDrivenMissions: Boolean(this.eventRouter),
        adaptiveReplanning: Boolean(this.adaptiveSupervisor),
        controlledImprovement: Boolean(this.improvementController),
        promotionGovernance: Boolean(this.capabilityGovernor),
        governedTools: Boolean(this.toolExecutor),
        evidenceTracking: Boolean(this.evidenceLedger),
      },
      governanceLedgerOk,
    };
  }
}
