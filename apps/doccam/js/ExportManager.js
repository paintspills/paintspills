// ExportManager — turns a capture or the comparison grid into a downloaded
// file. Exports are rendered fresh from the Compositor at a good fixed
// resolution so labels/annotations are always included, matching what was
// visible in Presentation Mode.

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export class ExportManager {
  constructor(compositor) {
    this.compositor = compositor;
    this._canvas = document.createElement('canvas');
  }

  async exportImage(imageBitmap, format = 'png') {
    if (!imageBitmap) return;
    this._canvas.width = imageBitmap.width;
    this._canvas.height = imageBitmap.height;
    const ctx = this._canvas.getContext('2d');
    if (format === 'jpeg') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);
    }
    ctx.drawImage(imageBitmap, 0, 0);
    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const blob = await new Promise((resolve) => this._canvas.toBlob(resolve, mime, 0.92));
    download(blob, `doccam-capture-${timestamp()}.${format === 'jpeg' ? 'jpg' : 'png'}`);
  }

  // Exports one comparison slot at native resolution with its own
  // annotations baked in (each slot keeps its own AnnotationLayer).
  async exportSlotImage(slot, format = 'png') {
    if (!slot?.image) return;
    const w = slot.image.width;
    const h = slot.image.height;
    this._canvas.width = w;
    this._canvas.height = h;
    const ctx = this._canvas.getContext('2d');
    if (format === 'jpeg') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(slot.image, 0, 0);
    slot.annotations.render(ctx, { x: 0, y: 0, w, h });
    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const blob = await new Promise((resolve) => this._canvas.toBlob(resolve, mime, 0.92));
    download(blob, `doccam-${slot.label.replace(/\s+/g, '-').toLowerCase()}-${timestamp()}.${format === 'jpeg' ? 'jpg' : 'png'}`);
  }

  async exportComparison(format = 'png') {
    const width = 1920;
    const height = 1080;
    this._canvas.width = width;
    this._canvas.height = height;
    const ctx = this._canvas.getContext('2d');
    if (format !== 'png') {
      ctx.fillStyle = '#101012';
      ctx.fillRect(0, 0, width, height);
    }
    this.compositor.drawComparison(ctx, width, height);

    if (format === 'pdf') {
      return this._exportPdf(width, height);
    }
    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const blob = await new Promise((resolve) => this._canvas.toBlob(resolve, mime, 0.92));
    download(blob, `doccam-comparison-${timestamp()}.${format === 'jpeg' ? 'jpg' : 'png'}`);
  }

  async _exportPdf(width, height) {
    const jsPDFCtor = window.jspdf?.jsPDF;
    if (!jsPDFCtor) {
      return { ok: false, error: 'PDF export is unavailable right now. Try PNG instead.' };
    }
    const dataUrl = this._canvas.toDataURL('image/jpeg', 0.92);
    const pdf = new jsPDFCtor({
      orientation: width >= height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [width, height],
    });
    pdf.addImage(dataUrl, 'JPEG', 0, 0, width, height);
    pdf.save(`doccam-comparison-${timestamp()}.pdf`);
    return { ok: true };
  }
}
