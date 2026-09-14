// app.js — bootstraps every manager, wires the DOM, and holds the small
// amount of glue state (current annotation tool, drag tracking, last
// standalone capture) that doesn't belong inside any one manager.
//
// Nothing here is persisted between sessions — that's intentional, per the
// classroom-shared-device requirement: every load starts from defaults.

import { CameraManager } from './CameraManager.js';
import { AudioManager } from './AudioManager.js';
import { Compositor } from './Compositor.js';
import { ComparisonGrid, GRID_PRESETS } from './ComparisonGrid.js';
import { CaptureManager } from './CaptureManager.js';
import { RecordingManager, RECORDING_RESOLUTIONS } from './RecordingManager.js';
import { ExportManager } from './ExportManager.js';
import { PresentationManager } from './PresentationManager.js';
import { UIStateManager } from './UIStateManager.js';

// ---------- DOM refs ----------
const appEl = document.getElementById('app');
const videoEl = document.getElementById('camera-video');
const stage = document.getElementById('stage');
const stageWrap = document.getElementById('stage-wrap');
const stageCtx = stage.getContext('2d');

const gateEl = document.getElementById('permission-gate');
const gateErrorEl = document.getElementById('gate-error');
const startCameraBtn = document.getElementById('start-camera-btn');

const frozenBadge = document.getElementById('frozen-badge');
const recBadge = document.getElementById('rec-badge');
const recTimeEl = document.getElementById('rec-time');
const captureFlash = document.getElementById('capture-flash');
const toastEl = document.getElementById('toast');
const errorBanner = document.getElementById('error-banner');

const hudEl = document.getElementById('capture-hud');
const hudTextEl = document.getElementById('capture-hud-text');
const hudPrimaryBtn = document.getElementById('capture-hud-primary');
const hudSecondaryBtn = document.getElementById('capture-hud-secondary');

const lastCaptureEl = document.getElementById('last-capture');
const lastCaptureImg = document.getElementById('last-capture-img');
const lastCaptureExportBtn = document.getElementById('last-capture-export');
const lastCaptureDismissBtn = document.getElementById('last-capture-dismiss');

const exitPresentationBtn = document.getElementById('exit-presentation');
const compareModal = document.getElementById('compare-size-modal');
const gridSizeOptionsEl = document.getElementById('grid-size-options');
const compareCancelBtn = document.getElementById('compare-cancel');

const collapseToggleBtn = document.getElementById('collapse-toggle');
const freezeLabel = document.getElementById('freeze-label');
const recordLabel = document.getElementById('record-label');

// panel-specific
const cameraSelect = document.getElementById('camera-select');
const resolutionInfo = document.getElementById('resolution-info');
const zoomSlider = document.getElementById('zoom-slider');
const brightnessSlider = document.getElementById('brightness-slider');
const contrastSlider = document.getElementById('contrast-slider');
const rotateBtn = document.getElementById('rotate-btn');
const mirrorBtn = document.getElementById('mirror-btn');
const flipBtn = document.getElementById('flip-btn');
const resetViewBtn = document.getElementById('reset-view-btn');

const compareStatus = document.getElementById('compare-status');
const labelPrefixInput = document.getElementById('label-prefix-input');
const compareStartBtn = document.getElementById('compare-start-btn');
const slotLabelEditor = document.getElementById('slot-label-editor');
const slotLabelInput = document.getElementById('slot-label-input');
const slotDeleteBtn = document.getElementById('slot-delete-btn');

const colorPicker = document.getElementById('color-picker');
const thicknessSlider = document.getElementById('thickness-slider');
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');
const clearAnnotationsBtn = document.getElementById('clear-annotations-btn');

const micSelect = document.getElementById('mic-select');
const resolutionSelect = document.getElementById('resolution-select');
const qualityWarning = document.getElementById('quality-warning');
const recordStats = document.getElementById('record-stats');
const recordToggleBtn = document.getElementById('record-toggle-btn');

