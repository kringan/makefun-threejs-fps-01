// Sound, synthesised with WebAudio: no audio files, no network.
// One lazily created context (a browser needs a user gesture first), one
// shared noise buffer, and a small helper per sound so the game can call
// sfx.shot('rifle') without knowing how a shot is made. Footsteps are
// short filtered thuds, quieter for bots the further away they are.
export function createSfx() {
  let context = null;
  let noise = null;
  let master = null;

  function ensure() {
    if (context) return context;
    try {
      const Ctor = window.AudioContext ?? window.webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = 0.32;
      master.connect(context.destination);
      const length = context.sampleRate;
      noise = context.createBuffer(1, length, context.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      context = null;
    }
    return context;
  }

  function unlock() {
    const ctx = ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function burst(duration, filterFreq, gainValue, type = 'lowpass') {
    const ctx = ensure();
    if (!ctx || !noise) return;
    const source = ctx.createBufferSource();
    source.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start();
    source.stop(ctx.currentTime + duration);
  }

  function tone(freq, duration, gainValue, type = 'sine', slideTo = 0) {
    const ctx = ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  return {
    unlock,
    shot(kind) {
      if (kind === 'smg') burst(0.09, 1600, 0.5);
      else if (kind === 'sidearm') burst(0.12, 1100, 0.55);
      else if (kind === 'dmr') { burst(0.22, 700, 0.8); tone(120, 0.14, 0.35, 'square', 45); }
      else burst(0.14, 900, 0.7);
      tone(160, 0.08, 0.25, 'square', 60);
    },
    enemyShot(distance) {
      const volume = Math.max(0.06, 0.32 - distance * 0.008);
      burst(0.12, 700, volume);
    },
    reload() {
      tone(700, 0.05, 0.2, 'square');
      setTimeout(() => tone(500, 0.05, 0.2, 'square'), 140);
    },
    dryClick() {
      tone(1200, 0.04, 0.15, 'square');
    },
    hit() {
      tone(2400, 0.05, 0.25, 'sine');
    },
    kill() {
      tone(880, 0.09, 0.3, 'sine');
      setTimeout(() => tone(1320, 0.12, 0.3, 'sine'), 90);
    },
    hurt() {
      tone(140, 0.18, 0.4, 'sawtooth', 70);
    },
    step(distance) {
      const volume = Math.max(0.03, 0.16 - distance * 0.005);
      burst(0.05, 300, volume);
    },
    grenadeThrow() {
      burst(0.08, 2000, 0.2, 'highpass');
    },
    grenadeBounce() {
      tone(300, 0.06, 0.25, 'sine', 180);
    },
    beep() {
      tone(1250, 0.12, 0.35, 'sine');
    },
    plant() {
      tone(660, 0.1, 0.3, 'sine');
      setTimeout(() => tone(990, 0.14, 0.3, 'sine'), 120);
    },
    explosion() {
      burst(1.1, 320, 1.0);
      tone(70, 0.9, 0.7, 'sine', 32);
    },
    buy() {
      tone(980, 0.06, 0.25, 'sine');
      setTimeout(() => tone(1470, 0.08, 0.25, 'sine'), 70);
    },
    denied() {
      tone(220, 0.12, 0.3, 'square', 160);
    },
    win() {
      [523, 659, 784].forEach((freq, i) => setTimeout(() => tone(freq, 0.22, 0.3, 'sine'), i * 130));
    },
    lose() {
      [392, 330, 262].forEach((freq, i) => setTimeout(() => tone(freq, 0.25, 0.3, 'sine'), i * 150));
    },
  };
}
