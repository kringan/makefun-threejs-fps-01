// Ember Line — boot and the one loop: a fixed 60 Hz simulation feeding a
// render at the display's rate.
// ?shot=start|play|buy|plant with &seed=N sets up a deterministic frame for
// a capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32, clamp } from './rng.js';
import { createArena, SPAWNS, SITES } from './arena.js';
import { createBody, applyDamage } from './mover.js';
import { createArsenal, GUN_DEFS, GRENADE_DEFS, VEST_PRICE, AMMO_PRICE } from './arsenal.js';
import { createSquad } from './squad.js';
import { createCharge } from './charge.js';
import { createMatch } from './match.js';
import { createSfx } from './sfx.js';
import { createOverlay } from './overlay.js';
import { createControls } from './controls.js';

const FIXED_STEP = 1 / 60;
const HEAR_RANGE = 26;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(shot ? 1 : (Date.now() % 2147483647));

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 22, 58);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const arena = createArena(scene);
const sfx = createSfx();
const overlay = createOverlay();
const player = createBody(arena.colliders, SPAWNS.embers[0]);
const playerBody = player.state;
const arsenal = createArsenal(camera);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();

// The player's own hitboxes, so bot shots can hit the player: invisible
// boxes that follow the player, never rendered (colorWrite off).
const ghostMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
ghostMat.colorWrite = false;
const playerTorso = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.9, 0.4), ghostMat);
const playerHead = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.36, 0.4), ghostMat);
scene.add(playerTorso, playerHead);

const playerFighter = {
  name: 'You',
  side: 'embers',
  body: playerBody,
  isPlayer: true,
  get alive() {
    return playerBody.alive;
  },
  get position() {
    return playerBody.position;
  },
};
playerTorso.userData.fighter = playerFighter;
playerTorso.userData.part = 'body';
playerHead.userData.fighter = playerFighter;
playerHead.userData.part = 'head';

function fighterViews() {
  const views = [playerFighter];
  for (const bot of squad.bots) {
    const b = bot;
    views.push({
      name: b.name,
      side: b.side,
      body: b.body,
      isPlayer: false,
      get alive() {
        return b.body.alive;
      },
      get position() {
        return b.body.position;
      },
    });
  }
  return views;
}

// Fighter views are built once per round and reused: the hot loop must
// not allocate a fresh view object for every bot, every fixed step.
let fighterCache = null;
function getFighters() {
  if (!fighterCache) fighterCache = fighterViews();
  return fighterCache;
}

let defusingThisStep = false;
let chargeSiteName = null;

const squad = createSquad(scene, arena.colliders, arena.shootables, random, {
  hitTargets() {
    return arena.shootables.concat(squad.hitMeshes(), playerTorso, playerHead);
  },
  onBotShot(bot, origin, dir) {
    const distance = origin.distanceTo(playerBody.position);
    sfx.enemyShot(distance);
    spawnTracer(origin, dir, 40);
    squad.hearNoise(bot.body.position.x, bot.body.position.z, 6);
  },
  onDamage(victim, attacker, isHead, lost, damage) {
    const victimName = victim.name ?? 'You';
    if (victim === playerFighter) {
      overlay.damageFlash();
      sfx.hurt();
    }
    if (!victim.body.alive) {
      overlay.feed(attacker.name, victimName, isHead);
      if (attacker === playerFighter || attacker.side === 'embers') {
        // Only the player's own kills pay: allies' kills feed the team.
        if (attacker === playerFighter) match.addKill();
      }
      if (victim === playerFighter) {
        overlay.banner('You are down', 'Ash and Coal fight on.', 3000);
      }
      if (attacker === playerFighter) sfx.kill();
    } else if (attacker === playerFighter) {
      sfx.hit();
    }
  },
  onStep(bot) {
    const distance = Math.hypot(bot.body.position.x - playerBody.position.x, bot.body.position.z - playerBody.position.z);
    sfx.step(distance);
  },
  onDefuseChannel(bot, dt) {
    defusingThisStep = true;
  },
});
squad.spawnAll(SPAWNS);

const charge = createCharge({
  onPlanted(site) {
    sfx.plant();
    overlay.banner(`Charge planted at site ${site}`, 'Defend it for 35 seconds.', 3000);
  },
  onBeep() {
    sfx.beep();
  },
  onDefused() {
    sfx.denied();
    match.endRound(false, 'The Ashguard defused the charge.');
  },
  onExploded(site) {
    sfx.explosion();
    match.endRound(true, `The charge detonated at site ${site}.`);
  },
});

