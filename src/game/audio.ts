// This file is part of pixel-run.
// Copyright (C) 2026
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, version 3 of the License.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

type MusicBiome = 'jungle' | 'desert' | 'tundra' | 'city';
type SfxName =
  | 'jump'
  | 'djump'
  | 'coin'
  | 'gem'
  | 'stomp'
  | 'slam'
  | 'spring'
  | 'death'
  | 'combo'
  | 'ui'
  | 'start'
  | 'event'
  | 'powerup'
  | 'shield';

interface BiomeMusic {
  melody: readonly number[];
  bass: readonly number[];
  drums: readonly number[];
  arp: readonly number[];
}

const BIOME_MUSIC: Record<MusicBiome, BiomeMusic> = {
  jungle: {
    melody: [2, 5, 9, 12, 14, 12, 9, 5, 2, 0, 2, 5, 7, 5, 3, 5],
    bass: [0, -1, -5, -1, -12, -1, -7, -1, 0, -1, -5, -1, -12, -1, -7, -1],
    drums: [1, -1, 3, -1, 1, -1, 3, 2, 1, -1, 3, -1, 1, -1, 3, 2],
    arp: [0, 4, 7, 12, 7, 4, 0, 4, 7, 12, 7, 4, 0, 4, 7, 12],
  },
  desert: {
    melody: [0, 3, 7, 10, 12, 10, 7, 3, 0, 5, 7, 10, 12, 10, 7, 5],
    bass: [-12, -1, -1, -1, -7, -1, -1, -1, -14, -1, -1, -1, -12, -1, -1, -1],
    drums: [1, -1, -1, 2, -1, -1, 1, 3, 1, -1, -1, 2, -1, -1, 1, 3],
    arp: [0, 3, 7, 10, 7, 3, 0, 3, 7, 10, 7, 3, 0, 3, 7, 10],
  },
  tundra: {
    melody: [0, 4, 7, 12, 14, 12, 7, 4, 0, 3, 7, 10, 12, 10, 7, 3],
    bass: [-12, -1, -1, -1, -12, -1, -1, -1, -7, -1, -1, -1, -5, -1, -1, -1],
    drums: [1, -1, -1, -1, 1, -1, -1, -1, 1, -1, -1, 2, 1, -1, -1, -1],
    arp: [0, 4, 7, 12, 7, 4, 0, 4, 7, 12, 7, 4, 0, 4, 7, 12],
  },
  city: {
    melody: [0, 4, 7, 12, 10, 7, 4, 0, 2, 5, 9, 12, 10, 7, 5, 2],
    bass: [-12, -1, -12, -1, -9, -1, -9, -1, -5, -1, -5, -1, -7, -1, -7, -1],
    drums: [1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3],
    arp: [0, 4, 7, 12, 7, 4, 0, 4, 7, 12, 7, 4, 0, 4, 7, 12],
  },
};

