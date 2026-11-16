// The HUD: every DOM element the player sees, in one place. main.js calls
// these setters; nothing here knows about the simulation except through
// them. The buy menu is a real list the player clicks or buys with keys,
// and the minimap is a top-down canvas drawn from the fighters each frame.
export function createOverlay() {
  const el = (id) => document.getElementById(id);
  const healthFill = el('health-fill');
  const healthNum = el('health-num');
  const armorRow = el('armor-row');
  const armorNum = el('armor-num');
  const ammoMag = el('ammo-mag');
  const ammoReserve = el('ammo-reserve');
  const gunName = el('gun-name');
  const moneyEl = el('money');
  const timerEl = el('timer');
  const scoreEl = el('score-value');
  const roundEl = el('round-value');
  const feedEl = el('feed');
  const bannerEl = el('banner');
  const bannerTitle = el('banner-title');
  const bannerSub = el('banner-sub');
  const buyEl = el('buy');
  const buyList = el('buy-list');
  const chargeEl = el('charge');
  const chargeLabel = el('charge-label');
  const chargeBar = el('charge-bar');
  const promptEl = el('prompt');
  const nadesEl = el('nades');
  const flashEl = el('flash');
  const vignetteEl = el('vignette');
  const overlayEl = el('overlay');
  const overlayTitle = el('overlay-title');
  const overlayCopy = el('overlay-copy');
  const playBtn = el('play');
  const mapCanvas = el('minimap');
  const mapCtx = mapCanvas.getContext('2d');
  const hitmarker = el('hitmarker');

  let onPlay = () => {};
  let onBuy = () => {};
  let bannerTimer = 0;
  playBtn.addEventListener('click', () => onPlay());

  function showBanner(title, sub, ms = 2600) {
    bannerTitle.textContent = title;
    bannerSub.textContent = sub ?? '';
    bannerEl.hidden = false;
    window.clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => {
      bannerEl.hidden = true;
    }, ms);
  }

  return {
    onPlayClick(fn) {
      onPlay = fn;
    },
    onBuyClick(fn) {
      onBuy = fn;
    },
    setHealth(health, armor) {
      healthNum.textContent = String(Math.ceil(health));
      healthFill.style.width = `${Math.max(0, health)}%`;
      healthFill.classList.toggle('low', health <= 30);
      armorNum.textContent = String(Math.ceil(armor));
      armorRow.style.opacity = armor > 0 ? '1' : '0.35';
    },
    setAmmo(mag, reserve, name) {
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      gunName.textContent = name;
      ammoMag.parentElement.classList.toggle('empty', mag === 0);
    },
    setGrenades(counts) {
      nadesEl.textContent = `Frag ${counts.frag} · Smoke ${counts.smoke} · Flash ${counts.flash}`;
    },
    setMoney(money) {
      moneyEl.textContent = `$${money}`;
    },
    setTimer(seconds, phase) {
      const left = Math.max(0, Math.ceil(seconds));
      timerEl.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      timerEl.classList.toggle('urgent', phase === 'live' && left <= 15);
      timerEl.classList.toggle('buy', phase === 'buy');
    },
    setScore(embers, ashguard, round) {
      scoreEl.textContent = `${embers} — ${ashguard}`;
      roundEl.textContent = `Round ${round}`;
    },
    hitMarker(kill, holdMs) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', kill);
      window.setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs ?? 90);
    },
    damageFlash() {
      vignetteEl.classList.add('hit');
      window.setTimeout(() => vignetteEl.classList.remove('hit'), 300);
    },
    flashWhite() {
      flashEl.classList.remove('on');
      void flashEl.offsetWidth;
      flashEl.classList.add('on');
    },
    feed(killer, victim, isHead) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.textContent = `${killer} ${isHead ? '⌖' : '✕'} ${victim}`;
      feedEl.prepend(line);
      while (feedEl.children.length > 5) feedEl.removeChild(feedEl.lastChild);
      window.setTimeout(() => line.remove(), 6000);
    },
    banner(title, sub, ms) {
      showBanner(title, sub, ms);
    },
    setPrompt(text) {
      promptEl.textContent = text ?? '';
      promptEl.hidden = !text;
    },
    setCharge(mode, progress, timerLeft, site) {
      if (mode === 'idle') {
        chargeEl.hidden = true;
        return;
      }
      chargeEl.hidden = false;
      if (mode === 'planting') {
        chargeLabel.textContent = `Planting at site ${site}…`;
        chargeBar.style.width = `${Math.round(progress * 100)}%`;
      } else if (mode === 'planted') {
        chargeLabel.textContent = `Charge planted at site ${site} — ${Math.ceil(timerLeft)}s`;
        chargeBar.style.width = `${Math.max(0, (timerLeft / 35) * 100)}%`;
      } else if (mode === 'defused') {
        chargeLabel.textContent = 'Charge defused';
        chargeBar.style.width = '0%';
      } else if (mode === 'exploded') {
        chargeLabel.textContent = 'Charge detonated';
        chargeBar.style.width = '0%';
      }
    },
    showBuy(items, money) {
      buyEl.hidden = false;
      buyList.innerHTML = '';
      for (const item of items) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'buy-row';
        row.disabled = item.owned || money < item.price;
        row.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.name}</span><span class="buy-state">${item.owned ? 'OWNED' : '$' + item.price}</span>`;
        row.addEventListener('click', () => onBuy(item));
        buyList.appendChild(row);
      }
    },
    hideBuy() {
      buyEl.hidden = true;
    },
    drawMinimap(fighters, sites, chargeMode, chargeSite) {
      const w = mapCanvas.width;
      const h = mapCanvas.height;
      const toX = (x) => ((x + 24) / 48) * w;
      const toY = (z) => ((z + 16) / 32) * h;
      mapCtx.clearRect(0, 0, w, h);
      mapCtx.fillStyle = 'rgba(12, 10, 8, 0.72)';
      mapCtx.fillRect(0, 0, w, h);
      mapCtx.strokeStyle = '#5c5148';
      mapCtx.strokeRect(1, 1, w - 2, h - 2);
      for (const site of Object.values(sites)) {
        const active = chargeMode === 'planted' && chargeSite === site.name;
        mapCtx.fillStyle = active ? '#e8632c' : site.name === 'A' ? '#7a3b2e' : '#2e6f6a';
        mapCtx.globalAlpha = active ? 1 : 0.55;
        mapCtx.fillRect(toX(site.center.x - site.half), toY(site.center.z - site.half), (site.half * 2 / 48) * w, (site.half * 2 / 32) * h);
        mapCtx.globalAlpha = 1;
        mapCtx.fillStyle = '#f2ead9';
        mapCtx.font = 'bold 11px system-ui, sans-serif';
        mapCtx.textAlign = 'center';
        mapCtx.fillText(site.name, toX(site.center.x), toY(site.center.z) + 4);
      }
      for (const fighter of fighters) {
        // Only the player's own team shows: enemy positions are earned
        // by sight and sound, never given away by the map.
        if (!fighter.alive || fighter.side === 'ashguard') continue;
        mapCtx.fillStyle = fighter.isPlayer ? '#ffffff' : '#57b8a2';
        mapCtx.beginPath();
        mapCtx.arc(toX(fighter.position.x), toY(fighter.position.z), fighter.isPlayer ? 4 : 3, 0, Math.PI * 2);
        mapCtx.fill();
      }
    },
    showOverlay(kind, score, matchWinner) {
      overlayEl.hidden = false;
      if (kind === 'start') {
        overlayTitle.textContent = 'Ember Line';
        overlayCopy.textContent = 'Foundry 9 — plant the charge at Furnace or Dock, or eliminate the Ashguard. Click to play.';
        playBtn.textContent = 'Click to play';
      } else if (kind === 'paused') {
        overlayTitle.textContent = 'Paused';
        overlayCopy.textContent = 'The foundry waits. Click to return.';
        playBtn.textContent = 'Resume';
      } else if (kind === 'match') {
        overlayTitle.textContent = `${matchWinner} take the match`;
        overlayCopy.textContent = 'First to 5 rounds. The foundry resets — click to play again.';
        playBtn.textContent = 'Play again';
      } else {
        overlayTitle.textContent = 'Round over';
        overlayCopy.textContent = `Score ${score}. Click to keep playing.`;
        playBtn.textContent = 'Continue';
      }
    },
    hideOverlay() {
      overlayEl.hidden = true;
    },
  };
}
