// Compositor — the presentation canvas. This is the single source of truth
// for "what does the audience see", and it is what gets recorded and
// exported — never the raw camera stream directly. It owns the camera view
// transform (zoom/pan/rotate/mirror/flip/brightness/contrast) and the
// live/frozen annotation layer, and knows how to lay out Comparison Mode.
//
// render(ctx, w, h, mode) is a pure-ish function of current state, callable
// against any canvas size — the small on-screen stage, or a full-resolution
// offscreen canvas used for recording/export.

import { AnnotationLayer } from './AnnotationLayer.js';

export class Compositor {
  constructor(cameraManager, comparisonGrid) {
    this.camera = cameraManager;
    this.grid = comparisonGrid;
    this.liveAnnotations = new AnnotationLayer();
    this.frozenBitmap = null;
    this.view = {
      zoom: 1,
      panX: 0,
      panY: 0,
      rotation: 0, // 0 | 90 | 180 | 270
      mirrorH: false,
      flipV: false,
      brightness: 100,
      contrast: 100,
    };
  }

  resetView() {
    this.view.zoom = 1;
    this.view.panX = 0;
    this.view.panY = 0;
  }

  get isFrozen() {
    return !!this.frozenBitmap;
  }

  async freeze() {
    if (!this.camera.videoWidth) return false;
    this.frozenBitmap = await createImageBitmap(this.camera.video);
    return true;
  }

  resume() {
    this.frozenBitmap?.close?.();
    this.frozenBitmap = null;
  }

  _cameraSource() {
    return this.frozenBitmap || this.camera.video;
  }

  _sourceDims() {
    const s = this._cameraSource();
    if (s instanceof HTMLVideoElement) return { w: s.videoWidth, h: s.videoHeight };
    return { w: s.width, h: s.height };
  }

  hasCamera() {
    const { w, h } = this._sourceDims();
    return w > 0 && h > 0;
  }

  _cameraMetrics(cw, ch) {
    const { w: srcW, h: srcH } = this._sourceDims();
    const rotated = this.view.rotation === 90 || this.view.rotation === 270;
    const effW = rotated ? srcH : srcW;
    const effH = rotated ? srcW : srcH;
    const fit = Math.min(cw / effW, ch / effH);
    const scale = fit * this.view.zoom;
    return { srcW, srcH, effW, effH, scale, onW: effW * scale, onH: effH * scale };
  }

  clampPan(cw, ch) {
    const m = this._cameraMetrics(cw, ch);
    const maxX = Math.max(0, (m.onW - cw) / 2);
    const maxY = Math.max(0, (m.onH - ch) / 2);
    this.view.panX = Math.min(maxX, Math.max(-maxX, this.view.panX));
    this.view.panY = Math.min(maxY, Math.max(-maxY, this.view.panY));
  }

  // The on-screen rect the camera image itself occupies (post zoom/pan/
  // rotation, letterboxing excluded). Live annotations are normalized to
  // this rect rather than the full canvas, so they stay aligned with the
  // image content even when preview/recording/export canvases differ in
  // aspect ratio.
  cameraImageRect(cw, ch) {
    this.clampPan(cw, ch);
    const m = this._cameraMetrics(cw, ch);
    return {
      x: cw / 2 + this.view.panX - m.onW / 2,
      y: ch / 2 + this.view.panY - m.onH / 2,
      w: m.onW,
      h: m.onH,
    };
  }

  drawCamera(ctx, cw, ch) {
    ctx.save();
    ctx.fillStyle = '#101012';
    ctx.fillRect(0, 0, cw, ch);
    const imageRect = this.hasCamera() ? this.cameraImageRect(cw, ch) : null;
    if (imageRect) {
      const m = this._cameraMetrics(cw, ch);
      const drawW = m.srcW * m.scale;
      const drawH = m.srcH * m.scale;
      ctx.save();
      ctx.translate(cw / 2 + this.view.panX, ch / 2 + this.view.panY);
      ctx.rotate((this.view.rotation * Math.PI) / 180);
      ctx.scale(this.view.mirrorH ? -1 : 1, this.view.flipV ? -1 : 1);
      ctx.filter = `brightness(${this.view.brightness}%) contrast(${this.view.contrast}%)`;
      try {
        ctx.drawImage(this._cameraSource(), -drawW / 2, -drawH / 2, drawW, drawH);
      } catch {
        /* source not ready yet this frame */
      }
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = `${Math.max(16, ch * 0.03)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No document camera connected', cw / 2, ch / 2);
    }
    this.liveAnnotations.render(ctx, imageRect || { x: 0, y: 0, w: cw, h: ch });
    ctx.restore();
  }

  drawComparison(ctx, cw, ch) {
    ctx.save();
    ctx.fillStyle = '#101012';
    ctx.fillRect(0, 0, cw, ch);
    const { rects } = this.grid.layout(cw, ch);
    rects.forEach((rect, i) => {
      const slot = this.grid.slots[i];
      if (!slot) return;
      ctx.save();
      ctx.fillStyle = '#1c1c1f';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

      if (slot.image) {
        const iw = slot.image.width;
        const ih = slot.image.height;
        const s = Math.min(rect.w / iw, rect.h / ih);
        const dw = iw * s;
        const dh = ih * s;
        const dx = rect.x + (rect.w - dw) / 2;
        const dy = rect.y + (rect.h - dh) / 2;
        ctx.drawImage(slot.image, dx, dy, dw, dh);
        slot.annotations.render(ctx, { x: dx, y: dy, w: dw, h: dh });
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);
        ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = `${Math.max(16, rect.h * 0.1)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), rect.x + rect.w / 2, rect.y + rect.h / 2);
      }

      const labelH = Math.max(22, rect.h * 0.08);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(rect.x, rect.y, rect.w, labelH);
      ctx.fillStyle = '#fff';
      ctx.font = `600 ${Math.round(labelH * 0.55)}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(slot.label, rect.x + 10, rect.y + labelH / 2, rect.w - 20);

      if (i === this.grid.activeSlotIndex) {
        ctx.strokeStyle = '#4da3ff';
        ctx.lineWidth = 3;
        ctx.strokeRect(rect.x + 1.5, rect.y + 1.5, rect.w - 3, rect.h - 3);
      }
      ctx.restore();
    });
    ctx.restore();
  }

  render(ctx, cw, ch, mode) {
    ctx.clearRect(0, 0, cw, ch);
    if (mode === 'comparison') this.drawComparison(ctx, cw, ch);
    else this.drawCamera(ctx, cw, ch);
  }

  // The rect a slot's image actually occupies within its cell (contain-fit),
  // used both for drawing and for mapping pointer input into that slot's
  // normalized annotation space. Returns null for an empty slot.
  getSlotImageRect(cw, ch, index) {
    const slot = this.grid.slots[index];
    if (!slot || !slot.image) return null;
    const { rects } = this.grid.layout(cw, ch);
    const rect = rects[index];
    if (!rect) return null;
    const iw = slot.image.width;
    const ih = slot.image.height;
    const s = Math.min(rect.w / iw, rect.h / ih);
    const dw = iw * s;
    const dh = ih * s;
    return { x: rect.x + (rect.w - dw) / 2, y: rect.y + (rect.h - dh) / 2, w: dw, h: dh };
  }

  hitTestSlot(cw, ch, px, py) {
    const { rects } = this.grid.layout(cw, ch);
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return i;
    }
    return -1;
  }
}
