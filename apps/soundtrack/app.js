const tracks = [
  { id: 'kick', label: 'Kick' }, { id: 'snare', label: 'Snare' }, { id: 'hat', label: 'Hat' }, { id: 'clap', label: 'Clap' },
  { id: 'bass', label: 'Bass' }, { id: 'chord', label: 'Chords' }, { id: 'lead', label: 'Lead' }, { id: 'sting', label: 'Sting' }
];

const scenes = {
  transformation: { title: 'Transformation Gag', description: 'A bouncy beat with sparkly rising notes and a comic ending sting.', tempo: 118, density: .58 },
  chase: { title: 'Chase', description: 'Fast pulse, busy hats, and a bass line that feels like running feet.', tempo: 132, density: .72 },
  sneaky: { title: 'Sneaky', description: 'Sparse ticks, little bass steps, and a suspicious melody.', tempo: 92, density: .38 },
  space: { title: 'Space Mood', description: 'Slow pads, floating notes, and a wide sci-fi atmosphere.', tempo: 86, density: .34 },
  victory: { title: 'Victory', description: 'Bright chords, confident drums, and an ending flourish.', tempo: 124, density: .62 },
  sadrobot: { title: 'Sad Robot', description: 'Soft minor chords, simple drums, and a lonely electronic melody.', tempo: 78, density: .32 }
};

const styleSettings = {
  synthwave: { wave: 'sawtooth', bass: 'sawtooth', filter: 950, delay: .22 },
  arcade: { wave: 'square', bass: 'square', filter: 1600, delay: .12 },
  newwave: { wave: 'triangle', bass: 'sawtooth', filter: 1200, delay: .18 },
  scifi: { wave: 'sine', bass: 'triangle', filter: 740, delay: .30 }
};

const state = {
  pattern: Object.fromEntries(tracks.map(t => [t.id, Array(16).fill(false)])),
  step: -1,
  audioCtx: null,
  master: null,
  timer: null,
  mood: 'funny',
  isPlaying: false,
  nextNoteTime: 0,
  scheduleStep: 0
};

const els = {
  playBtn: document.querySelector('#playBtn'), stopBtn: document.querySelector('#stopBtn'), generateBtn: document.querySelector('#generateBtn'),
  randomDrumsBtn: document.querySelector('#randomDrumsBtn'), randomBassBtn: document.querySelector('#randomBassBtn'), randomLeadBtn: document.querySelector('#randomLeadBtn'),
  clearBtn: document.querySelector('#clearBtn'), sequencer: document.querySelector('#sequencer'),
  tempoSlider: document.querySelector('#tempoSlider'), tempoValue: document.querySelector('#tempoValue'), brightSlider: document.querySelector('#brightSlider'), brightValue: document.querySelector('#brightValue'),
  sceneSelect: document.querySelector('#sceneSelect'), styleSelect: document.querySelector('#styleSelect'), keySelect: document.querySelector('#keySelect'), barsSelect: document.querySelector('#barsSelect'),
  sceneTitle: document.querySelector('#sceneTitle'), sceneDescription: document.querySelector('#sceneDescription'), patternName: document.querySelector('#patternName'),
  statusDot: document.querySelector('#statusDot'), statusText: document.querySelector('#statusText'), currentStep: document.querySelector('#currentStep'),
  saveBtn: document.querySelector('#saveBtn'), downloadBtn: document.querySelector('#downloadBtn'), loadInput: document.querySelector('#loadInput'), wavBtn: document.querySelector('#wavBtn')
};

function setupGrid() {
  els.sequencer.innerHTML = '';
  for (const track of tracks) {
    const row = document.createElement('div'); row.className = 'seq-row';
    const label = document.createElement('div'); label.className = 'track-label'; label.textContent = track.label;
    const steps = document.createElement('div'); steps.className = 'steps';
    for (let i = 0; i < 16; i++) {
      const btn = document.createElement('button'); btn.className = 'step'; btn.type = 'button';
      btn.setAttribute('aria-label', `${track.label} step ${i + 1}`);
      btn.addEventListener('click', () => { state.pattern[track.id][i] = !state.pattern[track.id][i]; renderGrid(); saveLocal(); });
      steps.appendChild(btn);
    }
    row.append(label, steps); els.sequencer.appendChild(row);
  }
  renderGrid();
}

