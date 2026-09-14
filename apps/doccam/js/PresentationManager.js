// PresentationManager — hides app chrome and (optionally) goes fullscreen
// for classroom projection. Keeps its own tiny bit of state so app.js can
// just call enter()/exit()/toggle() without re-deriving DOM visibility.

export class PresentationManager extends EventTarget {
  constructor(rootEl) {
    super();
    this.root = rootEl;
    this.active = false;
  }

  async enter() {
    if (this.active) return;
    this.active = true;
    this.root.classList.add('presentation-mode');
    try {
      if (this.root.requestFullscreen && !document.fullscreenElement) {
        await this.root.requestFullscreen();
      }
    } catch {
      /* fullscreen is best-effort; presentation mode still works windowed */
    }
    this.dispatchEvent(new CustomEvent('change', { detail: { active: true } }));
  }

  async exit() {
    if (!this.active) return;
    this.active = false;
    this.root.classList.remove('presentation-mode');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      /* ignore */
    }
    this.dispatchEvent(new CustomEvent('change', { detail: { active: false } }));
  }

  toggle() {
    return this.active ? this.exit() : this.enter();
  }
}
