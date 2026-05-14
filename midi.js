// Minimal MIDI file writer — single track, one pattern loop

function _midiVarLen(v) {
  const out = [];
  out.unshift(v & 0x7f);
  v >>= 7;
  while (v) { out.unshift((v & 0x7f) | 0x80); v >>= 7; }
  return out;
}

function writeMidi(pattern, bpm, clickEnabled, pulseInterval) {
  const NOTE = {
    X_kick: 36,  // C1
    X_rim:  38,  // D1
    x:      46,  // A#1
    o_fill: 42,  // F#1
    click:  53,  // F2 — GM Ride Bell
  };

  const TICKS_PER_BEAT = 480;
  const usPerBeat = Math.round(60_000_000 / bpm);
  // Each step = 1/16th note = TICKS_PER_BEAT / 4 ticks
  const STEP_TICKS = TICKS_PER_BEAT / 4;
  const NOTE_LEN = Math.max(1, STEP_TICKS - 10);

  // --- MIDI helper writers ---
  const bytes = [];
  const push = (...b) => bytes.push(...b);
  const varLen = _midiVarLen;

  // --- Header chunk ---
  push(0x4d, 0x54, 0x68, 0x64); // MThd
  push(0, 0, 0, 6);              // length
  push(0, 0);                    // format 0
  push(0, 1);                    // 1 track
  push(TICKS_PER_BEAT >> 8, TICKS_PER_BEAT & 0xff);

  // --- Build track events ---
  const events = []; // {tick, type, note, vel}

  const addNote = (tick, note, vel = 100) => {
    events.push({ tick, on: true,  note, vel });
    events.push({ tick: tick + NOTE_LEN, on: false, note, vel: 0 });
  };

  const n = pattern.length;

  for (let i = 0; i < n; i++) {
    const ch = pattern[i];
    const tick = i * STEP_TICKS;

    if (ch === 'O') {
      addNote(tick, NOTE.X_kick);
    } else if (ch === 'X') {
      addNote(tick, NOTE.X_rim);
    } else if (ch === 'x') {
      addNote(tick, NOTE.x);
    } else if (ch === 'o') {
      addNote(tick, NOTE.o_fill);
    }

    if (clickEnabled && i % pulseInterval === 0) {
      addNote(tick, NOTE.click);
    }
  }

  // End-of-track marker
  const endTick = n * STEP_TICKS;
  events.push({ tick: endTick, meta: true });

  // Sort by tick, note-offs before note-ons at same tick
  events.sort((a, b) => a.tick - b.tick || (a.on ? 1 : -1));

  // --- Encode track events ---
  const trackBytes = [];
  const tpush = (...b) => trackBytes.push(...b);

  // Time signature: numerator = n steps, denominator = smallest power of 2 >= n/2
  // e.g. 7→7/4 (4>=3.5), 9→9/8 (8>=4.5), 17→17/16 (16>=8.5), 23→23/16 (16>=11.5)
  let timeSigDenom = 1;
  while (timeSigDenom < n / 2) timeSigDenom <<= 1;
  const timeSigDenomExp = Math.log2(timeSigDenom); // MIDI dd field: 2^dd = denominator
  tpush(0x00, 0xff, 0x58, 0x04, n, timeSigDenomExp, 24, 8);

  // Tempo meta event at delta 0
  tpush(0x00, 0xff, 0x51, 0x03);
  tpush((usPerBeat >> 16) & 0xff, (usPerBeat >> 8) & 0xff, usPerBeat & 0xff);

  let prevTick = 0;
  for (const ev of events) {
    const delta = ev.tick - prevTick;
    prevTick = ev.tick;
    tpush(...varLen(delta));

    if (ev.meta) {
      tpush(0xff, 0x2f, 0x00); // end of track
    } else if (ev.on) {
      tpush(0x99, ev.note, ev.vel); // note on ch 10 (drums)
    } else {
      tpush(0x89, ev.note, 0x00); // note off ch 10
    }
  }

  // --- Track chunk ---
  push(0x4d, 0x54, 0x72, 0x6b); // MTrk
  push((trackBytes.length >> 24) & 0xff, (trackBytes.length >> 16) & 0xff,
       (trackBytes.length >> 8)  & 0xff,  trackBytes.length & 0xff);
  push(...trackBytes);

  const blob = new Blob([new Uint8Array(bytes)], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rhythm.mid';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Multi-segment MIDI export for recordings.
// segments: string[]  — one pattern string per recorded iteration
// timeSigData: { [iterIndex]: { bpm, pulseInterval, clickEnabled } }
//   only entries where something changed; index 0 is always present.
//   Step count (time signature meter) is derived from segments[i].length.
function writeMidiRecording(segments, timeSigData) {
  if (!segments.length) return;

  const TICKS_PER_BEAT = 480;
  const STEP_TICKS = TICKS_PER_BEAT / 4;
  const NOTE_LEN = Math.max(1, STEP_TICKS - 10);
  const NOTE = { O: 36, X: 38, x: 46, o: 42, click: 53 };

  const sortedKeys = Object.keys(timeSigData).map(Number).sort((a, b) => a - b);
  function getMeta(i) {
    let m = timeSigData[sortedKeys[0]];
    for (const k of sortedKeys) {
      if (k <= i) m = timeSigData[k]; else break;
    }
    return m;
  }

  const events = [];
  const addNote = (tick, note, vel = 100) => {
    events.push({ tick, on: true,  note, vel });
    events.push({ tick: tick + NOTE_LEN, on: false, note, vel: 0 });
  };

  let currentTick = 0;
  let prevBpm = null;
  let prevSteps = null;

  for (let i = 0; i < segments.length; i++) {
    const pattern = segments[i];
    const n = pattern.length;
    const { bpm, pulseInterval, clickEnabled } = getMeta(i);

    if (bpm !== prevBpm) {
      const us = Math.round(60_000_000 / bpm);
      events.push({ tick: currentTick, tempo: us });
      prevBpm = bpm;
    }

    if (n !== prevSteps) {
      let denom = 1;
      while (denom < n / 2) denom <<= 1;
      events.push({ tick: currentTick, timesig: { n, denomExp: Math.log2(denom) } });
      prevSteps = n;
    }

    for (let j = 0; j < n; j++) {
      const ch = pattern[j];
      const tick = currentTick + j * STEP_TICKS;
      if (ch === 'O') addNote(tick, NOTE.O);
      else if (ch === 'X') addNote(tick, NOTE.X);
      else if (ch === 'x') addNote(tick, NOTE.x);
      else if (ch === 'o') addNote(tick, NOTE.o);
      if (clickEnabled && j % pulseInterval === 0) addNote(tick, NOTE.click);
    }

    currentTick += n * STEP_TICKS;
  }

  events.push({ tick: currentTick, endtrack: true });

  events.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    const rank = e => (e.endtrack || e.tempo !== undefined || e.timesig) ? 0 : e.on ? 2 : 1;
    return rank(a) - rank(b);
  });

  // --- Encode ---
  const bytes = [];
  const push = (...b) => bytes.push(...b);

  push(0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1,
       TICKS_PER_BEAT >> 8, TICKS_PER_BEAT & 0xff);

  const trackBytes = [];
  const tpush = (...b) => trackBytes.push(...b);

  let prevTick = 0;
  for (const ev of events) {
    const delta = ev.tick - prevTick;
    prevTick = ev.tick;
    tpush(..._midiVarLen(delta));

    if (ev.endtrack) {
      tpush(0xff, 0x2f, 0x00);
    } else if (ev.tempo !== undefined) {
      const us = ev.tempo;
      tpush(0xff, 0x51, 0x03, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff);
    } else if (ev.timesig) {
      tpush(0xff, 0x58, 0x04, ev.timesig.n, ev.timesig.denomExp, 24, 8);
    } else if (ev.on) {
      tpush(0x99, ev.note, ev.vel);
    } else {
      tpush(0x89, ev.note, 0x00);
    }
  }

  push(0x4d, 0x54, 0x72, 0x6b);
  push((trackBytes.length >> 24) & 0xff, (trackBytes.length >> 16) & 0xff,
       (trackBytes.length >> 8)  & 0xff,  trackBytes.length & 0xff);
  push(...trackBytes);

  const blob = new Blob([new Uint8Array(bytes)], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'recording.mid';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