const match = createMatch({
  onRoundLive() {
    overlay.hideBuy();
    overlay.banner(`Round ${match.state.round} — live`, 'Plant the charge or eliminate the Ashguard.');
  },
  onRoundStart(round) {
    resetRound(round);
    overlay.banner(`Round ${round}`, 'Buy phase — press B to open the shop.', 2600);
  },
  onRoundOver(won, reason) {
    overlay.banner(won ? 'Round won' : 'Round lost', reason, 4000);
    if (won) sfx.win();
    else sfx.lose();
  },
  onMatchOver(winner) {
    overlay.showOverlay('match', match.state.embers, winner);
    if (document.pointerLockElement) document.exitPointerLock();
  },
});

// Grenades in flight and smoke clouds on the ground.
const grenades = [];
const smokeClouds = [];
const tracers = [];

function makeGrenadeMesh(kind) {
  if (kind === 'smoke') {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(GRENADE_DEFS.smoke.radius, 20, 14),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#b8b0a4'), transparent: true, opacity: 0.5, depthWrite: false }),
    );
    return mesh;
  }
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.dark), roughness: 0.5, metalness: 0.5 }),
  );
  return mesh;
}

function spawnTracer(origin, dir, length) {
  let line = tracers.find((t) => t.life <= 0);
  if (!line) {
    if (tracers.length >= 6) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const material = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.ember), transparent: true, opacity: 0 });
    line = { line: new THREE.Line(geometry, material), life: 0 };
    scene.add(line.line);
    tracers.push(line);
  }
  const end = origin.clone().addScaledVector(dir, length);
  const attr = line.line.geometry.getAttribute('position');
  attr.setXYZ(0, origin.x, origin.y, origin.z);
  attr.setXYZ(1, end.x, end.y, end.z);
  attr.needsUpdate = true;
  line.life = 0.09;
  line.line.material.opacity = 0.85;
}

function throwGrenade(kind) {
  if (!arsenal.throwGrenade(kind)) return;
  sfx.grenadeThrow();
  camera.getWorldDirection(direction);
  const mesh = makeGrenadeMesh(kind);
  mesh.position.copy(camera.position).addScaledVector(direction, 0.5);
  mesh.position.y -= 0.1;
  scene.add(mesh);
  grenades.push({
    kind,
    mesh,
    pos: mesh.position,
    vel: direction.clone().multiplyScalar(13).add(new THREE.Vector3(0, 3.5, 0)),
    fuse: kind === 'frag' ? 1.6 : kind === 'smoke' ? 1.1 : 0.9,
    bounces: 0,
  });
}

function detonate(g) {
  scene.remove(g.mesh);
  const def = GRENADE_DEFS[g.kind];
  if (g.kind === 'frag') {
    sfx.explosion();
    squad.warnFrag(g.pos.x, g.pos.z, def.radius + 2);
    const victims = [playerFighter, ...squad.bots];
    for (const victim of victims) {
      const body = victim.body;
      if (!body.alive) continue;
      const dx = body.position.x - g.pos.x;
      const dy = body.position.y + 1 - g.pos.y;
      const dz = body.position.z - g.pos.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance > def.radius) continue;
      const damage = Math.round(def.damage * (1 - distance / (def.radius + 1)));
      const wasAlive = body.alive;
      applyDamage(body, damage);
      if (wasAlive && !body.alive) {
        overlay.feed('Frag', victim.name, false);
        if (victim === playerFighter) overlay.damageFlash();
        else match.addKill();
      } else if (victim === playerFighter) {
        overlay.damageFlash();
        sfx.hurt();
      }
    }
  } else if (g.kind === 'smoke') {
    const cloudMesh = makeGrenadeMesh('smoke');
    cloudMesh.position.set(g.pos.x, 1.4, g.pos.z);
    scene.add(cloudMesh);
    smokeClouds.push({ x: g.pos.x, z: g.pos.z, radius: def.radius, mesh: cloudMesh, left: 14 });
  } else {
    squad.flashAt(g.pos.x, g.pos.y, g.pos.z, def.radius);
    // The player is flashed too when facing the burst.
    const dx = g.pos.x - playerBody.position.x;
    const dy = g.pos.y - (playerBody.position.y + playerBody.eye);
    const dz = g.pos.z - playerBody.position.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance < def.radius) {
      camera.getWorldDirection(direction);
      const dot = direction.dot(new THREE.Vector3(dx / distance, dy / distance, dz / distance));
      if (dot > 0) overlay.flashWhite();
    }
    sfx.beep();
  }
}