function renderGrid() {
  [...els.sequencer.querySelectorAll('.seq-row')].forEach((row, r) => {
    const id = tracks[r].id;
    [...row.querySelectorAll('.step')].forEach((btn, i) => {
      btn.classList.toggle('active', !!state.pattern[id][i]);
      btn.classList.toggle('playhead', i === state.step);
    });
  });
  els.currentStep.textContent = state.step >= 0 ? state.step + 1 : '—';
}

function initAudio() {
  if (state.audioCtx) return;
  state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  state.master = state.audioCtx.createGain();
  state.master.gain.value = 0.72;
  state.master.connect(state.audioCtx.destination);
}

function stepSeconds() { return 60 / Number(els.tempoSlider.value) / 4; }

function scheduler() {
  const lookAhead = 0.12;
  while (state.nextNoteTime < state.audioCtx.currentTime + lookAhead) {
    playStep(state.audioCtx, state.scheduleStep, state.nextNoteTime, state.master);
    const uiStep = state.scheduleStep;
    setTimeout(() => { state.step = uiStep; renderGrid(); }, Math.max(0, (state.nextNoteTime - state.audioCtx.currentTime) * 1000));
    state.nextNoteTime += stepSeconds();
    state.scheduleStep = (state.scheduleStep + 1) % 16;
  }
}

function playStep(ctx, step, time, destination) {
  const p = state.pattern;
  if (p.kick[step]) kick(ctx, time, destination);
  if (p.snare[step]) noiseHit(ctx, time, destination, .18, .34, 1200, 'highpass');
  if (p.hat[step]) noiseHit(ctx, time, destination, .045, .14, 5000, 'highpass');
  if (p.clap[step]) { noiseHit(ctx, time, destination, .08, .18, 1600, 'bandpass'); noiseHit(ctx, time + .035, destination, .09, .13, 1800, 'bandpass'); }
  if (p.bass[step]) synth(ctx, time, destination, freq(note(2, bassDegree(step))), .16, styleSettings[els.styleSelect.value].bass, .34, 280);
  if (p.chord[step]) chord(ctx, time, destination, [note(3, chordRoot(step)), note(3, chordRoot(step)+2), note(4, chordRoot(step)+4)].map(freq));
  if (p.lead[step]) synth(ctx, time, destination, freq(note(5, leadDegree(step))), .13, styleSettings[els.styleSelect.value].wave, .18, styleSettings[els.styleSelect.value].filter);
  if (p.sting[step]) { synth(ctx, time, destination, freq(note(5, 7)), .42, 'square', .2, 1800); synth(ctx, time + .055, destination, freq(note(6, 0)), .22, 'triangle', .14, 2400); }
}

function envGain(ctx, time, dur, gain = .3, attack = .01, release = .08) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(Math.max(.0002, gain), time + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur + release);
  return g;
}

function synth(ctx, time, dest, frequency, dur, type, volume, filterFreq) {
  const osc = ctx.createOscillator(); const filter = ctx.createBiquadFilter(); const gain = envGain(ctx, time, dur, volume, .008, .12);
  osc.type = type; osc.frequency.setValueAtTime(frequency, time);
  filter.type = 'lowpass'; filter.frequency.setValueAtTime(filterFreq, time); filter.Q.value = 1.2;
  osc.connect(filter).connect(gain).connect(dest); osc.start(time); osc.stop(time + dur + .25);
}

function chord(ctx, time, dest, freqs) {
  const padBus = ctx.createGain(); padBus.gain.value = .18; padBus.connect(dest);
  freqs.forEach((f, i) => synth(ctx, time + i * .004, padBus, f, .52, styleSettings[els.styleSelect.value].wave, .28, 920));
}

function kick(ctx, time, dest) {
  const osc = ctx.createOscillator(); const gain = envGain(ctx, time, .24, .9, .004, .06);
  osc.type = 'sine'; osc.frequency.setValueAtTime(150, time); osc.frequency.exponentialRampToValueAtTime(42, time + .22);
  osc.connect(gain).connect(dest); osc.start(time); osc.stop(time + .32);
}

function noiseHit(ctx, time, dest, dur, volume, cutoff, filterType) {
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buffer;
  const filter = ctx.createBiquadFilter(); filter.type = filterType; filter.frequency.value = cutoff; filter.Q.value = .85;
  const gain = envGain(ctx, time, dur, volume, .003, .04);
  src.connect(filter).connect(gain).connect(dest); src.start(time); src.stop(time + dur + .06);
}

