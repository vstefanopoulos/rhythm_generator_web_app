// Maps semantic drum role → sample path. Change paths here to swap the entire kit.
const DRUM_KIT = {
  kick:       'assets/wav/kick.mp3',
  snare:      'assets/wav/rim.mp3',
  aux:        'assets/wav/side.mp3',
  hh:         'assets/wav/hh.mp3',
  subdivision: 'assets/wav/ride_bell.mp3',
  tambourine: 'assets/wav/tambourine.mp3',
};

class RhythmPlayer {
  constructor(kit = DRUM_KIT) {
    this.kit = kit;
    this.ctx = null;
    this.buffers = {};
    this.gains = {};
    this.masterGain = null;

    this.isPlaying = false;
    this.currentStep = 0;
    this.nextStepTime = 0;
    this.schedulerTimer = null;
    this.onLoopComplete = null; // callback(pattern, { bpm, subdivision, subdivisionEnabled })
    this.stepQueue = []; // { time, step } pairs for latency-compensated visualizer

    // Live pattern — swapped at loop boundary
    this.activePattern = '';
    this.pendingPattern = null;
    this.pendingBpm = null;
    this.pendingSubdivisionEnabled = null;
    this.pendingSubdivision = null;
    this.pendingFillEmpty = null;
    this.pendingTambourine = null;

    this.bpm = 120;
    this.subdivisionEnabled = false;
    this.subdivision = 4;
    this.fillEmpty = false;
    this.tambourine = false;

    this.LOOKAHEAD = 0.1;   // seconds to schedule ahead
    this.SCHEDULE_INTERVAL = 25; // ms between scheduler calls
  }

  // Must be called synchronously inside a user-gesture handler (Safari requirement).
  createContext() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    for (const role of Object.keys(this.kit)) {
      this.gains[role] = this.ctx.createGain();
      this.gains[role].connect(this.masterGain);
    }
  }

  async init() {
    this.createContext();
    await this._loadSamples();
  }

  async _loadSamples() {
    const load = async (role) => {
      const res = await fetch(this.kit[role]);
      const buf = await res.arrayBuffer();
      this.buffers[role] = await this.ctx.decodeAudioData(buf);
    };
    await Promise.all(Object.keys(this.kit).map(load));
  }

  // Replace the buffer for a single role with a user-supplied AudioBuffer.
  loadBuffer(role, audioBuffer) {
    this.buffers[role] = audioBuffer;
  }

  setVolume(role, value) { // value 0–1; role is 'master' or a key from DRUM_KIT
    if (role === 'master') {
      this.masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01);
    } else {
      this.gains[role] && this.gains[role].gain.setTargetAtTime(value, this.ctx.currentTime, 0.01);
    }
  }

  _playAt(instrument, time) {
    if (!this.buffers[instrument]) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers[instrument];
    src.connect(this.gains[instrument]);
    src.start(time);
  }

  _stepDuration() {
    return 60 / (this.bpm * this.subdivision);
  }

  _schedule() {
    const pattern = this.activePattern;
    const n = pattern.length;
    if (!n) return;

    while (this.nextStepTime < this.ctx.currentTime + this.LOOKAHEAD) {
      const step = this.currentStep % n;
      const ch = pattern[step];
      const t = this.nextStepTime;

      // Record for latency-compensated visualizer; prune entries already past
      this.stepQueue.push({ time: t, step });
      const cutoff = this.ctx.currentTime - this._stepDuration();
      while (this.stepQueue.length > 1 && this.stepQueue[0].time < cutoff) {
        this.stepQueue.shift();
      }

      if (ch === 'O') {
        this._playAt('kick', t);
      } else if (ch === 'X') {
        this._playAt('snare', t);
      } else if (ch === 'x') {
        this._playAt('aux', t);
      } else if (ch === 'o' && this.fillEmpty) {
        this._playAt('hh', t);
      }

      if (this.tambourine && step === 0) {
        this._playAt('tambourine', t);
      }

      if (this.subdivisionEnabled && step % this.subdivision === 0) {
        this._playAt('subdivision', t);
      }

      this.currentStep++;
      this.nextStepTime += this._stepDuration();

      // At loop boundary: fire callback, then swap pending changes
      if (this.currentStep % n === 0) {
        if (this.onLoopComplete) {
          this.onLoopComplete(this.activePattern, {
            bpm: this.bpm,
            subdivision: this.subdivision,
            subdivisionEnabled: this.subdivisionEnabled,
          });
        }
        if (this.pendingPattern !== null) {
          this.activePattern = this.pendingPattern;
          this.pendingPattern = null;
          this.currentStep = 0;
        }
        if (this.pendingBpm !== null) {
          this.bpm = this.pendingBpm;
          this.pendingBpm = null;
        }
        if (this.pendingSubdivisionEnabled !== null) {
          this.subdivisionEnabled = this.pendingSubdivisionEnabled;
          this.pendingSubdivisionEnabled = null;
        }
        if (this.pendingSubdivision !== null) {
          this.subdivision = this.pendingSubdivision;
          this.pendingSubdivision = null;
        }
        if (this.pendingFillEmpty !== null) {
          this.fillEmpty = this.pendingFillEmpty;
          this.pendingFillEmpty = null;
        }
        if (this.pendingTambourine !== null) {
          this.tambourine = this.pendingTambourine;
          this.pendingTambourine = null;
        }
      }
    }

    this.schedulerTimer = setTimeout(() => this._schedule(), this.SCHEDULE_INTERVAL);
  }

  play(pattern, bpm, subdivisionEnabled, subdivision, fillEmpty, tambourine = false) {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    this.activePattern = pattern;
    this.bpm = bpm;
    this.subdivisionEnabled = subdivisionEnabled;
    this.subdivision = subdivision;
    this.fillEmpty = fillEmpty;
    this.tambourine = tambourine;
    this.currentStep = 0;
    this.nextStepTime = this.ctx.currentTime + 0.05;
    this.isPlaying = true;

    this._schedule();
  }

  // Queue a seamless update — applied at next loop boundary
  update(pattern, bpm, subdivisionEnabled, subdivision, fillEmpty, tambourine = false) {
    this.pendingPattern = pattern;
    this.pendingBpm = bpm;
    this.pendingSubdivisionEnabled = subdivisionEnabled;
    this.pendingSubdivision = subdivision;
    this.pendingFillEmpty = fillEmpty;
    this.pendingTambourine = tambourine;
  }

  // Returns the step index that is audibly playing right now (ctx.currentTime-aligned).
  getAudibleStep() {
    if (!this.ctx || !this.stepQueue.length) return -1;
    const now = this.ctx.currentTime;
    let result = this.stepQueue[0].step;
    for (const entry of this.stepQueue) {
      if (entry.time <= now) result = entry.step;
      else break;
    }
    return result;
  }

  stop() {
    this.isPlaying = false;
    clearTimeout(this.schedulerTimer);
    this.schedulerTimer = null;
    this.pendingPattern = null;
    this.pendingBpm = null;
    this.pendingSubdivisionEnabled = null;
    this.pendingSubdivision = null;
    this.pendingFillEmpty = null;
    this.pendingTambourine = null;
    this.stepQueue = [];
    this.currentStep = 0;
  }
}