// ---------- Managers ----------
const cameraManager = new CameraManager(videoEl);
const audioManager = new AudioManager();
const grid = new ComparisonGrid();
const compositor = new Compositor(cameraManager, grid);
const captureManager = new CaptureManager(compositor);
const exportManager = new ExportManager(compositor);
const recordingManager = new RecordingManager();
const uiState = new UIStateManager();
const presentationManager = new PresentationManager(appEl);

// ---------- Small local state ----------
let currentTool = null; // null = pan/zoom mode
let lastCapture = null; // { imageBitmap }
let lastCaptureUrl = null;
let dragState = null;
let toastTimer = null;
let bannerTimer = null;

function currentDisplayMode() {
  return uiState.state.mode === 'comparison' && grid.isFull ? 'comparison' : 'camera';
}

// ---------- Toast / error helpers ----------
function toast(msg, ms = 2200) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), ms);
}

function showError(msg, ms = 5000) {
  errorBanner.textContent = msg;
  errorBanner.hidden = false;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => (errorBanner.hidden = true), ms);
}

// ---------- Camera bootstrap ----------
async function populateCameraSelect() {
  const cams = await cameraManager.listCameras();
  cameraSelect.innerHTML = '';
  cams.forEach((c, i) => {
    const opt = document.createElement('option');
    opt.value = c.deviceId;
    opt.textContent = c.label || `Camera ${i + 1}`;
    if (c.deviceId === cameraManager.currentDeviceId) opt.selected = true;
    cameraSelect.appendChild(opt);
  });
}

async function populateMicSelect() {
  const mics = await audioManager.listMics();
  micSelect.innerHTML = '';
  mics.forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = m.deviceId;
    opt.textContent = m.label || `Microphone ${i + 1}`;
    if (m.deviceId === audioManager.currentDeviceId) opt.selected = true;
    micSelect.appendChild(opt);
  });
}

async function startEverything() {
  startCameraBtn.disabled = true;
  gateErrorEl.hidden = true;
  const camResult = await cameraManager.start();
  if (!camResult.ok) {
    gateErrorEl.textContent = camResult.error;
    gateErrorEl.hidden = false;
    startCameraBtn.disabled = false;
    return;
  }
  gateEl.hidden = true;
  resolutionInfo.textContent = cameraManager.resolutionLabel;
  await populateCameraSelect();

  const micId = await audioManager.pickDefaultMic();
  if (micId) {
    const micResult = await audioManager.start(micId);
    if (!micResult.ok) toast(micResult.error, 4000);
  } else {
    toast('Document camera microphone unavailable. Select another microphone.', 4000);
  }
  await populateMicSelect();
}

startCameraBtn.addEventListener('click', startEverything);

cameraSelect.addEventListener('change', async () => {
  const result = await cameraManager.start(cameraSelect.value);
  if (!result.ok) {
    showError(result.error);
    return;
  }
  resolutionInfo.textContent = cameraManager.resolutionLabel;
});

micSelect.addEventListener('change', async () => {
  const result = await audioManager.start(micSelect.value);
  if (!result.ok) toast(result.error, 4000);
});

cameraManager.addEventListener('started', () => {
  resolutionInfo.textContent = cameraManager.resolutionLabel;
});
cameraManager.addEventListener('disconnected', () => {
  showError('Document camera disconnected.');
  gateEl.hidden = false;
  gateErrorEl.hidden = true;
  startCameraBtn.disabled = false;
});
cameraManager.addEventListener('devices-changed', populateCameraSelect);
audioManager.addEventListener('disconnected', () => {
  toast('Document camera microphone unavailable. Select another microphone.', 4000);
});

// ---------- Stage sizing ----------
function resizeStage() {
  const rect = stageWrap.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  stage.width = Math.max(2, Math.round(rect.width * dpr));
  stage.height = Math.max(2, Math.round(rect.height * dpr));
}
new ResizeObserver(resizeStage).observe(stageWrap);
resizeStage();