function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.fuse -= dt;
    g.vel.y -= 12 * dt;
    g.pos.addScaledVector(g.vel, dt);
    if (g.pos.y < 0.12) {
      g.pos.y = 0.12;
      if (Math.abs(g.vel.y) > 1.5 && g.bounces < 3) sfx.grenadeBounce();
      g.vel.y *= -0.45;
      g.vel.x *= 0.7;
      g.vel.z *= 0.7;
      g.bounces += 1;
    }
    if (Math.abs(g.pos.x) > MAP_HALF_X - 0.2) g.vel.x *= -0.5;
    if (Math.abs(g.pos.z) > MAP_HALF_Z - 0.2) g.vel.z *= -0.5;
    if (g.fuse <= 0) {
      detonate(g);
      grenades.splice(i, 1);
    }
  }
  for (let i = smokeClouds.length - 1; i >= 0; i -= 1) {
    const cloud = smokeClouds[i];
    cloud.left -= dt;
    cloud.mesh.material.opacity = Math.min(0.5, cloud.left * 0.2);
    if (cloud.left <= 0) {
      scene.remove(cloud.mesh);
      smokeClouds.splice(i, 1);
    }
  }
  for (const tracer of tracers) {
    if (tracer.life > 0) {
      tracer.life -= dt;
      tracer.line.material.opacity = Math.max(0, tracer.life / 0.09) * 0.85;
    }
  }
}

const MAP_HALF_X = 24;
const MAP_HALF_Z = 16;

const controls = createControls(renderer.domElement, onLockChange);
const markerHoldMs = shot ? 4000 : 90;
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let buyOpen = false;
let playerStepAcc = 0;

overlay.onPlayClick(() => {
  if (shot) return;
  sfx.unlock();
  if (match.state.matchOver) {
    match.resetMatch();
    resetRound(1);
  }
  controls.requestLock();
});

function buyItems() {
  const items = [];
  for (const [index, def] of Object.values(GUN_DEFS).entries()) {
    items.push({ key: String(index + 1), kind: 'gun', id: def.id, name: def.name, price: def.price, owned: arsenal.state.owned[def.id] });
  }
  for (const [index, def] of Object.values(GRENADE_DEFS).entries()) {
    items.push({ key: String(5 + index), kind: 'grenade', id: def.id, name: `${def.name} grenade`, price: def.price, owned: false });
  }
  items.push({ key: '8', kind: 'vest', id: 'vest', name: 'Kevlar vest', price: VEST_PRICE, owned: playerBody.armor > 0 });
  items.push({ key: '9', kind: 'ammo', id: 'ammo', name: 'Refill reserve ammo', price: AMMO_PRICE, owned: false });
  return items;
}

function tryBuy(item) {
  if (match.state.phase !== 'buy') return;
  if (item.kind === 'gun') {
    if (arsenal.state.owned[item.id]) {
      arsenal.switchTo(item.id);
      return;
    }
    if (!match.spend(item.price)) {
      sfx.denied();
      return;
    }
    arsenal.buy(item.id);
    arsenal.switchTo(item.id);
    sfx.buy();
  } else if (item.kind === 'grenade') {
    if (!match.spend(item.price)) {
      sfx.denied();
      return;
    }
    arsenal.buyGrenade(item.id);
    sfx.buy();
  } else if (item.kind === 'vest') {
    if (playerBody.armor > 0 || !match.spend(item.price)) {
      sfx.denied();
      return;
    }
    playerBody.armor = 100;
    sfx.buy();
  } else if (item.kind === 'ammo') {
    if (!match.spend(item.price)) {
      sfx.denied();
      return;
    }
    arsenal.refillAmmo();
    sfx.buy();
  }
  refreshBuy();
  syncHud();
}

function refreshBuy() {
  if (!buyOpen) return;
  overlay.showBuy(buyItems(), match.state.money);
}

overlay.onBuyClick((item) => tryBuy(item));

function resetRound(round) {
  player.reset(SPAWNS.embers[0]);
  arsenal.refillMags();
  charge.reset();
  chargeSiteName = null;
  for (const g of grenades) scene.remove(g.mesh);
  grenades.length = 0;
  for (const cloud of smokeClouds) scene.remove(cloud.mesh);
  smokeClouds.length = 0;
  squad.reset(SPAWNS);
  fighterCache = null;
  buyOpen = false;
  overlay.hideBuy();
  overlay.setCharge('idle');
  syncHud();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    overlay.hideOverlay();
  } else if (playerBody.alive) {
    overlay.showOverlay(started ? 'paused' : 'start', match.state.embers);
  }
}

function syncCamera() {
  camera.position.set(playerBody.position.x, playerBody.position.y + playerBody.eye, playerBody.position.z);
  camera.rotation.set(playerBody.pitch, playerBody.yaw, 0, 'YXZ');
}

