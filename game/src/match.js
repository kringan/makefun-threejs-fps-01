// The match: phases and money, kept apart from the scene.
// buy (12 s, frozen, buy menu) -> live (100 s) -> over (banner, then reset).
// Economy: $800 to start, +$300 a kill, +$3,250 a won round, +$1,900 a lost
// one. First team to 5 round wins takes the match, then it restarts.
// main.js calls step() every fixed step and answers the phase changes.
export const BUY_SECONDS = 12;
export const ROUND_SECONDS = 100;
export const OVER_SECONDS = 4.5;
export const WIN_ROUNDS = 5;

const WIN_REWARD = 3250;
const LOSS_REWARD = 1900;
const KILL_REWARD = 300;

export function createMatch(callbacks) {
  const state = {
    phase: 'buy',
    phaseLeft: BUY_SECONDS,
    round: 1,
    embers: 0,
    ashguard: 0,
    money: 800,
    kills: 0,
    overReason: '',
    overWon: false,
    matchOver: false,
    matchWinner: '',
  };

  function endRound(won, reason) {
    if (state.phase === 'over') return;
    state.phase = 'over';
    state.phaseLeft = OVER_SECONDS;
    state.overWon = won;
    state.overReason = reason;
    if (won) {
      state.embers += 1;
      state.money += WIN_REWARD;
    } else {
      state.ashguard += 1;
      state.money += LOSS_REWARD;
    }
    if (state.embers >= WIN_ROUNDS || state.ashguard >= WIN_ROUNDS) {
      state.matchOver = true;
      state.matchWinner = state.embers >= WIN_ROUNDS ? 'Embers' : 'Ashguard';
    }
    callbacks.onRoundOver(won, reason);
  }

  function step(dt) {
    state.phaseLeft -= dt;
    if (state.phase === 'buy' && state.phaseLeft <= 0) {
      state.phase = 'live';
      state.phaseLeft = ROUND_SECONDS;
      callbacks.onRoundLive();
    } else if (state.phase === 'live' && state.phaseLeft <= 0) {
      endRound(false, 'Time ran out — the charge was never planted.');
    } else if (state.phase === 'over' && state.phaseLeft <= 0) {
      if (state.matchOver) {
        callbacks.onMatchOver(state.matchWinner);
        state.round = 1;
        state.embers = 0;
        state.ashguard = 0;
        state.money = 800;
        state.kills = 0;
        state.matchOver = false;
        state.matchWinner = '';
      }
      state.round += 1;
      state.phase = 'buy';
      state.phaseLeft = BUY_SECONDS;
      callbacks.onRoundStart(state.round);
    }
  }

  return {
    state,
    step,
    endRound,
    addKill() {
      state.kills += 1;
      state.money += KILL_REWARD;
    },
    // Spend returns false when the player cannot afford it; the HUD plays denied.
    spend(cost) {
      if (state.money < cost) return false;
      state.money -= cost;
      return true;
    },
    resetMatch() {
      state.phase = 'buy';
      state.phaseLeft = BUY_SECONDS;
      state.round = 1;
      state.embers = 0;
      state.ashguard = 0;
      state.money = 800;
      state.kills = 0;
      state.matchOver = false;
      state.matchWinner = '';
    },
  };
}
