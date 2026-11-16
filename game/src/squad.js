// The squad: every bot on both teams, one AI for all of them.
// Embers (the player's team): Ash and Coal, who escort the player.
// Ashguard (the defenders): Vex, Rook, Mira, Dagger and Holt, who hold the
// sites, patrol the lanes, converge on a planted charge, and defuse it.
// A bot sees through line of sight, hears loud shots, cannot see through
// smoke, and goes blind to a flash it faces. It routes across the arena's
// waypoint graph, holds when it has a good angle, and shoots in bursts
// with an error that grows with distance and target speed — so a still,
// aimed player wins the duel.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createBody, applyDamage } from './mover.js';
import { WAYPOINTS, route, nearestWaypoint } from './arena.js';
import { pick } from './rng.js';

const SIGHT_RANGE = 38;
const SIGHT_HALF_ANGLE = 1.31; // ~75 degrees
const HEAR_RANGE = 26;

const ALLIES = [
  { name: 'Ash', color: 'ally' },
  { name: 'Coal', color: 'ally' },
];

const ENEMIES = [
  { name: 'Vex', color: 'enemy', role: 'holdA' },
  { name: 'Rook', color: 'enemy', role: 'holdB' },
  { name: 'Mira', color: 'enemy', role: 'patrol' },
  { name: 'Dagger', color: 'enemy', role: 'patrol' },
  { name: 'Holt', color: 'enemy', role: 'roam' },
];

function buildFighterMesh(colorName, name) {
  const group = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE[colorName]), roughness: 0.85, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.dark), roughness: 0.7, metalness: 0.2 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.85, 0.3), cloth);
  torso.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), dark);
  head.position.y = 1.66;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.05), new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ember), roughness: 0.4, emissive: new THREE.Color(PALETTE.ember), emissiveIntensity: 0.7 }));
  visor.position.set(0, 1.68, -0.18);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.62, 0.28), dark);
  legs.position.y = 0.31;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.62), dark);
  gun.position.set(0.22, 1.15, -0.3);
  group.add(torso, head, visor, legs, gun);
  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
    }
  });
  // A floating name plate is cheap and makes the kill feed and the
  // screenshots agree about who is who.
  const tag = makeTag(name, PALETTE[colorName]);
  tag.position.y = 2.05;
  group.add(tag);
  return { group, torso, head };
}

function makeTag(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 48;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(12, 10, 8, 0.72)';
  ctx.fillRect(0, 0, 256, 48);
  ctx.fillStyle = color;
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 26);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(1.5, 0.28, 1);
  return sprite;
}

