// AudioManager — owns microphone selection and the live audio track used
// for recording. Prefers a mic whose label suggests it belongs to the
// document camera (most USB doc cams expose a combined UVC audio+video
// device), but always lets the teacher override it.

export class AudioManager extends EventTarget {
  constructor() {
    super();
    this.stream = null;
    this.currentDeviceId = null;
  }

  async listMics() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'audioinput');
  }

  // Heuristic: prefer a mic label containing "camera" / "document" / "uvc",
  // else fall back to the first available mic.
  async pickDefaultMic() {
    const mics = await this.listMics();
    if (mics.length === 0) return null;
    const preferred = mics.find((m) => /cam|document|uvc/i.test(m.label));
    return (preferred || mics[0]).deviceId;
  }

  async start(deviceId) {
    this.stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId
          ? { deviceId: { exact: deviceId }, echoCancellation: true }
          : { echoCancellation: true },
      });
      this.stream = stream;
      this.currentDeviceId = deviceId || stream.getAudioTracks()[0]?.getSettings().deviceId || null;
      const track = stream.getAudioTracks()[0];
      track?.addEventListener('ended', () => {
        this.dispatchEvent(new CustomEvent('disconnected'));
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: this._describeError(err) };
    }
  }

  _describeError(err) {
    if (!err) return 'Document camera microphone unavailable. Select another microphone.';
    if (err.name === 'NotAllowedError') {
      return 'Microphone permission is required to record narration.';
    }
    return 'Document camera microphone unavailable. Select another microphone.';
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }

  getTrack() {
    return this.stream?.getAudioTracks()[0] || null;
  }
}
