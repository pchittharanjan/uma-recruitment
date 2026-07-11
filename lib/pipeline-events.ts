export const PIPELINE_PHASE_CHANGED_EVENT = 'pipeline-phase-changed';

export function dispatchPipelinePhaseChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PIPELINE_PHASE_CHANGED_EVENT));
  }
}
