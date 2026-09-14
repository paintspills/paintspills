// CameraManager — owns getUserMedia, device enumeration, and the hidden
// <video> element that receives the raw document-camera stream. It knows
// nothing about zoom/pan/rotate/annotations/etc — that is the Compositor's
// job. Keeping the raw source separate from presentation keeps recordings
// (which read from the Compositor) decoupled from the camera's real feed.

const RESOLUTION_CANDIDATES = [
  { width: 3840, height: 2160, label: '4K (2160p)' },
  { width: 2560, height: 1440, label: '1440p' },
  { width: 1920, height: 1080, label: '1080p' },
  { width: 1280, height: 720, label: '720p' },
  { width: 640, height: 480, label: '480p' },
];

export class CameraManager extends EventTarget {
  constructor(videoEl) {
    super();
    this.video = videoEl;
    this.stream = null;
    this.currentDeviceId = null;
    this.actualWidth = 0;
    this.actualHeight = 0;
    this.actualFrameRate = 0;

    navigator.mediaDevices?.addEventListener?.('devicechange', () => {
      this.dispatchEvent(new CustomEvent('devices-changed'));
    });
  }

  async listCameras() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'videoinput');
  }

  // Try the highest resolution first, gracefully step down if the device or
  // Chromebook can't sustain it. Returns { ok, error }.
  async start(deviceId) {
    this.stop();
    const baseConstraints = deviceId ? { deviceId: { exact: deviceId } } : {};

    let lastError = null;
    for (const res of RESOLUTION_CANDIDATES) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            ...baseConstraints,
            width: { ideal: res.width },
            height: { ideal: res.height },
            frameRate: { ideal: 30 },
          },
          audio: false,
        });
        this._attach(stream, deviceId);
        return { ok: true };
      } catch (err) {
        lastError = err;
        // NotFoundError / OverconstrainedError -> try a lower resolution.
        // NotAllowedError / NotReadableError -> no point retrying resolutions.
        if (err.name === 'NotAllowedError') break;
        if (err.name === 'NotReadableError') break;
      }
    }

    // Last resort: ask for the camera with no resolution constraints at all.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: baseConstraints,
        audio: false,
      });
      this._attach(stream, deviceId);
      return { ok: true };
    } catch (err) {
      lastError = err;
    }

    return { ok: false, error: this._describeError(lastError) };
  }

  _attach(stream, deviceId) {
    this.stream = stream;
    this.currentDeviceId = deviceId || stream.getVideoTracks()[0]?.getSettings().deviceId || null;
    this.video.srcObject = stream;
    // Don't rely solely on the `autoplay` attribute — some browsers won't
    // start playback of a video element that isn't actually visible unless
    // play() is called explicitly.
    this.video.play().catch(() => {
      /* will retry once metadata loads, via the loadedmetadata listener below */
    });
    this.video.addEventListener(
      'loadedmetadata',
      () => {
        if (this.video.paused) this.video.play().catch(() => {});
      },
      { once: true }
    );

    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings();
    this.actualWidth = settings.width || 0;
    this.actualHeight = settings.height || 0;
    this.actualFrameRate = settings.frameRate || 0;

    track.addEventListener('ended', () => {
      this.dispatchEvent(new CustomEvent('disconnected'));
    });

    this.dispatchEvent(new CustomEvent('started', { detail: { settings } }));
  }

  _describeError(err) {
    if (!err) return 'Unable to access the document camera.';
    switch (err.name) {
      case 'NotAllowedError':
        return 'Camera permission is required. Enable camera access in Chrome and try again.';
      case 'NotReadableError':
        return 'Another application may be using the document camera.';
      case 'NotFoundError':
        return 'No document camera was found. Check the USB connection.';
      default:
        return 'The document camera could not be started.';
    }
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }

  get videoWidth() {
    return this.video.videoWidth;
  }

  get videoHeight() {
    return this.video.videoHeight;
  }

  get resolutionLabel() {
    if (!this.actualWidth) return '—';
    return `${this.actualWidth}×${this.actualHeight}${
      this.actualFrameRate ? ` @ ${Math.round(this.actualFrameRate)}fps` : ''
    }`;
  }
}
