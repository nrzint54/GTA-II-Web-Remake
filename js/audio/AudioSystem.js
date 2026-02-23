/**
 * AudioSystem (V2_0_0)
 *
 * Sons procéduraux 100% Web Audio API — zéro fichier externe.
 * Tous les sons sont synthétisés à la volée via oscillateurs,
 * buffers de bruit et enveloppes.
 *
 * Sons disponibles:
 * - gunshot(type)       : coup de feu (pistol/uzi/shotgun/flame/rocket)
 * - explosion(radius)  : explosion (petite / grande)
 * - siren()             : bip sirène police
 * - engineRev(speed)   : vrombissement moteur
 * - tireScreech()      : crissement pneus
 * - pickup()            : ramassage objet
 * - crash()             : collision
 * - phone()             : sonnerie téléphone
 * - wasted()            : son WASTED
 * - busted()            : son BUSTED
 */
export class AudioSystem {
  constructor() {
    this._ctx = null;
    this._ctxCtor = null;
    this._enabled = true;

    // WebAudio "autoplay" policy:
    // - On crée le contexte tout de suite (OK), mais on ne lance AUCUN son
    //   (même un oscillateur muet) avant un geste utilisateur.
    // - main.js appelle audio.unlock() sur le premier pointerdown/keydown.
    this._unlocked = false;

    // Engine loop (oscillateur continu)
    this._engineOsc = null;
    this._engineGain = null;
    this._engineTargetFreq = 60;

    // Siren loop
    this._sirenOsc = null;
    this._sirenGain = null;
    this._sirenActive = false;
    this._sirenT = 0;

    this._init();
  }

  _init() {
    try {
      this._ctxCtor = window.AudioContext || window.webkitAudioContext;
      if (!this._ctxCtor) throw new Error("AudioContext unsupported");
      // IMPORTANT: on NE crée PAS le contexte ici.
      // Le contexte sera créé dans unlock(), suite à un geste utilisateur.
    } catch (e) {
      console.warn("[AudioSystem] Web Audio indisponible:", e);
      this._enabled = false;
    }
  }

  /**
   * À appeler UNIQUEMENT suite à un geste utilisateur (pointerdown/keydown).
   * Débloque l'AudioContext et démarre les boucles nécessaires.
   */
  unlock() {
    if (!this._enabled) return;

    // Création lazy du contexte dans le callstack du geste utilisateur.
    if (!this._ctx) {
      if (!this._ctxCtor) return;
      try {
        this._ctx = new this._ctxCtor();
      } catch (_) {
        this._enabled = false;
        return;
      }
    }

    // Déjà en cours ?
    if (this._ctx.state === "running") {
      this._unlocked = true;
      if (!this._engineOsc) this._setupEngine();
      return;
    }

    this._ctx.resume().then(() => {
      this._unlocked = true;
      if (!this._engineOsc) this._setupEngine();
    }).catch(() => {
      // Si bloqué (pas un vrai geste), on reste silencieux.
      this._unlocked = false;
    });
  }

  _canPlay() {
    return !!(this._enabled && this._ctx && this._ctx.state === "running");
  }