// ---------- Render loop ----------
let lastRecBadgeUpdate = 0;
function loop() {
  compositor.render(stageCtx, stage.width, stage.height, currentDisplayMode());
  appEl.classList.toggle(
    'pannable',
    !currentTool && currentDisplayMode() === 'camera' && compositor.view.zoom > 1.01
  );
  if (uiState.state.isRecording) {
    const now = performance.now();
    if (now - lastRecBadgeUpdate > 400) {
      lastRecBadgeUpdate = now;
      const secs = Math.floor(recordingManager.stats.elapsedMs / 1000);
      const mm = String(Math.floor(secs / 60)).padStart(2, '0');
      const ss = String(secs % 60).padStart(2, '0');
      recTimeEl.textContent = `${mm}:${ss}`;
      if (!recordStats.hidden) {
        const mb = (recordingManager.stats.approxBytes / (1024 * 1024)).toFixed(1);
        recordStats.textContent = `${mm}:${ss} · ~${mb} MB · ${recordingManager.stats.width}×${recordingManager.stats.height}`;
      }
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------- Panels ----------
const panels = ['camera', 'compare', 'annotate', 'record', 'export'];
function closeAllPanels() {
  panels.forEach((p) => {
    document.getElementById(`panel-${p}`).hidden = true;
  });
  document.querySelectorAll('.tbtn[data-panel]').forEach((b) => b.classList.remove('active'));
}
function openPanel(name) {
  const alreadyOpen = !document.getElementById(`panel-${name}`).hidden;
  closeAllPanels();
  if (alreadyOpen) {
    if (name === 'annotate') setTool(null);
    return;
  }
  document.getElementById(`panel-${name}`).hidden = false;
  document.querySelector(`.tbtn[data-panel="${name}"]`)?.classList.add('active');
  if (name === 'annotate' && !currentTool) setTool('pen');
  if (name === 'compare') refreshComparePanel();
}
document.querySelectorAll('.tbtn[data-panel]').forEach((btn) => {
  btn.addEventListener('click', () => openPanel(btn.dataset.panel));
});

// ---------- Freeze ----------
async function toggleFreeze() {
  if (compositor.isFrozen) {
    compositor.resume();
    uiState.setFrozen(false);
    frozenBadge.hidden = true;
    freezeLabel.textContent = 'Freeze';
  } else {
    const ok = await compositor.freeze();
    if (!ok) {
      toast('No camera image to freeze yet.');
      return;
    }
    uiState.setFrozen(true);
    frozenBadge.hidden = false;
    freezeLabel.textContent = 'Resume';
  }
}
document.querySelector('.tbtn[data-action="freeze"]').addEventListener('click', toggleFreeze);

// ---------- Capture ----------
function flash() {
  captureFlash.hidden = false;
  captureFlash.classList.remove('flashing');
  void captureFlash.offsetWidth; // restart animation
  captureFlash.classList.add('flashing');
}

async function thumbFromBitmap(bitmap, maxW = 220) {
  const c = document.createElement('canvas');
  const scale = maxW / bitmap.width;
  c.width = maxW;
  c.height = Math.round(bitmap.height * scale);
  c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height);
  return new Promise((resolve) => c.toBlob((b) => resolve(URL.createObjectURL(b)), 'image/jpeg', 0.82));
}

async function doCapture() {
  if (!cameraManager.videoWidth && !compositor.isFrozen) {
    toast('No document camera image to capture.');
    return;
  }
  if (uiState.state.mode === 'comparison') {
    if (grid.isFull) {
      toast('Comparison is full — start a New Set to capture more.');
      return;
    }
    const bitmap = await captureManager.captureCameraStill(stage.width, stage.height);
    if (!bitmap) return;
    const idx = grid.addCapture(bitmap);
    flash();
    if (grid.isFull) uiState.setComparisonComplete(true);
    refreshComparePanel();
    refreshHud();
    toast(`Captured image ${idx + 1} of ${grid.size}`);
  } else {
    const bitmap = await captureManager.captureCameraStill(stage.width, stage.height);
    if (!bitmap) return;
    lastCapture = { imageBitmap: bitmap };
    flash();
    if (lastCaptureUrl) URL.revokeObjectURL(lastCaptureUrl);
    lastCaptureUrl = await thumbFromBitmap(bitmap);
    lastCaptureImg.src = lastCaptureUrl;
    lastCaptureEl.hidden = false;
    toast('Captured');
  }
}
document.querySelector('.tbtn[data-action="capture"]').addEventListener('click', doCapture);
lastCaptureDismissBtn.addEventListener('click', () => (lastCaptureEl.hidden = true));
lastCaptureExportBtn.addEventListener('click', () => {
  if (lastCapture) exportManager.exportImage(lastCapture.imageBitmap, 'png');
});

// ---------- Comparison mode ----------
GRID_PRESETS.forEach((n) => {
  const b = document.createElement('button');
  b.textContent = String(n);
  b.addEventListener('click', () => {
    if (compositor.isFrozen) toggleFreeze();
    grid.start(n, labelPrefixInput.value.trim());
    uiState.enterComparison();
    compareModal.hidden = true;
    refreshComparePanel();
    refreshHud();
    toast(`Compare: ${n} image${n > 1 ? 's' : ''}`);
  });
  gridSizeOptionsEl.appendChild(b);
});
compareStartBtn.addEventListener('click', () => (compareModal.hidden = false));
compareCancelBtn.addEventListener('click', () => (compareModal.hidden = true));

function refreshComparePanel() {
  if (grid.size === 0) {
    compareStatus.textContent = 'No comparison active.';
    compareStartBtn.textContent = 'Start Comparison…';
  } else if (grid.isFull) {
    compareStatus.textContent = `Comparison complete (${grid.size} images).`;
    compareStartBtn.textContent = 'Start New Comparison…';
  } else {
    compareStatus.textContent = `Capturing image ${grid.nextIndex + 1} of ${grid.size}.`;
    compareStartBtn.textContent = 'Start New Comparison…';
  }
  syncSlotLabelEditor();
}

function syncSlotLabelEditor() {
  const i = grid.activeSlotIndex;
  const slot = i >= 0 ? grid.slots[i] : null;
  if (slot && slot.image) {
    slotLabelEditor.hidden = false;
    slotLabelInput.value = slot.label;
  } else {
    slotLabelEditor.hidden = true;
  }
}
slotLabelInput.addEventListener('input', () => {
  if (grid.activeSlotIndex >= 0) grid.renameSlot(grid.activeSlotIndex, slotLabelInput.value);
});
slotDeleteBtn.addEventListener('click', () => {
  if (grid.activeSlotIndex >= 0) {
    grid.deleteSlot(grid.activeSlotIndex);
    grid.activeSlotIndex = -1;
    uiState.setComparisonComplete(grid.isFull);
    refreshComparePanel();
    refreshHud();
  }
});

function refreshHud() {
  if (uiState.state.mode !== 'comparison' || grid.size === 0) {
    hudEl.hidden = true;
    return;
  }
  hudEl.hidden = false;
  if (grid.isFull) {
    hudTextEl.textContent = 'Comparison complete';
    hudPrimaryBtn.textContent = 'New Set';
    hudPrimaryBtn.onclick = () => {
      if (compositor.isFrozen) toggleFreeze();
      grid.newSet(labelPrefixInput.value.trim());
      uiState.setComparisonComplete(false);
      refreshComparePanel();
      refreshHud();
    };
    hudSecondaryBtn.hidden = false;
    hudSecondaryBtn.textContent = 'Exit';
    hudSecondaryBtn.onclick = () => {
      uiState.goToCamera();
      refreshHud();
    };
  } else {
    hudTextEl.textContent = `Capturing image ${grid.nextIndex + 1} of ${grid.size}`;
    hudPrimaryBtn.textContent = 'Exit Comparison';
    hudPrimaryBtn.onclick = () => {
      uiState.goToCamera();
      refreshHud();
    };
    hudSecondaryBtn.hidden = true;
  }
}

// ---------- Camera view controls ----------
function setZoom(z) {
  compositor.view.zoom = Math.min(4, Math.max(1, z));
  zoomSlider.value = compositor.view.zoom.toFixed(2);
}
zoomSlider.addEventListener('input', () => setZoom(parseFloat(zoomSlider.value)));
brightnessSlider.addEventListener('input', () => (compositor.view.brightness = Number(brightnessSlider.value)));
contrastSlider.addEventListener('input', () => (compositor.view.contrast = Number(contrastSlider.value)));
rotateBtn.addEventListener('click', () => {
  compositor.view.rotation = (compositor.view.rotation + 90) % 360;
});
mirrorBtn.addEventListener('click', () => {
  compositor.view.mirrorH = !compositor.view.mirrorH;
  mirrorBtn.classList.toggle('active', compositor.view.mirrorH);
});
flipBtn.addEventListener('click', () => {
  compositor.view.flipV = !compositor.view.flipV;
  flipBtn.classList.toggle('active', compositor.view.flipV);
});
resetViewBtn.addEventListener('click', () => {
  compositor.resetView();
  zoomSlider.value = 1;
});

stage.addEventListener(
  'wheel',
  (e) => {
    if (currentDisplayMode() !== 'camera') return;
    e.preventDefault();
    setZoom(compositor.view.zoom - e.deltaY * 0.0015);
  },
  { passive: false }
);

// ---------- Annotation tools ----------
document.querySelectorAll('.tool-btn').forEach((btn) => {
  btn.addEventListener('click', () => setTool(btn.dataset.tool));
});
function setTool(tool) {
  currentTool = tool;
  document.querySelectorAll('.tool-btn').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
  appEl.classList.toggle('tool-active', !!tool);
}
function annotColor() {
  return colorPicker.value;
}
function annotThickness() {
  return Number(thicknessSlider.value);
}

function activeAnnotationLayer() {
  if (currentDisplayMode() === 'comparison' && grid.activeSlotIndex >= 0) {
    return grid.slots[grid.activeSlotIndex]?.annotations || null;
  }
  return compositor.liveAnnotations;
}
undoBtn.addEventListener('click', () => activeAnnotationLayer()?.undo());
redoBtn.addEventListener('click', () => activeAnnotationLayer()?.redo());
clearAnnotationsBtn.addEventListener('click', () => activeAnnotationLayer()?.clear());

function stagePoint(e) {
  const r = stage.getBoundingClientRect();
  const scaleX = stage.width / r.width;
  const scaleY = stage.height / r.height;
  return { x: (e.clientX - r.left) * scaleX, y: (e.clientY - r.top) * scaleY };
}

function eraseAt(layer, rect, pt) {
  const nx = (pt.x - rect.x) / rect.w;
  const ny = (pt.y - rect.y) / rect.h;
  const threshold = 0.035;
  layer.strokes = layer.strokes.filter(
    (s) => !s.points.some((p) => Math.hypot(p.x - nx, p.y - ny) < threshold)
  );
}

function beginDraw(layer, rect, pt) {
  const nx = (pt.x - rect.x) / rect.w;
  const ny = (pt.y - rect.y) / rect.h;
  if (currentTool === 'eraser') {
    dragState = { type: 'erase', layer, rect };
    eraseAt(layer, rect, pt);
    return;
  }
  if (currentTool === 'text') {
    const text = window.prompt('Enter text:');
    if (text) layer.addText(nx, ny, text, annotColor(), annotThickness());
    return;
  }
  layer.beginStroke(currentTool, annotColor(), annotThickness());
  layer.addPoint(nx, ny);
  dragState = { type: 'draw', layer, rect };
}

stage.addEventListener('pointerdown', (e) => {
  const mode = currentDisplayMode();
  const pt = stagePoint(e);

  if (mode === 'comparison') {
    const i = compositor.hitTestSlot(stage.width, stage.height, pt.x, pt.y);
    if (i < 0) return;
    grid.activeSlotIndex = i;
    syncSlotLabelEditor();
    if (!currentTool) return;
    const rect = compositor.getSlotImageRect(stage.width, stage.height, i);
    if (!rect) return;
    stage.setPointerCapture(e.pointerId);
    beginDraw(grid.slots[i].annotations, rect, pt);
    return;
  }

  if (!currentTool) {
    dragState = {
      type: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      panX0: compositor.view.panX,
      panY0: compositor.view.panY,
    };
    stage.setPointerCapture(e.pointerId);
    return;
  }
  stage.setPointerCapture(e.pointerId);
  const rect = compositor.cameraImageRect(stage.width, stage.height);
  beginDraw(compositor.liveAnnotations, rect, pt);
});

stage.addEventListener('pointermove', (e) => {
  if (!dragState) return;
  const pt = stagePoint(e);
  if (dragState.type === 'pan') {
    const r = stage.getBoundingClientRect();
    const scaleX = stage.width / r.width;
    const scaleY = stage.height / r.height;
    compositor.view.panX = dragState.panX0 + (e.clientX - dragState.startX) * scaleX;
    compositor.view.panY = dragState.panY0 + (e.clientY - dragState.startY) * scaleY;
    return;
  }
  if (dragState.type === 'erase') {
    eraseAt(dragState.layer, dragState.rect, pt);
    return;
  }
  if (dragState.type === 'draw') {
    const nx = (pt.x - dragState.rect.x) / dragState.rect.w;
    const ny = (pt.y - dragState.rect.y) / dragState.rect.h;
    const layer = dragState.layer;
    const cur = layer.current;
    if (!cur) return;
    if (currentTool === 'pen' || currentTool === 'highlighter') {
      layer.addPoint(nx, ny);
    } else if (cur.points.length > 1) {
      cur.points[1] = { x: nx, y: ny };
    } else {
      cur.points.push({ x: nx, y: ny });
    }
  }
});

window.addEventListener('pointerup', () => {
  if (dragState?.type === 'draw') dragState.layer.commitStroke();
  dragState = null;
});

// ---------- Recording ----------
resolutionSelect.addEventListener('change', () => {
  qualityWarning.hidden = resolutionSelect.value === '1080p';
});

let recordingBusy = false;
async function startRecording() {
  if (recordingBusy || uiState.state.isRecording) return;
  recordingBusy = true;
  recordToggleBtn.disabled = true;
  const resDef = RECORDING_RESOLUTIONS.find((r) => r.id === resolutionSelect.value) || RECORDING_RESOLUTIONS[0];
  const audioTrack = audioManager.getTrack();
  const result = await recordingManager.start({
    compositor,
    getMode: currentDisplayMode,
    width: resDef.width,
    height: resDef.height,
    fps: 30,
    audioTrack,
  });
  recordToggleBtn.disabled = false;
  recordingBusy = false;
  if (!result.ok) {
    if (result.error !== 'cancelled') showError(result.error);
    return;
  }
  uiState.setRecording(true);
  recBadge.hidden = false;
  recordLabel.textContent = 'Stop';
  recordToggleBtn.textContent = 'Stop Recording';
  document.querySelector('.tbtn[data-panel="record"]').classList.add('recording');
  recordStats.hidden = false;
  if (!audioTrack) toast('Recording without narration audio — no microphone connected.', 4000);
}

async function stopRecording() {
  if (recordingBusy || !uiState.state.isRecording) return;
  recordingBusy = true;
  recordToggleBtn.disabled = true;
  const stats = await recordingManager.stop();
  recordToggleBtn.disabled = false;
  recordingBusy = false;
  uiState.setRecording(false);
  recBadge.hidden = true;
  recordLabel.textContent = 'Record';
  recordToggleBtn.textContent = 'Start Recording';
  recordStats.hidden = true;
  document.querySelector('.tbtn[data-panel="record"]').classList.remove('recording');
  if (stats) {
    const dest = stats.savedVia === 'file' ? 'your chosen location' : 'Downloads';
    toast(`Recording saved to ${dest}.`, 4000);
  }
}

recordToggleBtn.addEventListener('click', () => {
  if (uiState.state.isRecording) stopRecording();
  else startRecording();
});
// ---------- Export ----------
document.getElementById('export-image-png').addEventListener('click', () => handleExportImage('png'));
document.getElementById('export-image-jpeg').addEventListener('click', () => handleExportImage('jpeg'));
document.getElementById('export-cmp-png').addEventListener('click', () => handleExportComparison('png'));
document.getElementById('export-cmp-jpeg').addEventListener('click', () => handleExportComparison('jpeg'));
document.getElementById('export-cmp-pdf').addEventListener('click', () => handleExportComparison('pdf'));

function handleExportImage(format) {
  if (currentDisplayMode() === 'comparison') {
    const slot = grid.activeSlotIndex >= 0 ? grid.slots[grid.activeSlotIndex] : null;
    if (!slot?.image) {
      toast('Tap an image in the grid to select it first.');
      return;
    }
    exportManager.exportSlotImage(slot, format);
  } else if (lastCapture) {
    exportManager.exportImage(lastCapture.imageBitmap, format);
  } else {
    toast('Capture an image first.');
  }
}

async function handleExportComparison(format) {
  if (currentDisplayMode() !== 'comparison') {
    toast('Complete a comparison set first.');
    return;
  }
  const result = await exportManager.exportComparison(format);
  if (result && result.ok === false) toast(result.error, 4000);
}

// ---------- Fullscreen / Presentation ----------
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    appEl.requestFullscreen?.().catch(() => {});
  } else if (!presentationManager.active) {
    document.exitFullscreen();
  }
}
document.querySelector('.tbtn[data-action="fullscreen"]').addEventListener('click', toggleFullscreen);
document.querySelector('.tbtn[data-action="present"]').addEventListener('click', () => presentationManager.toggle());
exitPresentationBtn.addEventListener('click', () => presentationManager.exit());