interface PooledTone {
  osc: OscillatorNode;
  gain: GainNode;
  /** Audio time at which the note's gain envelope has fully closed. */
  freeAt: number;
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private sfxFilter: BiquadFilterNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private musicTimer: number | null = null;
  private musicNextTime = 0;
  private musicStep = 0;
  private musicBiome: MusicBiome = 'city';
  private musicIntensity = 0;
  private musicPlaying = false;
  private musicPaused = false;
  /** Reusable melody/bass/arp voices — see acquireTone(). */
  private musicTonePool: PooledTone[] = [];
  private musicVolume = Sfx.MUSIC_VOL;
  private sfxVolume = 1;
  muted = false;
  musicMuted = false;
  sfxMuted = false;
  private static readonly MASTER_VOL = 0.5;
  private static readonly MUSIC_VOL = 0.45;

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
      return;
    }
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = Sfx.MASTER_VOL;
      // Gentle limiter so stacked kick/combo/coin transients don't clip.
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -12;
      compressor.knee.value = 20;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.2;
      master.connect(compressor);
      compressor.connect(ctx.destination);
      const musicGain = ctx.createGain();
      musicGain.gain.value = Sfx.MUSIC_VOL;
      musicGain.connect(master);
      // Lowpass on the SFX chain — `setMuffled` drops it for the main menu so
      // UI blips sound like they come from another room.
      const sfxFilter = ctx.createBiquadFilter();
      sfxFilter.type = 'lowpass';
      sfxFilter.frequency.value = 22000;
      const sfxGain = ctx.createGain();
      sfxGain.gain.value = 1;
      sfxFilter.connect(sfxGain);
      sfxGain.connect(master);

      const len = Math.floor(ctx.sampleRate * 0.4);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      this.ctx = ctx;
      this.master = master;
      this.musicGain = musicGain;
      this.sfxGain = sfxGain;
      this.sfxFilter = sfxFilter;
      this.noiseBuf = buf;
    } catch {
      this.ctx = null;
      this.master = null;
      this.musicGain = null;
      this.sfxGain = null;
      this.sfxFilter = null;
      this.noiseBuf = null;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applyVolumes();
    if (!m && this.musicPlaying) this.scheduleMusic();
  }

  setMusicMuted(m: boolean) {
    this.musicMuted = m;
    this.applyMusicGain();
    if (!m && this.musicPlaying) this.scheduleMusic();
  }

  setSfxMuted(m: boolean) {
    this.sfxMuted = m;
    this.applySfxGain();
  }

  /** 0..1 music level. Ramps the gain so no zipper noise. */
  setMusicVolume(v: number) {
    this.musicVolume = Math.max(0, Math.min(1, v));
    this.applyMusicGain();
  }

  /** 0..1 sfx level. Ramps the gain so no zipper noise. */
  setSfxVolume(v: number) {
    this.sfxVolume = Math.max(0, Math.min(1, v));
    this.applySfxGain();
  }

  /** Resumes the AudioContext on a user gesture and restarts the music chain if a track is pending. */
  unlock() {
    this.init();
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed') return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    if (!this.musicPlaying) return;
    this.musicPaused = false;
    if (this.musicNextTime < ctx.currentTime - 0.3) this.musicNextTime = ctx.currentTime + 0.05;
    this.applyMusicGain();
    this.ensureMusicTimer();
    this.scheduleMusic();
  }

  /** Stops timers and suspends the context. Idempotent; the context stays reusable via init()/unlock(). */
  dispose() {
    this.musicPlaying = false;
    this.musicPaused = false;
    this.clearMusicTimer();
    this.musicTonePool = [];
    const ctx = this.ctx;
    if (ctx && ctx.state !== 'closed' && ctx.state === 'running') void ctx.suspend().catch(() => undefined);
  }

  /** Drops the SFX lowpass so menu sounds sound muffled (from another room). */
  setMuffled(m: boolean) {
    if (!this.sfxFilter || !this.ctx) return;
    this.sfxFilter.frequency.setTargetAtTime(m ? 520 : 22000, this.ctx.currentTime, 0.04);
  }

  private applyVolumes() {
    this.applyMusicGain();
    this.applySfxGain();
  }

  private applyMusicGain() {
    if (!this.musicGain || !this.ctx || this.ctx.state === 'closed') return;
    const vol = this.muted || this.musicMuted ? 0 : this.musicVolume;
    this.musicGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.02);
  }

  private applySfxGain() {
    if (!this.sfxGain || !this.ctx || this.ctx.state === 'closed') return;
    const vol = this.muted || this.sfxMuted ? 0 : this.sfxVolume;
    this.sfxGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.02);
  }

  startMusic(biome: MusicBiome, intensity = 0) {
    this.init();
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed' || !this.musicGain) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    this.musicBiome = biome;
    this.musicIntensity = Math.max(0, Math.min(1, intensity));
    this.musicPlaying = true;
    this.musicPaused = false;
    this.musicStep = 0;
    this.musicNextTime = ctx.currentTime + 0.05;
    this.musicGain.gain.cancelScheduledValues(ctx.currentTime);
    this.applyMusicGain();
    this.ensureMusicTimer();
    this.scheduleMusic();
  }

  setMusic(biome: MusicBiome, intensity: number) {
    if (!this.musicPlaying) return;
    if (biome !== this.musicBiome) {
      this.musicBiome = biome;
      this.musicStep = 0;
    }
    this.musicIntensity = Math.max(0, Math.min(1, intensity));
  }

  pauseMusic() {
    if (!this.musicPlaying || this.musicPaused) return;
    this.musicPaused = true;
    this.clearMusicTimer();
    const ctx = this.ctx;
    if (ctx && this.musicGain) this.musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
  }

  resumeMusic() {
    if (!this.musicPlaying || !this.musicPaused) return;
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed' || !this.musicGain) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    this.musicPaused = false;
    this.musicNextTime = ctx.currentTime + 0.05;
    this.applyMusicGain();
    this.ensureMusicTimer();
    this.scheduleMusic();
  }

  stopMusic() {
    this.musicPlaying = false;
    this.musicPaused = false;
    this.clearMusicTimer();
    const ctx = this.ctx;
    if (ctx && this.musicGain && ctx.state !== 'closed')
      this.musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
  }

  private ensureMusicTimer() {
    if (this.musicTimer === null) this.musicTimer = window.setInterval(() => this.scheduleMusic(), 80);
  }

  private clearMusicTimer() {
    if (this.musicTimer === null) return;
    window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  /**
   * Returns a voice whose previous note has fully closed, or creates one.
   * The oscillator runs forever (never stopped); the gain envelope gates each
   * note to silence and `freeAt` guards against reuse while a note is still
   * sounding — this keeps the ~6 nodes per 16th note from being reallocated.
   */
  private acquireTone(needAt: number): PooledTone | null {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return null;
    for (let i = this.musicTonePool.length - 1; i >= 0; i--) {
      const n = this.musicTonePool[i];
      if (n.freeAt <= needAt - 0.03) {
        this.musicTonePool.splice(i, 1);
        return n;
      }
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(0);
    return { osc, gain, freeAt: 0 };
  }

  private musicTone(
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    vol: number,
    delay: number,
  ) {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed' || this.muted || this.musicMuted) return;
    const t = ctx.currentTime + delay;
    const n = this.acquireTone(t);
    if (!n) return;
    n.osc.type = type;
    n.osc.frequency.setValueAtTime(f0, t);
    n.osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    n.gain.gain.setValueAtTime(0.0001, t);
    n.gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    n.gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.freeAt = t + dur + 0.03;
    this.musicTonePool.push(n);
  }

  private musicDrum(type: 'kick' | 'snare' | 'hihat', delay: number) {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed' || !this.musicGain || this.muted || this.musicMuted) return;
    const t = ctx.currentTime + delay;

    if (type === 'kick') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
      gain.gain.setValueAtTime(0.7, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(t);
      osc.stop(t + 0.12);
    } else if (type === 'snare') {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const filt = ctx.createBiquadFilter();
      filt.type = 'highpass';
      filt.frequency.value = 1000;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      src.connect(filt);
      filt.connect(gain);
      gain.connect(this.musicGain);
      src.start(t);
      src.stop(t + 0.12);
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(200, t);
      osc.frequency.exponentialRampToValueAtTime(100, t + 0.05);
      oscGain.gain.setValueAtTime(0.35, t);
      oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      osc.connect(oscGain);
      oscGain.connect(this.musicGain);
      osc.start(t);
      osc.stop(t + 0.07);
    } else if (type === 'hihat') {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const filt = ctx.createBiquadFilter();
      filt.type = 'highpass';
      filt.frequency.value = 5000;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      src.connect(filt);
      filt.connect(gain);
      gain.connect(this.musicGain);
      src.start(t);
      src.stop(t + 0.07);
    }
  }

  private scheduleMusic() {
    const ctx = this.ctx;
    if (!this.musicPlaying || this.musicPaused || !ctx || ctx.state === 'closed' || this.muted || this.musicMuted)
      return;
    const now = ctx.currentTime;
    if (this.musicNextTime < now - 0.3) this.musicNextTime = now + 0.02;
    const pattern = BIOME_MUSIC[this.musicBiome];
    const base = 196;
    const interval = 0.24 - this.musicIntensity * 0.04;
    const noteVol = 0.12 + this.musicIntensity * 0.04;
    while (this.musicNextTime < now + 0.24) {
      const step = this.musicStep++ % 16;
      const delay = Math.max(0, this.musicNextTime - now);

      // melody — square lead
      const melodyNote = pattern.melody[step];
      if (melodyNote !== -1) {
        const freq = base * Math.pow(2, melodyNote / 12);
        this.musicTone('square', freq, freq * 1.01, interval * 0.78, noteVol, delay);
      }

      // bass — triangle, lower octave
      const bassNote = pattern.bass[step];
      if (bassNote !== -1) {
        const freq = base * Math.pow(2, bassNote / 12);
        this.musicTone('triangle', freq, freq, interval * 1.5, 0.1, delay);
      }

      // drums — kick/snare/hihat
      const drum = pattern.drums[step];
      if (drum === 1) this.musicDrum('kick', delay);
      else if (drum === 2) this.musicDrum('snare', delay);
      else if (drum === 3) this.musicDrum('hihat', delay);
      else if (drum === 4) {
        this.musicDrum('kick', delay);
        this.musicDrum('hihat', delay);
      }

      // arpeggio — fast square, quiet
      const arpNote = pattern.arp[step];
      if (arpNote !== -1) {
        const freq = base * Math.pow(2, arpNote / 12);
        this.musicTone('square', freq, freq, interval * 0.3, noteVol * 0.7, delay);
      }

      this.musicNextTime += interval;
    }
  }

  private tone(
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    vol = 0.3,
    delay = 0,
  ) {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed' || !this.master || !this.sfxFilter || this.muted) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.sfxFilter);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol = 0.25, freq = 1200, delay = 0) {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed' || !this.master || !this.sfxFilter || !this.noiseBuf || this.muted) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(freq, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.25), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.sfxFilter);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  play(name: SfxName, param = 0) {
    if (!this.ctx || this.ctx.state === 'closed' || this.muted || this.sfxMuted) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    switch (name) {
      case 'jump':
        this.tone('square', 340, 700, 0.11, 0.22);
        break;
      case 'djump':
        this.tone('square', 560, 1020, 0.12, 0.2);
        this.noise(0.08, 0.08, 2400);
        break;
      case 'coin':
        this.tone('square', 980, 980, 0.05, 0.16);
        this.tone('square', 1460, 1460, 0.09, 0.14, 0.045);
        break;
      case 'gem':
        this.tone('triangle', 700, 700, 0.07, 0.2);
        this.tone('triangle', 1050, 1050, 0.07, 0.2, 0.06);
        this.tone('triangle', 1400, 1400, 0.16, 0.2, 0.12);
        break;
      case 'stomp':
        this.tone('square', 420, 90, 0.14, 0.26);
        this.noise(0.12, 0.2, 900);
        break;
      case 'slam':
        this.tone('sawtooth', 220, 50, 0.24, 0.28);
        this.noise(0.26, 0.26, 600);
        break;
      case 'spring':
        this.tone('sine', 260, 1300, 0.22, 0.26);
        break;
      case 'death':
        this.tone('sawtooth', 480, 60, 0.5, 0.3);
        this.tone('square', 320, 40, 0.55, 0.16, 0.04);
        this.noise(0.4, 0.22, 700);
        break;
      case 'combo': {
        const f = 620 * Math.pow(1.0595, Math.min(24, param * 2));
        this.tone('square', f, f * 1.5, 0.1, 0.18);
        break;
      }
      case 'ui':
        this.tone('square', 700, 900, 0.05, 0.14);
        break;
      case 'start':
        this.tone('square', 520, 520, 0.07, 0.2);
        this.tone('square', 780, 780, 0.07, 0.2, 0.08);
        this.tone('square', 1040, 1040, 0.18, 0.22, 0.16);
        break;
      case 'event':
        this.tone('triangle', 420 + param * 35, 680 + param * 55, 0.16, 0.12);
        this.tone('square', 840 + param * 50, 560 + param * 30, 0.2, 0.08, 0.08);
        break;
      case 'powerup': {
        const f = 540 + param * 90;
        this.tone('triangle', f, f * 1.6, 0.14, 0.18);
        this.tone('square', f * 1.5, f * 2.2, 0.18, 0.14, 0.08);
        this.tone('sine', f * 2, f * 2, 0.22, 0.1, 0.16);
        break;
      }
      case 'shield':
        this.tone('sawtooth', 760, 180, 0.22, 0.16);
        this.tone('triangle', 980, 420, 0.26, 0.14, 0.04);
        break;
    }
  }
}

export const sfx = new Sfx();

export const setMusicVolume = (v: number) => sfx.setMusicVolume(v);
export const setSfxVolume = (v: number) => sfx.setSfxVolume(v);
export const unlock = () => sfx.unlock();
export const dispose = () => sfx.dispose();
