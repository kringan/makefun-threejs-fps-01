// The charge: one state machine, no scene work.
// idle -> planting (the carrier holds E inside a site) -> planted (35 s
// timer, beeps) -> exploded, or -> defused (a defender channels 5 s at
// the site). main.js drives it: it passes whether the carrier is planting
// and whether a defender is defusing, and reads the state to decide the round.
export const PLANT_SECONDS = 4;
export const DEFUSE_SECONDS = 5;
export const CHARGE_SECONDS = 35;

export function createCharge(callbacks) {
  const state = {
    mode: 'idle',
    plantProgress: 0,
    defuseProgress: 0,
    timerLeft: CHARGE_SECONDS,
    site: null,
    beepAt: 0,
  };

  function startPlant(site) {
    if (state.mode !== 'idle') return false;
    state.mode = 'planting';
    state.site = site;
    state.plantProgress = 0;
    return true;
  }

  function cancelPlant() {
    if (state.mode !== 'planting') return;
    state.mode = 'idle';
    state.site = null;
    state.plantProgress = 0;
  }

  function step(dt, drive) {
    if (state.mode === 'planting') {
      if (drive.planting && drive.inSite) {
        state.plantProgress += dt / PLANT_SECONDS;
        if (state.plantProgress >= 1) {
          state.mode = 'planted';
          state.timerLeft = CHARGE_SECONDS;
          state.beepAt = 1;
          callbacks.onPlanted(state.site);
        }
      } else {
        cancelPlant();
      }
      return;
    }
    if (state.mode !== 'planted') return;
    state.timerLeft -= dt;
    if (state.timerLeft <= 10 && state.timerLeft <= state.beepAt) {
      state.beepAt -= 1;
      callbacks.onBeep();
    }
    if (drive.defusing) {
      state.defuseProgress += dt / DEFUSE_SECONDS;
      if (state.defuseProgress >= 1) {
        state.mode = 'defused';
        callbacks.onDefused();
        return;
      }
    } else {
      state.defuseProgress = Math.max(0, state.defuseProgress - dt / DEFUSE_SECONDS);
    }
    if (state.timerLeft <= 0) {
      state.mode = 'exploded';
      callbacks.onExploded(state.site);
    }
  }

  return {
    state,
    startPlant,
    cancelPlant,
    step,
    reset() {
      state.mode = 'idle';
      state.plantProgress = 0;
      state.defuseProgress = 0;
      state.timerLeft = CHARGE_SECONDS;
      state.site = null;
      state.beepAt = 0;
    },
  };
}
