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
  base: number;
  baseInterval: number;
  melody: readonly number[];
  bass: readonly number[];
  drums: readonly number[];
  arp: readonly number[];
}

const BIOME_MUSIC: Record<MusicBiome, BiomeMusic> = {
  jungle: {
    base: 220,
    baseInterval: 0.20,
    melody: [
      2, -1, 5, 7,  9, -1, 12, 14,  12, 9, 7, 5,  2, 0, 2, 5,
      7, -1, 9, 12, 14, 16, 14, 12, 9, 7, 9, 12, 14, -1, 12, 9,
      5, 7, 9, -1,  12, 14, 16, 17, 16, 14, 12, 9, 7, 5, 7, 9,
      12, 14, 12, 9, 7, 5, 4, 2,   0, -1, 2, 5,  2, -1, 0, -1,
    ],
    bass: [
      0, -1, 0, -1, -5, -1, -5, -1, -12, -1, -12, -1, -7, -1, -7, -1,
      0, -1, 0, -1, -5, -1, -5, -1, -3, -1, -3, -1, -7, -1, -7, -1,
      0, -1, 0, -1, -5, -1, -5, -1, -12, -1, -12, -1, -7, -1, -7, -1,
      -8, -1, -8, -1, -7, -1, -7, -1, -12, -1, -12, -1, 0, -1, 0, -1,
    ],
    drums: [
      1, 3, 3, 2, 1, 3, 2, 3, 1, 3, 3, 2, 1, 3, 2, 4,
      1, 3, 3, 2, 1, 3, 2, 3, 1, 3, 3, 2, 1, 2, 1, 2,
      1, 3, 3, 2, 1, 3, 2, 3, 1, 3, 3, 2, 1, 3, 2, 4,
      1, 1, 2, 3, 1, 3, 2, 2, 1, 3, 2, 3, 1, 2, 4, 2,
    ],
    arp: [
      0, 4, 7, 12, 7, 4, 0, 4, 7, 12, 7, 4, 0, 4, 7, 12,
      0, 5, 9, 12, 9, 5, 0, 5, 9, 12, 9, 5, 0, 5, 9, 12,
      0, 4, 7, 12, 7, 4, 0, 4, 7, 12, 7, 4, 0, 4, 7, 12,
      0, 2, 7, 11, 7, 2, 0, 2, 7, 11, 7, 2, 0, 4, 7, 12,
    ],
  },
  desert: {
    base: 174.61,
    baseInterval: 0.22,
    melody: [
      0, 1, 4, 5,   7, -1, 8, 7,   5, 4, 1, 0,   1, 4, 1, 0,
      5, 7, 8, 11,  12, -1, 13, 12, 11, 8, 7, 5,  7, 8, 7, 5,
      12, 13, 12, 11, 8, 7, 5, 4,  5, 7, 8, 7,   5, 4, 1, 0,
      4, 5, 4, 1,   0, -1, 1, 0,   -1, -3, 0, 1, 0, -1, -1, -1,
    ],
    bass: [
      -12, -1, -12, -1, -11, -1, -11, -1, -8, -1, -8, -1, -12, -1, -12, -1,
      -7, -1, -7, -1, -8, -1, -8, -1, -11, -1, -11, -1, -12, -1, -12, -1,
      -12, -1, -12, -1, -11, -1, -11, -1, -8, -1, -8, -1, -7, -1, -7, -1,
      -11, -1, -11, -1, -12, -1, -12, -1, -14, -1, -13, -1, -12, -1, -12, -1,
    ],
    drums: [
      1, 3, 3, 2, 3, 1, 3, 2, 1, 3, 3, 2, 3, 1, 2, 3,
      1, 3, 3, 2, 3, 1, 3, 2, 1, 3, 3, 2, 1, 2, 1, 2,
      1, 3, 3, 2, 3, 1, 3, 2, 1, 3, 3, 2, 3, 1, 2, 3,
      1, 3, 2, 3, 1, 3, 2, 2, 1, 1, 2, 3, 1, 2, 4, 2,
    ],
    arp: [
      0, 1, 4, 7, 4, 1, 0, 1, 4, 7, 4, 1, 0, 1, 4, 7,
      0, 3, 7, 10, 7, 3, 0, 3, 7, 10, 7, 3, 0, 3, 7, 10,
      0, 1, 4, 7, 4, 1, 0, 1, 4, 7, 4, 1, 0, 1, 4, 7,
      -1, 2, 6, 11, 6, 2, -1, 2, 6, 11, 6, 2, 0, 1, 4, 7,
    ],
  },
  tundra: {
    base: 196,
    baseInterval: 0.23,
    melody: [
      0, 3, 7, 10,  12, -1, 14, 15, 14, 12, 10, 7, 3, 0, 3, 7,
      10, 12, 14, 17, 19, -1, 17, 15, 14, 12, 10, 7, 10, 12, 14, 10,
      15, 14, 12, 10, 7, 3, 7, 10,  12, 10, 7, 3, 2, 0, 2, 3,
      7, 10, 7, 3,  2, 0, -2, -5,  -2, 0, 2, 3,  0, -1, -1, -1,
    ],
    bass: [
      -12, -1, -12, -1, -9, -1, -9, -1, -5, -1, -5, -1, -7, -1, -7, -1,
      -12, -1, -12, -1, -9, -1, -9, -1, -4, -1, -4, -1, -5, -1, -5, -1,
      -12, -1, -12, -1, -9, -1, -9, -1, -5, -1, -5, -1, -7, -1, -7, -1,
      -9, -1, -9, -1, -7, -1, -7, -1, -5, -1, -5, -1, -12, -1, -12, -1,
    ],
    drums: [
      1, -1, 3, -1, 2, -1, 3, -1, 1, -1, 3, -1, 2, -1, 3, 3,
      1, -1, 3, -1, 2, -1, 3, -1, 1, -1, 3, 3, 2, -1, 3, -1,
      1, -1, 3, -1, 2, -1, 3, -1, 1, -1, 3, -1, 2, -1, 3, 3,
      1, 3, 2, -1, 1, 3, 2, 3, 1, -1, 2, 2, 1, 3, 4, 3,
    ],
    arp: [
      0, 3, 7, 12, 7, 3, 0, 3, 7, 12, 7, 3, 0, 3, 7, 12,
      0, 5, 8, 12, 8, 5, 0, 5, 8, 12, 8, 5, 0, 5, 8, 12,
      0, 3, 7, 12, 7, 3, 0, 3, 7, 12, 7, 3, 0, 3, 7, 12,
      -2, 2, 7, 10, 7, 2, -2, 2, 7, 10, 7, 2, 0, 3, 7, 12,
    ],
  },
  city: {
    base: 164.81,
    baseInterval: 0.18,
    melody: [
      0, -1, 7, 12,  10, -1, 7, 5,  7, 10, 12, 15, 14, 12, 10, 7,
      12, -1, 15, 17, 19, -1, 17, 15, 14, 12, 10, 7, 10, 12, 14, 12,
      15, 17, 19, 22, 21, 19, 17, 15, 14, 12, 10, 7, 5, 7, 10, 12,
      10, 7, 5, 3,  5, 7, 5, 3,   2, 0, -2, -5, 0, -1, -1, -1,
    ],
    bass: [
      -12, -12, -12, -12, -9, -9, -9, -9, -5, -5, -5, -5, -7, -7, -7, -7,
      -12, -12, -12, -12, -9, -9, -9, -9, -4, -4, -4, -4, -5, -5, -5, -5,
      -12, -12, -12, -12, -9, -9, -9, -9, -5, -5, -5, -5, -7, -7, -7, -7,
      -9, -9, -9, -9, -7, -7, -7, -7, -5, -5, -5, -5, -12, -12, -12, -12,
    ],
    drums: [
      1, 3, 2, 3, 1, 3, 2, 3, 1, 3, 2, 3, 1, 3, 2, 4,
      1, 3, 2, 3, 1, 3, 2, 3, 1, 3, 2, 3, 1, 2, 1, 2,
      1, 3, 2, 3, 1, 3, 2, 3, 1, 3, 2, 3, 1, 3, 2, 4,
      1, 1, 2, 3, 1, 3, 2, 2, 1, 3, 2, 3, 1, 2, 4, 4,
    ],
    arp: [
      0, 4, 7, 12, 7, 4, 0, 4, 7, 12, 7, 4, 0, 4, 7, 12,
      0, 3, 7, 10, 7, 3, 0, 3, 7, 10, 7, 3, 0, 3, 7, 10,
      0, 4, 7, 12, 7, 4, 0, 4, 7, 12, 7, 4, 0, 4, 7, 12,
      -2, 3, 7, 10, 7, 3, -2, 3, 7, 10, 7, 3, 0, 4, 7, 12,
    ],
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
  private musicFilter: BiquadFilterNode | null = null;
  private sfxGain: GainNode | null = null;
  private sfxFilter: BiquadFilterNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private musicTimer: number | null = null;
  private musicNextTime = 0;
  private musicStep = 0;
  private musicBiome: MusicBiome = 'city';
  private musicIntensity = 0;
  private musicSpeed = 1;
  private musicPlaying = false;
  private musicPaused = false;
  /** Reusable melody/bass/arp voices — see acquireTone(). */
  private musicTonePool: PooledTone[] = [];
  private musicVolume = Sfx.MUSIC_VOL;
  private sfxVolume = 1;
  muted = false;
  musicMuted = false;
  sfxMuted = false;
  private muffled = false;
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
      const musicFilter = ctx.createBiquadFilter();
      musicFilter.type = 'lowpass';
      musicFilter.frequency.value = this.muffled ? 350 : 2800;
      musicGain.connect(musicFilter);
      musicFilter.connect(master);

      // Lowpass on the SFX chain — `setMuffled` drops it for menus
      const sfxFilter = ctx.createBiquadFilter();
      sfxFilter.type = 'lowpass';
      sfxFilter.frequency.value = this.muffled ? 600 : 7500;
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
      this.musicFilter = musicFilter;
      this.sfxGain = sfxGain;
      this.sfxFilter = sfxFilter;
      this.noiseBuf = buf;

      this.applyVolumes();
      this.setMuffled(this.muffled);
    } catch {
      this.ctx = null;
      this.master = null;
      this.musicGain = null;
      this.musicFilter = null;
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
    for (const n of this.musicTonePool) {
      try {
        n.osc.stop();
        n.osc.disconnect();
        n.gain.disconnect();
      } catch {}
    }
    this.musicTonePool = [];
    const ctx = this.ctx;
    if (ctx && ctx.state !== 'closed' && ctx.state === 'running') void ctx.suspend().catch(() => undefined);
  }

  /** Drops the audio lowpass filter so menu sounds sound muffled. */
  setMuffled(m: boolean) {
    this.muffled = m;
    if (!this.ctx) return;
    const sfxFreq = m ? 600 : 7500;
    const musicFreq = m ? 350 : 2800;
    if (this.sfxFilter) this.sfxFilter.frequency.setTargetAtTime(sfxFreq, this.ctx.currentTime, 0.04);
    if (this.musicFilter) this.musicFilter.frequency.setTargetAtTime(musicFreq, this.ctx.currentTime, 0.04);
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
    this.musicSpeed = 1;
    this.musicPlaying = true;
    this.musicPaused = false;
    this.musicStep = 0;
    this.musicNextTime = ctx.currentTime + 0.05;
    this.musicGain.gain.cancelScheduledValues(ctx.currentTime);
    for (const n of this.musicTonePool) {
      try {
        n.gain.gain.cancelScheduledValues(ctx.currentTime);
        n.gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        n.freeAt = ctx.currentTime;
      } catch {}
    }
    this.applyMusicGain();
    this.ensureMusicTimer();
    this.scheduleMusic();
  }

  setMusic(biome: MusicBiome, intensity: number, speedRatio = 1) {
    if (!this.musicPlaying) return;
    if (biome !== this.musicBiome) {
      this.musicBiome = biome;
      this.musicStep = 0;
      const ctx = this.ctx;
      if (ctx && ctx.state !== 'closed') {
        const now = ctx.currentTime;
        this.musicNextTime = now + 0.05;
        for (const n of this.musicTonePool) {
          try {
            n.gain.gain.cancelScheduledValues(now);
            n.gain.gain.setValueAtTime(0.0001, now);
            n.freeAt = now;
          } catch {}
        }
      }
    }
    this.musicIntensity = Math.max(0, Math.min(1, intensity));
    // Gentle linear pacing matching player stride without racing ahead
    const tempo = 1 + (speedRatio - 1) * 0.28;
    this.musicSpeed = Math.max(0.9, Math.min(1.35, tempo));
  }

  pauseMusic() {
    if (!this.musicPlaying || this.musicPaused) return;
    this.musicPaused = true;
    this.clearMusicTimer();
    const ctx = this.ctx;
    if (ctx && this.musicGain && ctx.state !== 'closed') {
      try {
        this.musicGain.gain.cancelScheduledValues(ctx.currentTime);
        this.musicGain.gain.setValueAtTime(0, ctx.currentTime);
      } catch {}
    }
    for (const n of this.musicTonePool) {
      try {
        n.gain.gain.cancelScheduledValues(0);
        n.gain.gain.setValueAtTime(0, 0);
        n.freeAt = 0;
      } catch {}
    }
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
    if (ctx && this.musicGain && ctx.state !== 'closed') {
      try {
        this.musicGain.gain.cancelScheduledValues(ctx.currentTime);
        this.musicGain.gain.setValueAtTime(0, ctx.currentTime);
      } catch {}
    }
    for (const n of this.musicTonePool) {
      try {
        n.gain.gain.cancelScheduledValues(0);
        n.gain.gain.setValueAtTime(0, 0);
        n.freeAt = 0;
      } catch {}
    }
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
    gain.gain.value = 0.0001;
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
    const t = Math.max(ctx.currentTime + 0.005, ctx.currentTime + delay);
    const n = this.acquireTone(t);
    if (!n) return;
    try {
      n.osc.type = type;
      n.osc.frequency.cancelScheduledValues(t);
      n.osc.frequency.setValueAtTime(f0, t);
      if (f0 !== f1) {
        n.osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      }
      n.gain.gain.cancelScheduledValues(t);
      n.gain.gain.setValueAtTime(0.0001, t);
      n.gain.gain.linearRampToValueAtTime(vol, t + 0.01);
      n.gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n.freeAt = t + dur + 0.03;
      this.musicTonePool.push(n);
    } catch {}
  }

  private musicDrum(type: 'kick' | 'snare' | 'hihat', delay: number) {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed' || !this.musicGain || this.muted || this.musicMuted) return;
    const t = Math.max(ctx.currentTime + 0.005, ctx.currentTime + delay);

    if (type === 'kick') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
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
      gain.gain.value = 0.0001;
      gain.gain.setValueAtTime(0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      src.connect(filt);
      filt.connect(gain);
      gain.connect(this.musicGain);
      src.start(t);
      src.stop(t + 0.12);
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      oscGain.gain.value = 0.0001;
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
      gain.gain.value = 0.0001;
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
    const base = pattern.base;
    const interval = pattern.baseInterval / this.musicSpeed;
    const noteVol = 0.07 + this.musicIntensity * 0.02;
    const len = pattern.melody.length;
    while (this.musicNextTime < now + 0.24) {
      const step = this.musicStep++ % len;
      const delay = Math.max(0, this.musicNextTime - now);

      // melody — warm triangle / square lead
      const melodyNote = pattern.melody[step];
      if (melodyNote !== -1) {
        const freq = base * Math.pow(2, melodyNote / 12);
        this.musicTone('triangle', freq, freq, interval * 0.82, noteVol * 1.2, delay);
      }

      // bass — triangle, lower octave
      const bassNote = pattern.bass[step];
      if (bassNote !== -1) {
        const freq = base * Math.pow(2, bassNote / 12);
        this.musicTone('triangle', freq, freq, interval * 1.4, 0.10, delay);
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

      // arpeggio — quiet melodic tone
      const arpNote = pattern.arp[step];
      if (arpNote !== -1) {
        const freq = base * Math.pow(2, arpNote / 12);
        this.musicTone('triangle', freq, freq, interval * 0.35, noteVol * 0.5, delay);
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
    const t = Math.max(ctx.currentTime + 0.002, ctx.currentTime + delay);
    try {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      osc.type = type;
      osc.frequency.setValueAtTime(f0, t);
      if (f0 !== f1) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      }
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g);
      g.connect(this.sfxFilter);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch {}
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
    g.gain.value = 0.0001;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.sfxFilter);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  play(name: SfxName, param = 0) {
    this.init();
    if (!this.ctx || this.ctx.state === 'closed' || this.muted || this.sfxMuted) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    switch (name) {
      case 'jump':
        this.tone('square', 320, 640, 0.11, 0.18);
        break;
      case 'djump':
        this.tone('square', 480, 880, 0.11, 0.16);
        this.noise(0.06, 0.06, 2000);
        break;
      case 'coin':
        this.tone('triangle', 880, 880, 0.045, 0.14);
        this.tone('sine', 1320, 1320, 0.07, 0.12, 0.035);
        break;
      case 'gem':
        this.tone('triangle', 700, 700, 0.07, 0.18);
        this.tone('triangle', 1050, 1050, 0.07, 0.18, 0.06);
        this.tone('triangle', 1400, 1400, 0.14, 0.18, 0.12);
        break;
      case 'stomp':
        this.tone('square', 380, 90, 0.12, 0.22);
        this.noise(0.1, 0.18, 800);
        break;
      case 'slam':
        this.tone('sawtooth', 200, 50, 0.22, 0.24);
        this.noise(0.22, 0.22, 500);
        break;
      case 'spring':
        this.tone('sine', 220, 620, 0.18, 0.22);
        this.tone('triangle', 440, 880, 0.14, 0.12, 0.03);
        break;
      case 'death':
        this.tone('sawtooth', 440, 60, 0.45, 0.26);
        this.tone('square', 280, 40, 0.5, 0.14, 0.04);
        this.noise(0.35, 0.18, 600);
        break;
      case 'combo': {
        const note = Math.min(16, param);
        const f = 330 * Math.pow(1.0595, [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24][note % 11] ?? 0);
        this.tone('triangle', f, f, 0.08, 0.08);
        break;
      }
      case 'ui':
        this.tone('triangle', 360, 480, 0.03, 0.05);
        break;
      case 'start':
        this.tone('triangle', 330, 330, 0.06, 0.1);
        this.tone('triangle', 440, 440, 0.06, 0.1, 0.06);
        this.tone('triangle', 660, 660, 0.12, 0.12, 0.12);
        break;
      case 'event':
        this.tone('triangle', 360 + param * 30, 540 + param * 40, 0.15, 0.14);
        this.tone('sine', 540 + param * 40, 720 + param * 50, 0.18, 0.1, 0.05);
        break;
      case 'powerup': {
        const f = 440 + param * 55;
        this.tone('triangle', f, f * 1.25, 0.12, 0.15);
        this.tone('triangle', f * 1.5, f * 1.75, 0.14, 0.12, 0.05);
        this.tone('sine', f * 2, f * 2, 0.18, 0.09, 0.1);
        break;
      }
      case 'shield':
        this.tone('sawtooth', 620, 180, 0.2, 0.14);
        this.tone('triangle', 840, 420, 0.22, 0.12, 0.04);
        break;
    }
  }
}

export const sfx = new Sfx();

export const setMusicVolume = (v: number) => sfx.setMusicVolume(v);
export const setSfxVolume = (v: number) => sfx.setSfxVolume(v);
export const unlock = () => sfx.unlock();
export const dispose = () => sfx.dispose();
