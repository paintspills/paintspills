// RecordingManager — records the Compositor's output (not the raw camera
// stream) plus microphone audio via MediaRecorder. Owns its own offscreen
// canvas at the chosen recording resolution and draws into it on its own
// timer, independent of the on-screen stage's size/refresh.
//
// Writes incrementally to disk via the File System Access API when
// available (so a long recording never has to live entirely in RAM);
// falls back to an in-memory Blob + download link otherwise.

export const RECORDING_RESOLUTIONS = [
  { id: '1080p', width: 1920, height: 1080, label: '1080p (recommended)' },
  { id: '1440p', width: 2560, height: 1440, label: '1440p' },
  { id: '4k', width: 3840, height: 2160, label: '4K' },
];

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

function pickMimeType() {
  for (const type of MIME_CANDIDATES) {
    if (window.MediaRecorder?.isTypeSupported?.(type)) return type;
  }
  return '';
}

export class RecordingManager extends EventTarget {
  constructor() {
    super();
    this.active = false;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.chunkCount = 0;
    this.bytesWritten = 0;
    this.startedAt = 0;
    this._timer = null;
    this._writable = null;
    this._memoryChunks = null;
    this._mediaRecorder = null;
    this._stream = null;
  }

  get canUseFileSystemAccess() {
    return typeof window.showSaveFilePicker === 'function';
  }

  async start({ compositor, getMode, width, height, fps = 30, audioTrack }) {
    if (this.active) return { ok: false, error: 'Already recording.' };

    this.canvas.width = width;
    this.canvas.height = height;
    this._compositor = compositor;
    this._getMode = getMode;
    this._fps = fps;

    const mimeType = pickMimeType();
    if (!mimeType) {
      return { ok: false, error: 'This browser cannot record video.' };
    }

    // Ask for a save location up front (still within the click gesture)
    // so writes can stream to disk instead of accumulating in memory.
    if (this.canUseFileSystemAccess) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: this._suggestedName(mimeType),
          types: [{ description: 'Video', accept: { 'video/webm': ['.webm'] } }],
        });
        this._writable = await handle.createWritable();
      } catch (err) {
        if (err?.name === 'AbortError') {
          return { ok: false, error: 'cancelled' };
        }
        // Fall through to in-memory fallback for any other failure.
        this._writable = null;
      }
    }
    if (!this._writable) {
      this._memoryChunks = [];
    }

    const videoStream = this.canvas.captureStream(fps);
    const tracks = [...videoStream.getVideoTracks()];
    if (audioTrack) tracks.push(audioTrack);
    this._stream = new MediaStream(tracks);

    this._mediaRecorder = new MediaRecorder(this._stream, {
      mimeType,
      videoBitsPerSecond: this._bitrateFor(width, height),
    });

    this.bytesWritten = 0;
    this.chunkCount = 0;
    // MediaRecorder fires its final 'dataavailable' right before 'stop', and
    // writes here are async — chain them so stop() can await the last write
    // finishing before it closes the file handle.
    this._writeQueue = Promise.resolve();

    this._mediaRecorder.ondataavailable = (e) => {
      if (!e.data || e.data.size === 0) return;
      this.bytesWritten += e.data.size;
      this.chunkCount++;
      this._writeQueue = this._writeQueue.then(async () => {
        if (this._writable) {
          try {
            await this._writable.write(e.data);
          } catch {
            // Disk write failed mid-recording (e.g. USB drive pulled) —
            // keep going in memory so the session isn't lost.
            this._memoryChunks = this._memoryChunks || [];
            this._memoryChunks.push(e.data);
          }
        } else {
          this._memoryChunks.push(e.data);
        }
        this.dispatchEvent(new CustomEvent('progress', { detail: this.stats }));
      });
    };

    this._mediaRecorder.onerror = () => {
      this.dispatchEvent(new CustomEvent('error', { detail: 'Recording stopped unexpectedly.' }));
      this.stop();
    };

    this._mediaRecorder.start(1000); // 1s timeslices for steady progress + incremental writes
    this.startedAt = performance.now();
    this.active = true;

    this._timer = setInterval(() => this._drawFrame(), 1000 / fps);
    this._drawFrame();

    return { ok: true };
  }

  _bitrateFor(w, h) {
    const pixels = w * h;
    if (pixels >= 3840 * 2160) return 32_000_000;
    if (pixels >= 2560 * 1440) return 16_000_000;
    return 8_000_000;
  }

  _suggestedName(mimeType) {
    const ext = mimeType.includes('webm') ? 'webm' : 'mp4';
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    return `doccam-recording-${ts}.${ext}`;
  }

  _drawFrame() {
    if (!this._compositor) return;
    this._compositor.render(this.ctx, this.canvas.width, this.canvas.height, this._getMode());
  }

  get stats() {
    return {
      elapsedMs: this.startedAt ? performance.now() - this.startedAt : 0,
      approxBytes: this.bytesWritten,
      width: this.canvas.width,
      height: this.canvas.height,
      savingTo: this._writable ? 'file' : 'downloads',
    };
  }

  async stop() {
    if (!this.active) return null;
    this.active = false;
    clearInterval(this._timer);
    this._timer = null;

    const recorder = this._mediaRecorder;
    // Guard against a recorder that already auto-stopped (e.g. via onerror)
    // before we get here — attaching the listener after the fact would
    // otherwise wait forever for a 'stop' event that already fired.
    const stopped =
      recorder.state === 'inactive'
        ? Promise.resolve()
        : new Promise((resolve) => recorder.addEventListener('stop', resolve, { once: true }));
    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;
    await this._writeQueue;

    this._stream.getVideoTracks().forEach((t) => t.stop());

    let savedVia = 'downloads';
    if (this._writable) {
      await this._writable.close();
      savedVia = 'file';
    } else {
      const blob = new Blob(this._memoryChunks, { type: this._mediaRecorder.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this._suggestedName(this._mediaRecorder.mimeType);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    const finalStats = { ...this.stats, savedVia };
    this.startedAt = 0;
    this._writable = null;
    this._memoryChunks = null;
    this._mediaRecorder = null;
    this._stream = null;
    this._writeQueue = null;
    return finalStats;
  }
}
