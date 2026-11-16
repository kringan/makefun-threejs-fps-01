// Foundry 9: an original night-foundry map, 48 x 32 m, built from boxes.
// Three lanes run north-south — West Foundry, Mid Conveyor, East Yard —
// between two charge sites: A Furnace in the west, B Dock in the east.
// Every box is a collider for the movers and a surface a bullet stops on.
// The floor panels mark the sites; the waypoint graph is the bots' route
// map, walked with a breadth-first search, never a straight line through a wall.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const MAP = { halfX: 24, halfZ: 16 };

export const SITES = {
  A: { name: 'A', label: 'Furnace', center: { x: -19, z: -11 }, half: 3.6, color: 'furnace' },
  B: { name: 'B', label: 'Dock', center: { x: 19, z: -11 }, half: 3.6, color: 'pipe' },
};

export const SPAWNS = {
  // Yaw 0 faces -z: the Embers spawn south and look north, up the foundry
  // toward the sites. The Ashguard spawn north and face south.
  embers: [
    { x: 0, z: 13.5, yaw: 0 },
    { x: -5, z: 13.5, yaw: 0.25 },
    { x: 5, z: 13.5, yaw: -0.25 },
  ],
  ashguard: [
    { x: -19, z: -13.5, yaw: Math.PI },
    { x: -9, z: -13.5, yaw: Math.PI },
    { x: 0, z: -13.5, yaw: Math.PI },
    { x: 9, z: -13.5, yaw: Math.PI },
    { x: 19, z: -13.5, yaw: Math.PI },
  ],
};

// Waypoint graph: index, position, neighbours. Bots route across it with BFS.
export const WAYPOINTS = [
  { x: -19, z: -11, next: [1, 10] }, // 0 site A
  { x: -14, z: -11, next: [0, 2, 11] }, // 1 A front
  { x: -9, z: -6, next: [1, 3, 7] }, // 2 west-mid
  { x: -16, z: -2, next: [2, 4, 12] }, // 3 west lane
  { x: -16, z: 6, next: [3, 5, 13] }, // 4 west south
  { x: -8, z: 9, next: [4, 6, 14] }, // 5 south-west
  { x: 0, z: 10, next: [5, 8, 15] }, // 6 south mid
  { x: 0, z: -3, next: [2, 8, 9] }, // 7 conveyor north
  { x: 0, z: 3, next: [6, 7, 14] }, // 8 conveyor south
  { x: 9, z: -6, next: [7, 10, 15] }, // 9 east-mid
  { x: 14, z: -11, next: [9, 11, 16] }, // 10 B front
  { x: 19, z: -11, next: [10, 16] }, // 11 site B
  { x: -12, z: -13, next: [1, 2, 17] }, // 12 north-west
  { x: -6, z: 13, next: [4, 5, 13] }, // 13 spawn west — placeholder, fixed below
  { x: 8, z: 9, next: [5, 6, 9] }, // 14 south-east
  { x: 16, z: 6, next: [9, 14, 17] }, // 15 east south
  { x: 16, z: -2, next: [10, 11, 15] }, // 16 east lane
  { x: 12, z: -13, next: [10, 12, 15] }, // 17 north-east
];
// Node 13 is the Embers spawn corner; its links are set here so the graph
// stays connected without a duplicate entry above.
WAYPOINTS[13] = { x: -6, z: 13, next: [4, 5, 6] };