function syncHud() {
  overlay.setHealth(playerBody.health, playerBody.armor);
  const def = arsenal.currentDef();
  overlay.setAmmo(arsenal.state.mag[arsenal.state.current], arsenal.state.reserve[arsenal.state.current], def.name);
  overlay.setGrenades(arsenal.state.grenades);
  overlay.setMoney(match.state.money);
  overlay.setTimer(match.state.phaseLeft, match.state.phase);
  overlay.setScore(match.state.embers, match.state.ashguard, match.state.round);
  overlay.setCharge(charge.state.mode, charge.state.mode === 'planting' ? charge.state.plantProgress : 0, charge.state.timerLeft, charge.state.site);
  playerTorso.position.set(playerBody.position.x, playerBody.position.y + 0.95, playerBody.position.z);
  playerHead.position.set(playerBody.position.x, playerBody.position.y + 1.62, playerBody.position.z);
}

function aimAt(point) {
  const dx = point.x - playerBody.position.x;
  const dy = point.y - (playerBody.position.y + playerBody.eye);
  const dz = point.z - playerBody.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  playerBody.yaw = Math.atan2(-dx, -dz);
  playerBody.pitch = Math.asin(clamp(dy / length, -1, 1));
  syncCamera();
}

function shoot(spread) {
  if (!arsenal.takeRound()) {
    sfx.dryClick();
    return false;
  }
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  muzzle.copy(camera.position);
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const targets = arena.shootables.concat(squad.hitMeshes());
  const hit = raycaster.intersectObjects(targets, false)[0];
  spawnTracer(muzzle, direction, hit ? hit.distance : 60);
  if (hit && hit.object.userData.fighter) {
    const victim = hit.object.userData.fighter;
    const isHead = hit.object.userData.part === 'head';
    const def = arsenal.currentDef();
    const damage = isHead ? def.headDamage : def.damage;
    const wasAlive = victim.body.alive;
    applyDamage(victim.body, damage);
    overlay.hitMarker(!victim.body.alive, markerHoldMs);
    if (wasAlive && !victim.body.alive) {
      overlay.feed('You', victim.name, isHead);
      match.addKill();
      sfx.kill();
    } else {
      sfx.hit();
    }
  }
  sfx.shot(arsenal.state.current);
  arsenal.pullTrigger();
  player.kick(arsenal.currentDef().kick + random() * 0.004, (random() * 2 - 1) * 0.004);
  squad.hearNoise(playerBody.position.x, playerBody.position.z, HEAR_RANGE);
  syncHud();
  return true;
}

function siteAt(x, z) {
  for (const site of Object.values(SITES)) {
    if (Math.abs(x - site.center.x) <= site.half && Math.abs(z - site.center.z) <= site.half) return site.name;
  }
  return null;
}

function step(dt) {
  elapsed += dt;
  const frozenPhase = match.state.phase !== 'live';
  const keys = controls.state.keys;

  // Movement: the buy phase freezes the player, the live phase does not.
  if (playerBody.alive && !frozenPhase) {
    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const crouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    player.step(dt, { forward, strafe }, keys.has('Space'), crouch);
    playerStepAcc += dt * player.groundSpeed();
    if (playerStepAcc > 2.4 && player.groundSpeed() > 1) {
      playerStepAcc = 0;
      sfx.step(0);
    }
  }
  arsenal.step(dt);
  stepGrenades(dt);

  // The charge: the player plants by holding E inside a site.
  const here = siteAt(playerBody.position.x, playerBody.position.z);
  if (charge.state.mode === 'idle' && keys.has('KeyE') && here && playerBody.alive && !frozenPhase) {
    charge.startPlant(here);
    chargeSiteName = here;
  }
  defusingThisStep = false;
  const world = {
    fighters: getFighters(),
    smoke: smokeClouds,
    chargeMode: charge.state.mode,
    chargeSite: charge.state.site,
    sites: SITES,
    player: playerBody,
    defuser: nearestDefuser(),
  };
  squad.step(dt, world, elapsed);
  charge.step(dt, {
    planting: keys.has('KeyE') && playerBody.alive,
    inSite: here !== null && here === charge.state.site,
    defusing: defusingThisStep,
  });

  // Round end by elimination.
  if (match.state.phase === 'live') {
    if (squad.aliveOf('ashguard').length === 0) {
      match.endRound(true, 'Ashguard eliminated.');
    } else if (!playerBody.alive && squad.aliveOf('embers').length === 0) {
      match.endRound(false, 'Embers eliminated.');
    }
  }
  match.step(dt);
  syncHud();
  overlay.drawMinimap(getFighters(), SITES, charge.state.mode, charge.state.site);
}