  /** Crée un bruit blanc dans un AudioBuffer */
  _makeNoise(duration = 0.1) {
    const ctx = this._ctx;
    const sr = ctx.sampleRate;
    const len = Math.ceil(sr * duration);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Joue un buffer avec une enveloppe gain */
  _playBuf(buf, gain = 0.5, detune = 0, playbackRate = 1) {
    if (!this._canPlay()) return;
    const ctx = this._ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.detune.value = detune;
    src.playbackRate.value = playbackRate;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(ctx.destination);
    src.start();
  }

  /** Joue un son "bang" synthétique */
  _bang({ freq = 200, decay = 0.15, gain = 0.4, noiseAmt = 0.5 }) {
    if (!this._canPlay()) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;

    // Oscillateur tonal (corps)
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.1, now + decay);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(gain * (1 - noiseAmt), now);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + decay);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + decay + 0.01);

    // Bruit (click / impact)
    if (noiseAmt > 0) {
      const noiseBuf = this._makeNoise(decay * 0.5);
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = noiseBuf;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(gain * noiseAmt, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + decay * 0.4);
      noiseSrc.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noiseSrc.start(now);
    }
  }

  // ---- Sons de jeu ----

  gunshot(type = "pistol") {
    if (!this._canPlay()) return;
    switch (type) {
      case "pistol":
        this._bang({ freq: 280, decay: 0.12, gain: 0.45, noiseAmt: 0.6 });
        break;
      case "uzi":
        this._bang({ freq: 320, decay: 0.07, gain: 0.28, noiseAmt: 0.7 });
        break;
      case "shotgun":
        this._bang({ freq: 160, decay: 0.22, gain: 0.6, noiseAmt: 0.8 });
        // 2e pic
        setTimeout(() => this._bang({ freq: 120, decay: 0.14, gain: 0.3, noiseAmt: 0.9 }), 20);
        break;
      case "flamethrower": {
        // Crépitement de flamme
        const ctx = this._ctx;
        const now = ctx.currentTime;
        const buf = this._makeNoise(0.08);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = 0.5;
        const filt = ctx.createBiquadFilter();
        filt.type = "bandpass";
        filt.frequency.value = 800;
        filt.Q.value = 0.8;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.25, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
        src.connect(filt); filt.connect(g); g.connect(ctx.destination);
        src.start(now);
        break;
      }
      case "rocket":
        this._bang({ freq: 120, decay: 0.35, gain: 0.55, noiseAmt: 0.5 });
        break;
    }
  }

  explosion(radius = 60) {
    if (!this._canPlay()) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const scale = Math.min(1, radius / 100);
    const decay = 0.4 + scale * 0.6;
    const gain = 0.5 + scale * 0.4;

    // Basse fréquence + bruit
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(80 - scale * 40, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + decay);
    const oscG = ctx.createGain();
    oscG.gain.setValueAtTime(gain * 0.5, now);
    oscG.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    osc.connect(oscG); oscG.connect(ctx.destination);
    osc.start(now); osc.stop(now + decay + 0.05);

    // Bruit d'impact
    const nBuf = this._makeNoise(decay);
    const nSrc = ctx.createBufferSource();
    nSrc.buffer = nBuf;
    const nFilt = ctx.createBiquadFilter();
    nFilt.type = "lowpass";
    nFilt.frequency.value = 600 + scale * 400;
    const nG = ctx.createGain();
    nG.gain.setValueAtTime(gain * 0.7, now);
    nG.gain.exponentialRampToValueAtTime(0.0001, now + decay * 0.7);
    nSrc.connect(nFilt); nFilt.connect(nG); nG.connect(ctx.destination);
    nSrc.start(now);
  }

  siren() {
    // Bip simple de sirène
    if (!this._canPlay()) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(660, now + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, now);
    g.gain.setValueAtTime(0.0, now + 0.4);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.45);
  }

  /** Met à jour le moteur continu (appelé chaque frame). */
  engineUpdate(speed, inVehicle) {
    if (!this._canPlay() || !this._engineOsc) return;
    const sp = Math.abs(speed ?? 0);
    const targetFreq = inVehicle
      ? 40 + sp * 0.18
      : 0;
    this._engineTargetFreq += (targetFreq - this._engineTargetFreq) * 0.1;
    this._engineOsc.frequency.value = this._engineTargetFreq;
    this._engineGain.gain.value = inVehicle ? Math.min(0.08, sp * 0.0002) : 0;
  }

  _setupEngine() {
    if (!this._ctx) return;
    const ctx = this._ctx;
    this._engineOsc = ctx.createOscillator();
    this._engineOsc.type = "sawtooth";
    this._engineOsc.frequency.value = 60;
    this._engineGain = ctx.createGain();
    this._engineGain.gain.value = 0;

    // Filtre passe-bas (adoucit le son moteur)
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 300;

    this._engineOsc.connect(filt);
    filt.connect(this._engineGain);
    this._engineGain.connect(ctx.destination);
    // L'oscillateur ne doit être démarré qu'une fois l'audio déverrouillé.
    // (ctx.state === 'running')
    try { this._engineOsc.start(); } catch (_) {}
  }

  tireScreech() {
    if (!this._canPlay()) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const buf = this._makeNoise(0.3);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass"; filt.frequency.value = 1200; filt.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.15, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    src.connect(filt); filt.connect(g); g.connect(ctx.destination);
    src.start(now);
  }

  crash() {
    if (!this._canPlay()) return;
    this._bang({ freq: 100, decay: 0.3, gain: 0.45, noiseAmt: 0.9 });
  }

  pickup() {
    if (!this._canPlay()) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;
    // Petit ding montant
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.22);
  }

  phone() {
    if (!this._canPlay()) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;
    // Bip-bip téléphone classique
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sine"; osc.frequency.value = 1200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.12, now + i * 0.18);
      g.gain.setValueAtTime(0.0, now + i * 0.18 + 0.12);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(now + i * 0.18); osc.stop(now + i * 0.18 + 0.13);
    }
  }

  wasted() {
    if (!this._canPlay()) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;
    // Descente grave
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 1.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(now); osc.stop(now + 1.7);
  }

  busted() {
    if (!this._canPlay()) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;
    // Fanfare montante
    [330, 392, 494, 659].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "square"; osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.12, now + i * 0.12);
      g.gain.setValueAtTime(0.0, now + i * 0.12 + 0.1);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(now + i * 0.12); osc.stop(now + i * 0.12 + 0.12);
    });
  }

  money() {
    if (!this._canPlay()) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;
    [523, 659, 784].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine"; osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.1, now + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.12);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(now + i * 0.08); osc.stop(now + i * 0.08 + 0.14);
    });
  }
}