export function route(fromIndex, toIndex) {
  if (fromIndex === toIndex) return [toIndex];
  const prev = new Array(WAYPOINTS.length).fill(-1);
  const queue = [fromIndex];
  prev[fromIndex] = fromIndex;
  while (queue.length > 0) {
    const at = queue.shift();
    for (const next of WAYPOINTS[at].next) {
      if (prev[next] !== -1) continue;
      prev[next] = at;
      if (next === toIndex) {
        const path = [next];
        let step = at;
        while (step !== fromIndex) {
          path.unshift(step);
          step = prev[step];
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [toIndex];
}

export function nearestWaypoint(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i += 1) {
    const dx = WAYPOINTS[i].x - x;
    const dz = WAYPOINTS[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function createArena(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'ember' || name === 'furnace' ? 0.5 : 0.94,
      metalness: name === 'steel' || name === 'pipe' ? 0.35 : 0.03,
      emissive: name === 'furnace' ? new THREE.Color(PALETTE.furnace) : new THREE.Color(0x000000),
      emissiveIntensity: name === 'furnace' ? 0.9 : 0,
    });
  }

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Floor, then the perimeter walls, 4.5 m high, open to the night sky.
  box(48.8, 0.4, 32.8, 0, -0.2, 0, 'floor');
  box(0.4, 4.5, 32.8, -24.2, 2.25, 0, 'wall');
  box(0.4, 4.5, 32.8, 24.2, 2.25, 0, 'wall');
  box(48.8, 4.5, 0.4, 0, 2.25, -16.2, 'wall');
  box(48.8, 4.5, 0.4, 0, 2.25, 16.2, 'wall');

  // Site floor panels: the plant zones, readable at a glance.
  box(7.2, 0.06, 7.2, SITES.A.center.x, 0.03, SITES.A.center.z, 'furnace', false);
  box(7.2, 0.06, 7.2, SITES.B.center.x, 0.03, SITES.B.center.z, 'pipe', false);

  // Site corner posts so the zones read from across the foundry.
  for (const site of Object.values(SITES)) {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        box(0.26, 2.4, 0.26, site.center.x + sx * site.half, 1.2, site.center.z + sz * site.half, site.color);
      }
    }
  }

  // The furnace: a glowing block over site A, hard cover with a hot face.
  box(5, 3.4, 2.2, -19, 1.7, -14.2, 'furnace');
  box(1.2, 5.2, 1.2, -21, 2.6, -14.2, 'steel');
  box(1.2, 5.2, 1.2, -17, 2.6, -14.2, 'steel');

  // Mid conveyor: a long low belt that splits the middle lane, with a gap
  // in the centre to peek and shoot through.
  box(2.2, 1.0, 9, -2.6, 0.5, -4, 'steel');
  box(2.2, 1.0, 9, 2.6, 0.5, -4, 'steel');
  box(1.4, 0.5, 1.4, 0, 0.25, -4, 'crate');
  box(2.2, 0.9, 4.5, 0, 0.45, 5.5, 'steel');

  // Coolant pipes along the west and east lanes: waist-high, shoot over them.
  box(1.1, 1.1, 12, -21.5, 0.55, -2, 'pipe');
  box(1.1, 1.1, 12, 21.5, 0.55, -2, 'pipeB');

  // Cover crates: crouch-height near both sites and along the lanes.
  box(1.7, 1.1, 1.7, -14.5, 0.55, -6.5, 'crate');
  box(1.7, 1.1, 1.7, -9.5, 0.55, -13, 'crate');
  box(1.7, 1.1, 1.7, 14.5, 0.55, -6.5, 'crate');
  box(1.7, 1.1, 1.7, 9.5, 0.55, -13, 'crate');
  box(2.6, 0.9, 1.3, -3, 0.45, 10.5, 'crate');
  box(2.6, 0.9, 1.3, 3, 0.45, 10.5, 'crate');
  box(1.3, 1.1, 3.8, -21, 0.55, 6, 'crate');
  box(1.3, 1.1, 3.8, 21, 0.55, 6, 'crate');

  // Tall containers: hard cover that breaks the long sightlines.
  box(5.2, 2.6, 1.5, -10, 1.3, 8, 'pipe');
  box(5.2, 2.6, 1.5, 10, 1.3, 8, 'furnace');
  box(1.5, 2.6, 5.2, -19, 1.3, 3, 'steel');
  box(1.5, 2.6, 5.2, 19, 1.3, 3, 'steel');
  box(4.6, 2.6, 1.5, -6, 1.3, -11, 'steel');
  box(4.6, 2.6, 1.5, 6, 1.3, -11, 'steel');

  // Lighting: a cool moon fill, a warm key from the furnace side, and one
  // glowing point light over each site so the objective reads at a glance.
  const moon = new THREE.HemisphereLight(new THREE.Color('#8a97a8'), new THREE.Color(PALETTE.ground), 1.15);
  scene.add(moon);

  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.ember), 2.4);
  key.position.set(-20, 12, -10);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -28;
  key.shadow.camera.right = 28;
  key.shadow.camera.top = 22;
  key.shadow.camera.bottom = -22;
  key.shadow.camera.far = 70;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.pipe), 0.8);
  fill.position.set(16, 10, 14);
  scene.add(fill);

  const furnaceGlow = new THREE.PointLight(new THREE.Color(PALETTE.furnace), 60, 22, 1.8);
  furnaceGlow.position.set(-19, 3.2, -11);
  scene.add(furnaceGlow);

  const dockLamp = new THREE.PointLight(new THREE.Color('#9fd8c8'), 26, 18, 1.8);
  dockLamp.position.set(19, 3.4, -11);
  scene.add(dockLamp);

  // A low ember moon in the sky, for the screenshots' horizon.
  const emberMoon = new THREE.Mesh(
    new THREE.CircleGeometry(2.6, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ember), fog: false }),
  );
  emberMoon.position.set(30, 9, -34);
  emberMoon.lookAt(0, 1.5, 0);
  scene.add(emberMoon);

  return { colliders, shootables, group, sites: SITES };
}