presentationManager.addEventListener('change', (e) => {
  appEl.classList.toggle('presenting', e.detail.active);
  exitPresentationBtn.hidden = !e.detail.active;
  uiState.setPresenting(e.detail.active);
});

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && presentationManager.active) presentationManager.exit();
});

collapseToggleBtn.addEventListener('click', () => appEl.classList.toggle('collapsed'));

// ---------- Keyboard shortcuts ----------
document.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

  switch (e.key) {
    case ' ':
      e.preventDefault();
      toggleFreeze();
      break;
    case 'c':
    case 'C':
      doCapture();
      break;
    case 'r':
    case 'R':
      uiState.state.isRecording ? stopRecording() : startRecording();
      break;
    case 'f':
    case 'F':
      toggleFullscreen();
      break;
    case 'p':
    case 'P':
      presentationManager.toggle();
      break;
    case '0':
      compositor.resetView();
      zoomSlider.value = 1;
      break;
    case 'Escape':
      if (presentationManager.active) presentationManager.exit();
      else if (document.fullscreenElement) document.exitFullscreen();
      break;
    case 'z':
    case 'Z':
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.shiftKey) activeAnnotationLayer()?.redo();
        else activeAnnotationLayer()?.undo();
      }
      break;
  }
});

// ---------- UI state reactions ----------
uiState.addEventListener('change', () => {
  refreshHud();
});
