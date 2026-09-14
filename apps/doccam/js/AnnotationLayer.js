// AnnotationLayer — a vector-stroke annotation surface. Points are stored
// normalized (0..1) relative to whatever rect they're drawn into, so the
// same stroke data renders crisply whether it's painted onto the small
// on-screen canvas or a full-resolution recording/export canvas.
//
// One instance lives on the live/frozen camera surface; one instance lives
// on each comparison-grid slot.

let nextId = 1;

export class AnnotationLayer {
  constructor() {
    this.strokes = [];
    this.redoStack = [];
  }

  beginStroke(tool, color, thickness) {
    this.current = {
      id: nextId++,
      tool, // 'pen' | 'highlighter' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'text'
      color,
      thickness,
      points: [], // [{x,y}] normalized 0..1
    };
    return this.current;
  }

  addPoint(x, y) {
    if (this.current) this.current.points.push({ x, y });
  }

  commitStroke() {
    if (this.current && this.current.points.length > 0) {
      this.strokes.push(this.current);
      this.redoStack = [];
    }
    this.current = null;
  }

  addText(x, y, text, color, size) {
    this.strokes.push({
      id: nextId++,
      tool: 'text',
      color,
      thickness: size,
      points: [{ x, y }],
      text,
    });
    this.redoStack = [];
  }

  cancelStroke() {
    this.current = null;
  }

  undo() {
    const s = this.strokes.pop();
    if (s) this.redoStack.push(s);
  }

  redo() {
    const s = this.redoStack.pop();
    if (s) this.strokes.push(s);
  }

  clear() {
    this.strokes = [];
    this.redoStack = [];
  }

  get isEmpty() {
    return this.strokes.length === 0;
  }

  // Draw all committed strokes (plus the in-progress one, if any) into
  // `ctx`, mapped into `rect` = {x, y, w, h} in ctx's pixel space.
  render(ctx, rect) {
    const all = this.current ? [...this.strokes, this.current] : this.strokes;
    for (const s of all) this._renderStroke(ctx, rect, s);
  }

  _toPx(rect, p) {
    return { x: rect.x + p.x * rect.w, y: rect.y + p.y * rect.h };
  }

  _renderStroke(ctx, rect, s) {
    if (!s.points.length) return;
    ctx.save();
    const scale = Math.min(rect.w, rect.h);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (s.tool === 'text') {
      const p = this._toPx(rect, s.points[0]);
      const fontPx = Math.max(12, s.thickness * scale * 0.03);
      ctx.font = `600 ${fontPx}px system-ui, sans-serif`;
      ctx.fillStyle = s.color;
      ctx.textBaseline = 'top';
      ctx.fillText(s.text, p.x, p.y);
      ctx.restore();
      return;
    }

    ctx.lineWidth = Math.max(1, (s.thickness / 100) * scale * 0.02);

    if (s.tool === 'highlighter') {
      ctx.globalAlpha = 0.35;
      ctx.lineWidth *= 4;
      ctx.strokeStyle = s.color;
    } else {
      ctx.strokeStyle = s.color;
    }

    const pts = s.points.map((p) => this._toPx(rect, p));

    if (s.tool === 'pen' || s.tool === 'highlighter') {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    } else if (s.tool === 'line' || s.tool === 'arrow') {
      const a = pts[0];
      const b = pts[pts.length - 1];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      if (s.tool === 'arrow') this._drawArrowHead(ctx, a, b);
    } else if (s.tool === 'rect') {
      const a = pts[0];
      const b = pts[pts.length - 1];
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    } else if (s.tool === 'ellipse') {
      const a = pts[0];
      const b = pts[pts.length - 1];
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const rx = Math.abs(b.x - a.x) / 2;
      const ry = Math.abs(b.y - a.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawArrowHead(ctx, a, b) {
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const headLen = Math.max(10, ctx.lineWidth * 4);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(
      b.x - headLen * Math.cos(angle - Math.PI / 7),
      b.y - headLen * Math.sin(angle - Math.PI / 7)
    );
    ctx.lineTo(
      b.x - headLen * Math.cos(angle + Math.PI / 7),
      b.y - headLen * Math.sin(angle + Math.PI / 7)
    );
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
  }
}