function notesForKey() {
  const [root, mode] = els.keySelect.value.split(' ');
  const chroma = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const intervals = mode === 'major' ? [0,2,4,5,7,9,11] : [0,2,3,5,7,8,10];
  const idx = chroma.indexOf(root);
  return intervals.map(n => chroma[(idx + n) % 12]);
}
function note(octave, degree) { const scale = notesForKey(); return `${scale[((degree % scale.length)+scale.length)%scale.length]}${octave}`; }
function freq(n) {
  const m = n.match(/^([A-G]#?)(\d)$/); const chroma = {'C':0,'C#':1,'D':2,'D#':3,'E':4,'F':5,'F#':6,'G':7,'G#':8,'A':9,'A#':10,'B':11};
  const midi = (Number(m[2]) + 1) * 12 + chroma[m[1]]; return 440 * Math.pow(2, (midi - 69) / 12);
}
function bassDegree(step) { return [0,0,4,0, 5,5,4,2, 0,0,4,0, 3,2,1,0][step]; }
function chordRoot(step) { return [0,0,0,0, 5,5,5,5, 3,3,3,3, 4,4,4,4][step]; }
function leadDegree(step) { return [7,5,4,2, 3,4,5,7, 9,7,5,4, 3,2,1,0][step]; }

function generate(which = 'all') {
  const scene = scenes[els.sceneSelect.value]; const density = scene.density; const mood = state.mood;
  if (which === 'all' || which === 'drums') {
    fill('kick', [0,8, ...(els.sceneSelect.value === 'chase' ? [4,12] : []), ...(Math.random() > .5 ? [14] : [])]);
    fill('snare', [4,12]); fill('clap', mood === 'soft' ? [] : [4,12]);
    state.pattern.hat = state.pattern.hat.map((_, i) => i % (els.sceneSelect.value === 'space' ? 4 : 2) === 0 || Math.random() < density * .18);
  }
  if (which === 'all' || which === 'bass') state.pattern.bass = state.pattern.bass.map((_, i) => [0,3,6,8,11,14].includes(i) || Math.random() < density * .28);
  if (which === 'all') state.pattern.chord = state.pattern.chord.map((_, i) => [0,4,8,12].includes(i));
  if (which === 'all' || which === 'lead') {
    state.pattern.lead = state.pattern.lead.map((_, i) => (i % 2 === 1 && Math.random() < density * .62) || (mood === 'dramatic' && [10,11,14].includes(i)));
    state.pattern.sting = state.pattern.sting.map((_, i) => i === 15 && ['transformation','victory'].includes(els.sceneSelect.value));
  }
  els.patternName.textContent = `${scene.title} / ${mood} / ${els.styleSelect.options[els.styleSelect.selectedIndex].text}`;
  renderGrid(); saveLocal();
}
function fill(id, indexes) { state.pattern[id] = state.pattern[id].map((_, i) => indexes.includes(i)); }
function clearPattern() { for (const t of tracks) state.pattern[t.id] = Array(16).fill(false); renderGrid(); saveLocal(); }
function updateSceneUI() { const s = scenes[els.sceneSelect.value]; els.sceneTitle.textContent = s.title; els.sceneDescription.textContent = s.description; els.tempoSlider.value = s.tempo; els.tempoValue.textContent = s.tempo; }
function setStatus(playing) { state.isPlaying = playing; els.statusDot.classList.toggle('playing', playing); els.statusText.textContent = playing ? 'Playing loop' : 'Ready'; els.playBtn.textContent = playing ? '⏸ Pause' : '▶ Play'; }
function projectData() { return { pattern: state.pattern, tempo: +els.tempoSlider.value, bright: +els.brightSlider.value, scene: els.sceneSelect.value, style: els.styleSelect.value, key: els.keySelect.value, bars: els.barsSelect.value, mood: state.mood }; }
function saveLocal() { localStorage.setItem('synthSceneBuilderProject', JSON.stringify(projectData())); }
function loadProject(data) {
  if (!data || !data.pattern) return;
  for (const t of tracks) state.pattern[t.id] = Array.isArray(data.pattern[t.id]) ? data.pattern[t.id].slice(0,16) : Array(16).fill(false);
  els.tempoSlider.value = data.tempo || 118; els.tempoValue.textContent = els.tempoSlider.value;
  els.brightSlider.value = data.bright || 55; els.brightValue.textContent = els.brightSlider.value;
  els.sceneSelect.value = data.scene || 'transformation'; els.styleSelect.value = data.style || 'synthwave'; els.keySelect.value = data.key || 'C minor'; els.barsSelect.value = data.bars || '2'; state.mood = data.mood || 'funny';
  const s = scenes[els.sceneSelect.value]; els.sceneTitle.textContent = s.title; els.sceneDescription.textContent = s.description; renderGrid();
}
function downloadProject() { const blob = new Blob([JSON.stringify(projectData(), null, 2)], { type: 'application/json' }); downloadBlob(blob, 'synth-scene-project.json'); }
function downloadBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href); }

