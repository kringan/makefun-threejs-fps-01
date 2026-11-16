// Ember Line — the look plan, in one place.
// A night foundry: cold charcoal steel and teal coolant pipes against the
// orange glow of the furnace, one ember accent for the charge, the HUD and
// the muzzle flash. The same names are the CSS custom properties in
// index.html, so the page and the scene always agree on the palette.
export const PALETTE = {
  sky: '#14100e',
  ground: '#4a4038',
  floor: '#5c5148',
  wall: '#3a3230',
  steel: '#2c3438',
  pipe: '#2e6f6a',
  pipeB: '#7a3b2e',
  crate: '#6b4a2f',
  furnace: '#e8632c',
  ember: '#f0a830',
  ink: '#f2ead9',
  muted: '#a89a86',
  dark: '#17120f',
  ally: '#57b8a2',
  enemy: '#e0523d',
};

export function shade(name) {
  return PALETTE[name];
}