function nearestDefuser() {
  if (charge.state.mode !== 'planted' || !charge.state.site) return null;
  const site = SITES[charge.state.site];
  let best = null;
  let bestD = Infinity;
  for (const bot of squad.bots) {
    if (bot.side !== 'ashguard' || !bot.body.alive) continue;
    const dx = bot.body.position.x - site.center.x;
    const dz = bot.body.position.z - site.center.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = bot.name;
    }
  }
  return best;
}

function handlePressed(pressed) {
  if (match.state.phase === 'buy') {
    if (pressed.has('KeyB')) {
      buyOpen = !buyOpen;
      if (buyOpen) refreshBuy();
      else overlay.hideBuy();
    }
    const items = buyItems();
    for (const item of items) {
      if (pressed.has(`Digit${item.key}`)) tryBuy(item);
    }
  }
  if (pressed.has('Digit1')) arsenal.switchTo('sidearm');
  if (pressed.has('Digit2')) arsenal.switchTo('smg');
  if (pressed.has('Digit3')) arsenal.switchTo('rifle');
  if (pressed.has('Digit4')) arsenal.switchTo('dmr');
  if (pressed.has('KeyR')) {
    if (arsenal.reload()) sfx.reload();
  }
  if (pressed.has('KeyG')) throwGrenade('frag');
  if (pressed.has('KeyH')) throwGrenade('smoke');
  if (pressed.has('KeyJ')) throwGrenade('flash');
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = controls.takeLook();
    player.look(look.x, look.y);
    handlePressed(controls.takePressed());
    if (controls.state.firing && arsenal.ready() && match.state.phase === 'live') {
      shoot(shot ? 0 : arsenal.spread(player.groundSpeed()));
    }
    if (controls.state.keys.has('KeyR') && arsenal.state.reloadLeft === 0) arsenal.reload();
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  overlay.hideOverlay();
  playerBody.pitch = 0;
  playerBody.yaw = 0;
  if (name === 'start') {
    playerBody.position.set(0, 0, 13.5);
    settle(20);
    aimAt(new THREE.Vector3(-19, 2.5, -11));
    overlay.showOverlay('start', 0);
  } else if (name === 'buy') {
    playerBody.position.set(0, 0, 13.5);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -11));
    match.state.money = 4500;
    arsenal.buy('rifle');
    buyOpen = true;
    refreshBuy();
    syncHud();
  } else if (name === 'play') {
    match.state.phase = 'live';
    match.state.phaseLeft = 95;
    playerBody.position.set(-2, 0, 8);
    settle(20);
    const target = squad.bots.find((b) => b.side === 'ashguard' && b.body.alive);
    if (target) {
      aimAt(new THREE.Vector3(target.body.position.x, target.body.position.y + 1.3, target.body.position.z));
      for (let round = 0; round < 3; round += 1) {
        shoot(0);
        settle(8);
      }
    }
    // End the capture aimed at a living defender, at full health: the
    // bots shoot back during the settle, and a bloodied frame with a dead
    // target in the crosshair says nothing about the firefight.
    const living = squad.bots
      .filter((b) => b.side === 'ashguard' && b.body.alive)
      .sort((a, b) => {
        const da = Math.hypot(a.body.position.x - playerBody.position.x, a.body.position.z - playerBody.position.z);
        const db = Math.hypot(b.body.position.x - playerBody.position.x, b.body.position.z - playerBody.position.z);
        return da - db;
      })[0];
    if (living) aimAt(new THREE.Vector3(living.body.position.x, living.body.position.y + 1.3, living.body.position.z));
    playerBody.health = 100;
    settle(2);
  } else if (name === 'plant') {
    match.state.phase = 'live';
    match.state.phaseLeft = 88;
    playerBody.position.set(-19, 0, -8.5);
    settle(20);
    aimAt(new THREE.Vector3(19, 1.5, -11));
    const target = squad.bots.find((b) => b.side === 'ashguard' && b.body.alive);
    if (target) {
      target.body.position.set(-12, 0, -9);
      target.mesh.position.set(-12, 0, -9);
    }
    settle(6);
    // Plant after the settle: a settle step would cancel a plant, because
    // no key is held during a capture.
    charge.startPlant('A');
    charge.state.plantProgress = 0.62;
  }
  syncCamera();
  syncHud();
  overlay.drawMinimap(getFighters(), SITES, charge.state.mode, charge.state.site);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
syncHud();
overlay.setScore(0, 0, 1);
if (shot) runShot(shot);
else requestAnimationFrame(frame);
