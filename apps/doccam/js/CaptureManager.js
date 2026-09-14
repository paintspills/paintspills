// CaptureManager — turns "what the Compositor is currently showing" into a
// still ImageBitmap, at a real resolution (not the small on-screen canvas),
// without keeping more than one offscreen canvas around at a time.

export class CaptureManager {
  constructor(compositor) {
    this.compositor = compositor;
    this._scratch = document.createElement('canvas');
  }

  // Captures the live/frozen camera surface (with any live annotations
  // baked in) as an ImageBitmap. Annotations are normalized to the camera
  // image's own on-screen rect, so they stay aligned regardless of size —
  // `stageAspectW/H` (the on-screen stage's aspect ratio) is only used to
  // keep the captured field of view consistent with what was previewed.
  async captureCameraStill(stageAspectW, stageAspectH) {
    const src = this.compositor._cameraSource();
    const srcW = src instanceof HTMLVideoElement ? src.videoWidth : src.width;
    const srcH = src instanceof HTMLVideoElement ? src.videoHeight : src.height;
    if (!srcW || !srcH) return null;

    const aspect = stageAspectW && stageAspectH ? stageAspectW / stageAspectH : srcW / srcH;
    // Aim for roughly the camera's native pixel count, capped to avoid
    // pointlessly huge captures on 4K cameras.
    const targetH = Math.min(1600, Math.max(720, srcH));
    const targetW = Math.round(targetH * aspect);

    this._scratch.width = targetW;
    this._scratch.height = targetH;
    const ctx = this._scratch.getContext('2d');
    this.compositor.drawCamera(ctx, targetW, targetH);

    return createImageBitmap(this._scratch);
  }
}
