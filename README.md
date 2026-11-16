# Ember Line — a three.js tactical FPS

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/kringan/makefun-threejs-fps-01/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/kringan/makefun-threejs-fps-01/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

Entry for the [make.fun threejs-fps-02 bounty](https://make.fun/bounty/threejs-fps-02):
make the best three.js tactical FPS. A round-based, Counter-Strike-style
shooter with an original map, bots on both teams, and gunfire where accuracy
counts more than speed.

## The game

**Foundry 9** — a night foundry, 48 × 32 m, three lanes (West Foundry, Mid
Conveyor, East Yard) between two charge sites: **A Furnace** in the west and
**B Dock** in the east. You are the Embers' charge carrier, with two AI
teammates (Ash, Coal) against five Ashguard defenders (Vex, Rook, Mira,
Dagger, Holt).

- **Rounds:** buy phase (12 s) → live round (100 s) → round over. First team
  to 5 rounds takes the match, then it restarts.
- **Objective:** hold **E** inside a site to plant the charge (4 s), defend
  it for 35 s — or eliminate the Ashguard. Defenders converge on a planted
  charge and defuse it (5 s).
- **Gunplay:** four guns (P9 Sidearm, Wasp-9 SMG, AR-77 Ember rifle,
  Longshot DMR) with different damage, fire rate, spread and recoil;
  headshots deal more damage; spread and recoil punish firing on the move;
  acceleration, crouch, jump and per-axis box collision.
- **Tactics:** money every round ($800 start, +$300 a kill, +$3,250 a won
  round) spent in the buy menu (**B**, keys 1–9) on guns, grenades and a
  Kevlar vest; three grenades — **Frag** (G), **Smoke** (H, blocks sight),
  **Flash** (J, blinds bots that face it); bots patrol waypoint routes, hold
  sites, react to what they see and hear, and flee frags.
- **HUD:** health + armour, ammo, money, round timer, team score, kill feed,
  charge status and a live minimap. Procedural WebAudio sounds (shots,
  footsteps, reload, beeps, explosion) — no audio files, no network.

## Play

```sh
node serve.ts   # serves game/ on http://localhost:8080
```

Open `http://localhost:8080` in desktop Chrome. Click to play.
WASD move, mouse look, click fire, R reload, 1–4 weapons, G/H/J grenades,
E plant (hold, in a site), B buy menu, Ctrl crouch, Space jump.

## Layout

- `game/index.html` — the page and HUD
- `game/src/main.js` — boot, fixed 60 Hz loop, shooting, grenades, captures
- `game/src/arena.js` — the Foundry 9 map, waypoint graph, lighting
- `game/src/mover.js` — shared movement + armour damage for player and bots
- `game/src/squad.js` — bot AI for both teams (senses, routes, bursts)
- `game/src/arsenal.js` — guns, grenades, vest, view models
- `game/src/charge.js` — plant / defuse state machine
- `game/src/match.js` — phases, economy, match score
- `game/src/sfx.js` — procedural WebAudio sounds
- `game/src/overlay.js` — HUD, buy menu, minimap
- `game/src/controls.js` — keyboard, mouse, pointer lock
- `game/src/palette.js`, `game/src/rng.js` — the look plan, seeded randomness
- `main.ts` — the entry program (copies game/ + screenshots/, writes dossier.json)
- `vendor/makefun-threejs.ts` — the kit's dossier library, unchanged
- `game/vendor/three/` — three.js 0.187.0, vendored byte for byte

## License

MIT — see [LICENSE](LICENSE).