async function exportWav() {
  els.statusText.textContent = 'Rendering WAV...';
  const bars = Number(els.barsSelect.value); const duration = stepSeconds() * 16 * bars;
  const sampleRate = 44100; const offline = new OfflineAudioContext(1, Math.ceil(sampleRate * duration), sampleRate);
  const dest = offline.createGain(); dest.gain.value = .72; dest.connect(offline.destination);
  for (let b = 0; b < bars; b++) for (let s = 0; s < 16; s++) playStep(offline, s, (b * 16 + s) * stepSeconds(), dest);
  const buffer = await offline.startRendering(); const wav = audioBufferToWav(buffer); downloadBlob(new Blob([wav], { type: 'audio/wav' }), 'synth-scene-loop.wav');
  els.statusText.textContent = 'Exported WAV';
}
function audioBufferToWav(buffer) {
  const samples = buffer.getChannelData(0); const dataLength = samples.length * 2; const ab = new ArrayBuffer(44 + dataLength); const view = new DataView(ab);
  writeStr(view, 0, 'RIFF'); view.setUint32(4, 36 + dataLength, true); writeStr(view, 8, 'WAVE'); writeStr(view, 12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeStr(view, 36, 'data'); view.setUint32(40, dataLength, true); let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) { const s = Math.max(-1, Math.min(1, samples[i])); view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7FFF, true); }
  return ab;
}
function writeStr(view, offset, str) { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); }

els.playBtn.addEventListener('click', async () => { initAudio(); await state.audioCtx.resume(); if (state.isPlaying) { clearInterval(state.timer); setStatus(false); } else { state.nextNoteTime = state.audioCtx.currentTime + .03; state.scheduleStep = 0; state.timer = setInterval(scheduler, 25); setStatus(true); } });
els.stopBtn.addEventListener('click', () => { clearInterval(state.timer); state.step = -1; state.scheduleStep = 0; setStatus(false); renderGrid(); });
els.generateBtn.addEventListener('click', () => generate('all'));
els.randomDrumsBtn.addEventListener('click', () => generate('drums'));
els.randomBassBtn.addEventListener('click', () => generate('bass'));
els.randomLeadBtn.addEventListener('click', () => generate('lead'));
els.clearBtn.addEventListener('click', clearPattern);
els.tempoSlider.addEventListener('input', e => { els.tempoValue.textContent = e.target.value; saveLocal(); });
els.brightSlider.addEventListener('input', e => { els.brightValue.textContent = e.target.value; document.documentElement.style.setProperty('--panel', `rgba(255,255,255,${0.05 + e.target.value/900})`); saveLocal(); });
els.sceneSelect.addEventListener('change', () => { updateSceneUI(); generate('all'); });
[els.styleSelect, els.keySelect, els.barsSelect].forEach(el => el.addEventListener('change', saveLocal));
document.querySelectorAll('[data-mood]').forEach(b => b.addEventListener('click', () => { state.mood = b.dataset.mood; generate('all'); }));
els.saveBtn.addEventListener('click', () => { saveLocal(); els.statusText.textContent = 'Saved on this device'; });
els.downloadBtn.addEventListener('click', downloadProject);
els.wavBtn.addEventListener('click', exportWav);
els.loadInput.addEventListener('change', async e => { const file = e.target.files[0]; if (!file) return; loadProject(JSON.parse(await file.text())); saveLocal(); });

setupGrid();
const saved = localStorage.getItem('synthSceneBuilderProject');
if (saved) { try { loadProject(JSON.parse(saved)); } catch { updateSceneUI(); generate('all'); } } else { updateSceneUI(); generate('all'); }
