// The arsenal: four guns with different roles, three grenades, one vest.
// It owns the numbers and the view model; main.js owns the ray and the
// damage. Spread grows with movement speed, so stopping to aim pays — the
// numbers below are the whole gunplay tuning in one place.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const GUN_DEFS = {
  sidearm: {
    id: 'sidearm', name: 'P9 Sidearm', price: 0, mag: 12, reserve: 36,
    gap: 0.22, reload: 1.1, damage: 40, headDamage: 110, auto: false,
    spreadStill: 0.004, spreadMoving: 0.03, kick: 0.008,
  },
  smg: {
    id: 'smg', name: 'Wasp-9 SMG', price: 1500, mag: 32, reserve: 96,
    gap: 0.07, reload: 1.6, damage: 22, headDamage: 66, auto: true,
    spreadStill: 0.006, spreadMoving: 0.034, kick: 0.006,
  },
  rifle: {
    id: 'rifle', name: 'AR-77 Ember', price: 2700, mag: 30, reserve: 90,
    gap: 0.096, reload: 1.9, damage: 34, headDamage: 102, auto: true,
    spreadStill: 0.0022, spreadMoving: 0.028, kick: 0.011,
  },
  dmr: {
    id: 'dmr', name: 'Longshot DMR', price: 3300, mag: 10, reserve: 30,
    gap: 0.55, reload: 2.4, damage: 72, headDamage: 200, auto: false,
    spreadStill: 0.0009, spreadMoving: 0.045, kick: 0.03,
  },
};

export const GRENADE_DEFS = {
  frag: { id: 'frag', name: 'Frag', price: 300, radius: 6.5, damage: 110 },
  smoke: { id: 'smoke', name: 'Smoke', price: 250, radius: 4.5, damage: 0 },
  flash: { id: 'flash', name: 'Flash', price: 200, radius: 12, damage: 0 },
};

export const VEST_PRICE = 650;
export const AMMO_PRICE = 400;

const MOVE_REFERENCE = 5.4;
const MUZZLE_TIME = 0.06;

function buildViewModel(def) {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#6b5a48'), roughness: 0.7, metalness: 0.2 });
  const metal = new THREE.MeshStandardMaterial({ color: new THREE.Color('#d8a05a'), roughness: 0.4, metalness: 0.35, emissive: new THREE.Color('#7a3b2e'), emissiveIntensity: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ember), roughness: 0.5, metalness: 0.2 });
  if (def.id === 'sidearm') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.24), metal);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.07), dark);
    grip.position.set(0, -0.08, 0.09);
    group.add(slide, grip);
  } else if (def.id === 'smg') {
    const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.34), dark);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), metal);
    barrel.position.set(0, 0.02, -0.3);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.06), accent);
    mag.position.set(0, -0.11, -0.02);
    group.add(bodyMesh, barrel, mag);
  } else if (def.id === 'rifle') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), metal);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), dark);
    barrel.position.set(0, 0.025, -0.38);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), dark);
    stock.position.set(0, -0.02, 0.3);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.06), accent);
    sight.position.set(0, 0.075, -0.05);
    group.add(receiver, barrel, stock, sight);
  } else {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.5), metal);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.55), dark);
    barrel.position.set(0, 0.02, -0.48);
    const scope = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.2), dark);
    scope.position.set(0, 0.1, -0.08);
    const bipod = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.02), accent);
    bipod.position.set(0, -0.1, -0.3);
    group.add(receiver, barrel, scope, bipod);
  }
  group.position.set(0.22, -0.16, -0.6);
  group.rotation.y = -0.38;
  group.scale.set(1.7, 1.7, 1.7);
  return group;
}

export function createArsenal(camera) {
  const models = {};
  for (const def of Object.values(GUN_DEFS)) {
    models[def.id] = buildViewModel(def);
    camera.add(models[def.id]);
  }

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ember), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.ember), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = {
    current: 'sidearm',
    owned: { sidearm: true, smg: false, rifle: false, dmr: false },
    mag: { sidearm: 12, smg: 0, rifle: 0, dmr: 0 },
    reserve: { sidearm: 36, smg: 0, rifle: 0, dmr: 0 },
    grenades: { frag: 0, smoke: 0, flash: 0 },
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
  };

  function currentDef() {
    return GUN_DEFS[state.current];
  }

  function showCurrent() {
    for (const [id, model] of Object.entries(models)) model.visible = id === state.current;
  }
  showCurrent();

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.6 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      const def = currentDef();
      model.rotation.x = -0.55 * Math.min(1, (def.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def.mag - state.mag[state.current];
        const take = Math.min(need, state.reserve[state.current]);
        state.mag[state.current] += take;
        state.reserve[state.current] -= take;
      }
    }
  }

  return {
    state,
    step,
    def(id) {
      return GUN_DEFS[id];
    },
    currentDef,
    ready() {
      return state.mag[state.current] > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = currentDef().gap;
      state.flash = MUZZLE_TIME;
      state.kick = 0.055;
    },
    takeRound() {
      if (state.mag[state.current] <= 0) return false;
      state.mag[state.current] -= 1;
      return true;
    },
    reload() {
      const def = currentDef();
      if (state.reloadLeft > 0 || state.mag[state.current] === def.mag || state.reserve[state.current] === 0) return false;
      state.reloadLeft = def.reload;
      return true;
    },
    spread(speed) {
      const def = currentDef();
      return def.spreadStill + Math.min(1, speed / MOVE_REFERENCE) * def.spreadMoving;
    },
    switchTo(id) {
      if (!state.owned[id] || state.current === id) return false;
      state.current = id;
      state.reloadLeft = 0;
      showCurrent();
      return true;
    },
    buy(id) {
      if (state.owned[id]) return 'owned';
      state.owned[id] = true;
      const def = GUN_DEFS[id];
      state.mag[id] = def.mag;
      state.reserve[id] = def.reserve;
      return 'bought';
    },
    buyGrenade(id) {
      state.grenades[id] += 1;
      return state.grenades[id];
    },
    throwGrenade(id) {
      if (state.grenades[id] <= 0) return false;
      state.grenades[id] -= 1;
      return true;
    },
    refillAmmo() {
      const def = currentDef();
      state.reserve[state.current] = def.reserve;
    },
    refillMags() {
      for (const id of Object.keys(state.mag)) {
        if (!state.owned[id]) continue;
        const def = GUN_DEFS[id];
        const need = def.mag - state.mag[id];
        const take = Math.min(need, state.reserve[id]);
        state.mag[id] += take;
        state.reserve[id] -= take;
      }
    },
  };
}
