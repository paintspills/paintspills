// ComparisonGrid — layout math + slot state for Comparison Mode.
// Deliberately has no live-camera-tile concept in this version, but each
// slot is just a data record {label, image, annotations}, so a future
// version could add a "live" slot type without restructuring this class.

import { AnnotationLayer } from './AnnotationLayer.js';

export const GRID_PRESETS = [1, 2, 4, 6, 8, 9];

const DEFAULT_LABEL_PREFIX = 'Image';

export class ComparisonGrid {
  constructor() {
    this.size = 0;
    this.slots = [];
    this.nextIndex = 0;
    this.activeSlotIndex = -1;
    this.labelPrefix = DEFAULT_LABEL_PREFIX;
  }

  // `labelPrefix` replaces the word "Image" in auto-generated labels
  // ("Image 1", "Image 2", …) — e.g. "Example" → "Example 1", "Example 2".
  // Omit it (or pass '') to keep whatever prefix was last used, defaulting
  // to "Image" the first time.
  start(size, labelPrefix) {
    this.size = size;
    this.nextIndex = 0;
    this.activeSlotIndex = -1;
    if (labelPrefix) this.labelPrefix = labelPrefix;
    const prefix = this.labelPrefix || DEFAULT_LABEL_PREFIX;
    this.slots = Array.from({ length: size }, (_, i) => ({
      label: `${prefix} ${i + 1}`,
      customLabel: false,
      image: null, // ImageBitmap
      aspect: 16 / 9,
      annotations: new AnnotationLayer(),
    }));
  }

  newSet(labelPrefix) {
    this.start(this.size, labelPrefix);
  }

  get isFull() {
    return this.size > 0 && this.nextIndex >= this.size;
  }

  get filledCount() {
    return this.slots.filter((s) => s.image).length;
  }

  // Adds a capture into the next open slot. Returns the slot index or -1.
  addCapture(imageBitmap) {
    if (this.isFull) return -1;
    const i = this.nextIndex;
    this.slots[i].image = imageBitmap;
    this.slots[i].aspect = imageBitmap.width / imageBitmap.height || 16 / 9;
    this.nextIndex++;
    return i;
  }

  renameSlot(i, label) {
    const slot = this.slots[i];
    if (!slot) return;
    slot.label = label || slot.label;
    slot.customLabel = true;
  }

  deleteSlot(i) {
    const slot = this.slots[i];
    if (!slot || !slot.image) return;
    slot.image = null;
    slot.annotations.clear();
    // Reopen the sequence only if this was the most recently filled slot,
    // so Capture naturally continues from here.
    if (this.nextIndex === i + 1) this.nextIndex = i;
  }

  // Computes rows/cols/rects that maximize per-cell area within cw×ch.
  layout(cw, ch, gap = 12) {
    const n = this.size;
    if (n === 0 || cw <= 0 || ch <= 0) return { rows: 0, cols: 0, rects: [] };

    let best = null;
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const cellW = (cw - gap * (cols + 1)) / cols;
      const cellH = (ch - gap * (rows + 1)) / rows;
      if (cellW <= 0 || cellH <= 0) continue;
      const area = cellW * cellH;
      // Slight bias toward layouts closer to the container's own aspect
      // ratio so cells aren't needlessly skinny.
      if (!best || area > best.area) {
        best = { cols, rows, cellW, cellH, area };
      }
    }
    if (!best) return { rows: 1, cols: n, rects: [] };

    const { cols, rows, cellW, cellH } = best;
    const rects = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      // Center the last (possibly incomplete) row.
      const itemsInRow = Math.min(cols, n - r * cols);
      const rowOffset = ((cols - itemsInRow) * (cellW + gap)) / 2;
      rects.push({
        x: gap + c * (cellW + gap) + rowOffset,
        y: gap + r * (cellH + gap),
        w: cellW,
        h: cellH,
      });
    }
    return { rows, cols, rects };
  }
}