export function createSquad(scene, colliders, shootables, random, events) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const ahead = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const dir = new THREE.Vector3();

  const bots = [];

  function addBot(def, side, spawn) {
    const mover = createBody(colliders, spawn);
    const parts = buildFighterMesh(def.color, def.name);
    scene.add(parts.group);
    parts.torso.userData.fighter = null; // filled below, after bot exists
    parts.head.userData.fighter = null;
    const bot = {
      name: def.name,
      side,
      role: def.role ?? 'escort',
      mover,
      body: mover.state,
      mesh: parts.group,
      torso: parts.torso,
      head: parts.head,
      routePath: [],
      routeIndex: 0,
      holdUntil: 0,
      target: null,
      reactLeft: 0,
      burstLeft: 0,
      burstPause: 0,
      strafeDir: 1,
      strafeLeft: 0,
      blindLeft: 0,
      fleeFrom: null,
      fleeLeft: 0,
      investigate: null,
      stepAcc: 0,
      dead: false,
    };
    parts.torso.userData.fighter = bot;
    parts.head.userData.fighter = bot;
    parts.torso.userData.part = 'body';
    parts.head.userData.part = 'head';
    bots.push(bot);
    return bot;
  }

  function spawnAll(spawns) {
    let i = 0;
    for (const def of ALLIES) addBot(def, 'embers', spawns.embers[i++ % spawns.embers.length]);
    i = 0;
    for (const def of ENEMIES) addBot(def, 'ashguard', spawns.ashguard[i++ % spawns.ashguard.length]);
  }

  function reset(spawns) {
    for (const bot of bots) scene.remove(bot.mesh);
    bots.length = 0;
    spawnAll(spawns);
  }

  function hitMeshes() {
    const out = [];
    for (const bot of bots) {
      if (bot.body.alive) out.push(bot.torso, bot.head);
    }
    return out;
  }

  function aliveOf(side) {
    return bots.filter((b) => b.side === side && b.body.alive);
  }

  function setRoute(bot, toIndex) {
    const from = nearestWaypoint(bot.body.position.x, bot.body.position.z);
    bot.routePath = route(from, toIndex);
    bot.routeIndex = 0;
  }

  function pickObjective(bot, world) {
    if (bot.side === 'ashguard') {
      if (world.chargeMode === 'planted' && world.chargeSite) {
        setRoute(bot, world.chargeSite === 'A' ? 0 : 11);
        return;
      }
      if (bot.role === 'holdA') {
        bot.routePath = [1, 0];
        bot.routeIndex = 0;
        return;
      }
      if (bot.role === 'holdB') {
        bot.routePath = [10, 11];
        bot.routeIndex = 0;
        return;
      }
      setRoute(bot, pick(random, [2, 3, 7, 9, 12, 16, 17]));
      return;
    }
    // Allies escort the player: trail the player's waypoint, offset so
    // they do not stack on one spot.
    const px = world.player.position.x + (bot.name === 'Ash' ? -2.5 : 2.5);
    const pz = world.player.position.z + 3;
    setRoute(bot, nearestWaypoint(px, pz));
  }

  function segmentBlocked(from, to) {
    eye.copy(from);
    dir.copy(to).sub(from);
    const length = dir.length();
    if (length < 0.01) return false;
    dir.normalize();
    raycaster.set(eye, dir);
    raycaster.far = length;
    const hit = raycaster.intersectObjects(shootables, false)[0];
    return hit !== undefined;
  }

  function smokeBetween(from, to, smoke) {
    for (const cloud of smoke) {
      // A segment passes a sphere when its closest approach is inside it.
      const cx = cloud.x - from.x;
      const cz = cloud.z - from.z;
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const lenSq = dx * dx + dz * dz;
      const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, (cx * dx + cz * dz) / lenSq));
      const nearX = from.x + dx * t;
      const nearZ = from.z + dz * t;
      const ddx = cloud.x - nearX;
      const ddz = cloud.z - nearZ;
      if (ddx * ddx + ddz * ddz < cloud.radius * cloud.radius) return true;
    }
    return false;
  }

  function canSee(bot, fighter, smoke) {
    if (!fighter.alive) return false;
    const bp = bot.body.position;
    const fp = fighter.position;
    toTarget.set(fp.x - bp.x, 0, fp.z - bp.z);
    const distance = toTarget.length();
    if (distance > SIGHT_RANGE) return false;
    toTarget.normalize();
    ahead.set(-Math.sin(bot.body.yaw), 0, -Math.cos(bot.body.yaw));
    if (ahead.dot(toTarget) < Math.cos(SIGHT_HALF_ANGLE) && distance > 4) return false;
    eye.set(bp.x, bp.y + bot.body.eye, bp.z);
    const targetEye = { x: fp.x, y: fp.y + 1.4, z: fp.z };
    if (segmentBlocked(eye, targetEye)) return false;
    if (smokeBetween(eye, targetEye, smoke)) return false;
    return true;
  }

  function nearestVisibleEnemy(bot, fighters, smoke) {
    let best = null;
    let bestD = Infinity;
    for (const fighter of fighters) {
      if (fighter.side === bot.side || !fighter.alive) continue;
      if (!canSee(bot, fighter.body, smoke)) continue;
      const dx = fighter.body.position.x - bot.body.position.x;
      const dz = fighter.body.position.z - bot.body.position.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = fighter;
      }
    }
    return best;
  }

  function aimError(bot, fighter) {
    const dx = fighter.body.position.x - bot.body.position.x;
    const dz = fighter.body.position.z - bot.body.position.z;
    const distance = Math.hypot(dx, dz);
    const speed = Math.hypot(fighter.body.velocity.x, fighter.body.velocity.z);
    // Base error grows with range and target speed; holders are steadier.
    let error = 0.012 + distance * 0.0011 + speed * 0.004;
    if (bot.role === 'holdA' || bot.role === 'holdB') error *= 0.8;
    if (bot.blindLeft > 0) error *= 6;
    return error;
  }

  function botShoot(bot, fighter, time) {
    const bp = bot.body.position;
    const fp = fighter.body.position;
    eye.set(bp.x, bp.y + bot.body.eye, bp.z);
    const error = aimError(bot, fighter);
    dir.set(fp.x - bp.x, fp.y + 1.35 - (bp.y + bot.body.eye), fp.z - bp.z).normalize();
    dir.x += (random() * 2 - 1) * error;
    dir.y += (random() * 2 - 1) * error;
    dir.z += (random() * 2 - 1) * error;
    dir.normalize();
    raycaster.set(eye, dir);
    raycaster.far = 60;
    // Never shoot yourself: the ray starts inside your own head box.
    const targets = events.hitTargets().filter((m) => m.userData.fighter !== bot);
    const hit = raycaster.intersectObjects(targets, false)[0];
    events.onBotShot(bot, eye.clone(), dir.clone());
    if (!hit) return;
    const victim = hit.object.userData.fighter;
    if (!victim) return; // a wall stopped the shot
    const isHead = hit.object.userData.part === 'head';
    const damage = isHead ? 68 : 24;
    const lost = applyDamage(victim.body ?? victim, damage);
    events.onDamage(victim, bot, isHead, lost, damage);
  }

  function stepBot(bot, dt, world, time) {
    const body = bot.body;
    if (!body.alive) {
      if (!bot.dead) {
        bot.dead = true;
        bot.mesh.rotation.x = -Math.PI / 2;
        bot.mesh.position.y = 0.25;
      }
      return;
    }
    bot.blindLeft = Math.max(0, bot.blindLeft - dt);
    bot.holdUntil = Math.max(0, bot.holdUntil - dt);

    // Defuse: the nearest living Ashguard at a planted site channels it.
    if (bot.side === 'ashguard' && world.chargeMode === 'planted' && world.chargeSite) {
      const site = world.sites[world.chargeSite];
      const dx = site.center.x - body.position.x;
      const dz = site.center.z - body.position.z;
      if (Math.hypot(dx, dz) < 1.6 && bot.name === world.defuser) {
        events.onDefuseChannel(bot, dt);
        return;
      }
    }

    const fighters = world.fighters;
    const target = nearestVisibleEnemy(bot, fighters, world.smoke);
    if (target && bot.reactLeft <= 0) bot.reactLeft = 0.35 + random() * 0.45;
    if (target) {
      bot.target = target;
      bot.reactLeft = Math.max(0, bot.reactLeft - dt);
    } else {
      bot.target = null;
      bot.reactLeft = 0;
    }

    let move = { forward: 0, strafe: 0 };
    let crouch = false;
    if (bot.fleeLeft > 0 && bot.fleeFrom) {
      bot.fleeLeft -= dt;
      const dx = body.position.x - bot.fleeFrom.x;
      const dz = body.position.z - bot.fleeFrom.z;
      const length = Math.hypot(dx, dz) || 1;
      const wantYaw = Math.atan2(-dx / length, -dz / length);
      body.yaw += (wantYaw - body.yaw) * Math.min(1, dt * 6);
      move.forward = 1;
    } else if (bot.target && bot.reactLeft <= 0) {
      // Face the target, strafe to stay a hard target, shoot in bursts.
      const tp = bot.target.body.position;
      const wantYaw = Math.atan2(-(tp.x - body.position.x), -(tp.z - body.position.z));
      let diff = wantYaw - body.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      body.yaw += diff * Math.min(1, dt * 8);
      bot.strafeLeft -= dt;
      if (bot.strafeLeft <= 0) {
        bot.strafeDir = random() < 0.5 ? -1 : 1;
        bot.strafeLeft = 0.7 + random() * 0.9;
      }
      const distance = Math.hypot(tp.x - body.position.x, tp.z - body.position.z);
      move.strafe = bot.strafeDir * 0.7;
      if (distance > 16) move.forward = 0.6;
      else if (distance < 5) move.forward = -0.5;
      if (random() < 0.002) crouch = true;
      if (bot.burstPause > 0) {
        bot.burstPause -= dt;
      } else if (bot.burstLeft > 0) {
        bot.burstLeft -= 1;
        botShoot(bot, bot.target, time);
        if (bot.burstLeft === 0) bot.burstPause = 0.5 + random() * 0.8;
      } else {
        bot.burstLeft = 3 + Math.floor(random() * 3);
      }
    } else if (bot.holdUntil <= 0) {
      // Walk the route; pause and hold at each waypoint to scan.
      if (bot.routePath.length === 0 || bot.routeIndex >= bot.routePath.length) {
        pickObjective(bot, world);
      }
      const node = WAYPOINTS[bot.routePath[Math.min(bot.routeIndex, bot.routePath.length - 1)]];
      const dx = node.x - body.position.x;
      const dz = node.z - body.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.9) {
        bot.routeIndex += 1;
        bot.holdUntil = 0.8 + random() * 1.6;
        if (bot.routeIndex >= bot.routePath.length) pickObjective(bot, world);
      } else {
        const wantYaw = Math.atan2(-dx, -dz);
        let diff = wantYaw - body.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        body.yaw += diff * Math.min(1, dt * 6);
        move.forward = 1;
      }
    }

    bot.mover.step(dt, move, false, crouch);
    // Footsteps, throttled: main.js turns them into quiet sounds.
    bot.stepAcc += dt * bot.mover.groundSpeed();
    if (bot.stepAcc > 2.2 && bot.mover.groundSpeed() > 1) {
      bot.stepAcc = 0;
      events.onStep(bot);
    }
    bot.mesh.position.set(body.position.x, body.position.y, body.position.z);
    bot.mesh.rotation.y = body.yaw;
  }

  function step(dt, world, time) {
    for (const bot of bots) stepBot(bot, dt, world, time);
  }

  return {
    bots,
    spawnAll,
    reset,
    hitMeshes,
    aliveOf,
    step,
    hearNoise(x, z, radius) {
      for (const bot of bots) {
        if (!bot.body.alive) continue;
        const dx = bot.body.position.x - x;
        const dz = bot.body.position.z - z;
        if (dx * dx + dz * dz < radius * radius) {
          bot.investigate = { x, z };
          setRoute(bot, nearestWaypoint(x, z));
        }
      }
    },
    warnFrag(x, z, radius) {
      for (const bot of bots) {
        if (!bot.body.alive) continue;
        const dx = bot.body.position.x - x;
        const dz = bot.body.position.z - z;
        if (dx * dx + dz * dz < radius * radius) {
          bot.fleeFrom = { x, z };
          bot.fleeLeft = 1.1;
        }
      }
    },
    flashAt(x, y, z, radius) {
      for (const bot of bots) {
        if (!bot.body.alive) continue;
        const dx = bot.body.position.x - x;
        const dy = (bot.body.position.y + 1.5) - y;
        const dz = bot.body.position.z - z;
        const distance = Math.hypot(dx, dy, dz);
        if (distance > radius) continue;
        // Facing the flash is what blinds: the dot of the look direction
        // with the direction to the flash must be positive.
        const lx = -Math.sin(bot.body.yaw);
        const lz = -Math.cos(bot.body.yaw);
        const dot = (lx * dx + lz * dz) / (Math.hypot(dx, dz) || 1);
        if (dot > -0.2) bot.blindLeft = 2.2 * (1 - distance / radius) + 0.4;
      }
    },
  };
}
