// UIStateManager — the single source of truth for "what mode is the app in".
// Everything else (toolbar, Compositor, keyboard shortcuts) reads/reacts to
// this instead of poking at each other directly.
//
// mode: 'camera' | 'comparison'
//   'camera'      — live or frozen document-camera view
//   'comparison'  — comparison grid selected (capturing or complete)
// frozen: only meaningful while mode === 'camera'
// comparisonComplete: only meaningful while mode === 'comparison'

export class UIStateManager extends EventTarget {
  constructor() {
    super();
    this.state = {
      mode: 'camera',
      frozen: false,
      isRecording: false,
      isPresenting: false,
      comparisonComplete: false,
    };
  }

  get() {
    return { ...this.state };
  }

  _set(patch) {
    Object.assign(this.state, patch);
    this.dispatchEvent(new CustomEvent('change', { detail: this.get() }));
  }

  goToCamera() {
    this._set({ mode: 'camera' });
  }

  enterComparison() {
    this._set({ mode: 'comparison', comparisonComplete: false, frozen: false });
  }

  setComparisonComplete(complete) {
    this._set({ comparisonComplete: complete });
  }

  setFrozen(frozen) {
    this._set({ frozen });
  }

  setRecording(isRecording) {
    this._set({ isRecording });
  }

  setPresenting(isPresenting) {
    this._set({ isPresenting });
  }
}
