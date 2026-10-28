/* =====================================================================
   Hit Coins 2 — prototype game logic
   ===================================================================== */

/* ---------- Tunable settings ---------- */
const ANTICIPATION_MS   = 10000; // Last reel spins for at most 10 seconds when 2 coins have landed
const BONUS_BREATH_MS   = 1900;  // pause (coins animate) before the "Congratulations" overlay
const AUTO_SPIN_OPTIONS = [10, 15, 25, 50];
const BONUS_SPIN_GAP_MS = 500;   // wait between one bonus spin and the next (0.5 s)

/* ---------- Symbols ---------- */
const FRUIT_SYMBOLS = ["stars.png", "bells.png", "watermelon.png", "grapes.png", "plum.png", "lemon.png", "orange.png", "cherries.png"];
const SPECIAL_COINS = [ "mini.png", "minor.png", "major.png", "grand.png",];
const NUMBER_COINS  = ["crown_coin.png","coin_1.png", "coin_2.png",  "coin_5.png", "coin_10.png", "coin_15.png"];
const COIN_SYMBOLS  = [...SPECIAL_COINS, ...NUMBER_COINS];
const symbols = ["sevens.png", ...FRUIT_SYMBOLS, ...COIN_SYMBOLS];

/* ---------------------------------------------------------------------
   COIN LANDING math  (MAIN GAME — the 3 coins that trigger the bonus)
   ---------------------------------------------------------------------
   Only used when coins land on the 3x3 reels of the main game.
   Rule: the MIDDLE reel can only ever land the crown coin.            */
const LANDING_MATH = {
  bonusChance: 0.02,            // chance a spin lands 3 coins (bonus). Raised for easy testing.
  singleCoinChance: 0.03,       // per-reel chance of one lone coin on a normal spin
  middleReel: 1,                // index of the middle reel
  middleReelCoin: "crown_coin.png"
};
// Relative chance of each coin landing on the LEFT / RIGHT reels (bigger = more common).
const LANDING_COIN_WEIGHTS = {
  "coin_1.png": 1.5, "coin_2.png": 1.3, "coin_5.png": 1,
  "coin_10.png": 0.8, "coin_15.png": 0.5,
  "crown_coin.png": 1.5,
  "mini.png": 0.3, "minor.png": 0.2, "major.png": 0.1, "grand.png": 0.01
};

/* ---------------------------------------------------------------------
   COIN COLLECTING math  (BONUS PAGE — coins that land while collecting)
   ---------------------------------------------------------------------
   Completely separate from the landing math above.                    */
const COLLECT_MATH = {
  leftCoinChance: 0.09,         // per-box chance a coin lands in the LEFT column
  rightCoinChance: 0.07,        // per-box chance a coin lands in the RIGHT column
  newCollectorChance: 0.10,     // chance a new collector appears in a spin
  maxCollectors: 3
};
// Relative chance of each coin landing in the bonus (bigger = more common).
const COLLECT_COIN_WEIGHTS = {
  "coin_1.png": 1.5, "coin_2.png": 1.3, "coin_5.png": 1,
  "coin_10.png": 0.8, "coin_15.png": 0.5,
  "crown_coin.png": 1.5,
  "mini.png": 0.3, "minor.png": 0.2, "major.png": 0.1, "grand.png": 0.01
};

const PAYOUTS = {
  "sevens.png": 50, "stars.png": 30, "bells.png": 20,
  "watermelon.png": 16, "grapes.png": 16, "plum.png": 4,
  "lemon.png": 4, "orange.png": 4, "cherries.png": 1
};
const BET_AMOUNTS = [
  2, 4, 6, 8, 10, 16, 20, 40, 60, 80, 100, 140, 160, 200,
  240, 280, 300, 340, 360, 400,
  ...Array.from({length: 30}, (_, i) => 420 + i * 20)
];
const PAYLINES = [
  [[1, 0], [1, 1], [1, 2]], // middle
  [[0, 0], [0, 1], [0, 2]], // top
  [[2, 0], [2, 1], [2, 2]], // bottom
  [[0, 0], [1, 1], [2, 2]], // diagonal down
  [[2, 0], [1, 1], [0, 2]]  // diagonal up
];

/* ---------- Elements ---------- */
const reels = [...document.querySelectorAll(".reel")];
const spinBtn = document.getElementById("spin");
const autoBtn = document.getElementById("autoplay");
const fastBtn = document.getElementById("fast");
const autoCountEl = document.getElementById("autoCount");
const balanceEl = document.getElementById("balance");
const banner = document.getElementById("winBanner");
const toast = document.getElementById("toast");
const betValueEl = document.getElementById("betValue");
const betBtn = document.getElementById("bet");
const game = document.querySelector(".game");

/* ---------- State ---------- */
let balance = 0; // Balance is always updated from the server.
let betAmount = 2;
let spinning = false, fastMode = false;
let auto = false, autoRemaining = 0, autoTimer = null;
let modal = null;            // the one open dialog (bet / auto / settings / bonus)
let celebrating = false;     // true from "3 coins landed" until the bonus overlay is closed
let celebrationTimer = null;
let celebrationFx = [];      // sparkle / ring elements
let activeSpin = null;

/* =====================================================================
   Audio (generated with WebAudio — no sound files needed)
   ===================================================================== */
const GameAudio = (() => {
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : v === "1"; }
      catch (e) { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, value ? "1" : "0"); } catch (e) {} }
  };
  const state = { music: store.get("hc2_music", true), sound: store.get("hc2_sound", true) };
  let ctx = null, sfxBus = null, musicBus = null;
  let musicTimer = null, nextNote = 0, step = 0, unlocked = false;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      sfxBus = ctx.createGain();   sfxBus.gain.value = 0.5;  sfxBus.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.gain.value = 0;  musicBus.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function tone(freq, start, dur, opts = {}) {
    const { type = "sine", vol = 0.3, bus = sfxBus, slideTo = null } = opts;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(vol, start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain); gain.connect(bus);
    osc.start(start); osc.stop(start + dur + 0.03);
  }
  const SFX = {
    click: t => tone(880, t, 0.06, { type: "triangle", vol: 0.22 }),
    spin:  t => tone(220, t, 0.3, { type: "triangle", vol: 0.25, slideTo: 540 }),
    stop:  t => { tone(150, t, 0.15, { vol: 0.5, slideTo: 55 }); tone(900, t, 0.03, { type: "square", vol: 0.06 }); },
    tick:  t => tone(1000, t, 0.04, { type: "square", vol: 0.06 }),
    coin:  t => { tone(1318, t, 0.25, { type: "triangle", vol: 0.3 }); tone(1760, t + 0.07, 0.35, { type: "triangle", vol: 0.25 }); },
    win:   t => [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.09, 0.22, { type: "triangle", vol: 0.3 })),
    bigWin: t => { [659, 784, 988, 1319, 1568, 1319, 1760].forEach((f, i) => tone(f, t + i * 0.11, 0.32, { type: "triangle", vol: 0.34 })); tone(330, t, 0.85, { type: "sine", vol: 0.22 }); },
    bonus: t => { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, t + i * 0.1, 0.35, { type: "triangle", vol: 0.3 })); tone(262, t, 0.9, { vol: 0.25 }); }
  };
  function play(name) {
    if (!state.sound || !ensure()) return;
    if (SFX[name]) SFX[name](ctx.currentTime);
  }

  // A soft looping pentatonic tune.
  const MELODY = [523.25, 659.25, 784, 659.25, 880, 784, 659.25, 587.33,
                  523.25, 659.25, 784, 1046.5, 880, 784, 659.25, 587.33];
  const BASS = [130.81, 110, 87.31, 98];
  function schedule() {
    if (!ctx) return;
    while (nextNote < ctx.currentTime + 0.6) {
      const i = step % 16;
      tone(MELODY[i], nextNote, 0.25, { type: "sine", vol: 0.5, bus: musicBus });
      if (i % 4 === 0) tone(BASS[i / 4], nextNote, 1.0, { type: "triangle", vol: 0.6, bus: musicBus });
      nextNote += 0.28; step++;
    }
  }
  function startMusic() {
    if (!state.music || !unlocked || musicTimer || !ensure()) return;
    nextNote = ctx.currentTime + 0.1;
    musicBus.gain.setTargetAtTime(0.12, ctx.currentTime, 0.08);
    musicTimer = setInterval(schedule, 200);
    schedule();
  }
  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    if (ctx && musicBus) musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.06);
  }

  return {
    get music() { return state.music; },
    get sound() { return state.sound; },
    setMusic(on) { state.music = on; store.set("hc2_music", on); on ? startMusic() : stopMusic(); },
    setSound(on) { state.sound = on; store.set("hc2_sound", on); },
    play,
    // Browsers only allow audio after a tap, so we start on the first tap.
    unlock() { unlocked = true; ensure(); startMusic(); },
    pause() { stopMusic(); },
    resume() { startMusic(); }
  };
})();

document.addEventListener("pointerdown", () => GameAudio.unlock(), { once: true });
document.addEventListener("visibilitychange", () => document.hidden ? GameAudio.pause() : GameAudio.resume());

/* =====================================================================
   Helpers
   ===================================================================== */
const money = n => "ETB " + Number(n).toFixed(2);
const isCoin = name => COIN_SYMBOLS.includes(name);

const symbolPreloads = symbols.map(name => {
  const image = new Image();
  image.onerror = () => console.error("[Hit Coins 2] Failed to preload symbol asset:", image.src);
  image.src = "assets/" + name;
  return image;
});

/* Startup gate: decode every local image before revealing the game. */
const BOOT_ASSET_MANIFEST = ["bells.png", "bonus_bg.png", "cherries.png", "clean-background.png", "coin_1.png", "coin_10.png", "coin_15.png", "coin_2.png", "coin_5.png", "crown_coin.png", "grand.png", "grapes.png", "lemon.png", "major.png", "mini.png", "minor.png", "orange.png", "plum.png", "reference-background.png", "reference-symbol-sheet.png", "sevens.png", "stars.png", "watermelon.png"];
let bootAssetsReady = false;
let bootServerReady = false;
let bootStarted = false;
let bootFailedAssets = [];
let bootLoadToken = 0;
function setBootCheck(id, state, detail, label) {
  const row = document.getElementById(id);
  if (!row) return;
  row.classList.toggle("is-ready", state === "ready");
  row.classList.toggle("is-error", state === "error");
  const icon = row.querySelector(".startup-check-icon");
  const small = row.querySelector("small");
  const em = row.querySelector("em");
  if (icon) icon.textContent = state === "ready" ? "✓" : state === "error" ? "!" : "◌";
  if (small && detail) small.textContent = detail;
  if (em && label) em.textContent = label;
}
function updateBootProgress(done, total, label) {
  const percent = total ? Math.round(done / total * 100) : 0;
  const fill = document.getElementById("startupProgressFill");
  const value = document.getElementById("startupProgressPercent");
  const text = document.getElementById("startupProgressLabel");
  const detail = document.getElementById("startupAssetsDetail");
  if (fill) fill.style.width = percent + "%";
  if (value) value.textContent = percent + "%";
  if (text) text.textContent = label || "Loading game assets…";
  if (detail) detail.textContent = `${done} of ${total} graphics loaded and decoded`;
}
function updateBootServer(connected) {
  bootServerReady = Boolean(connected);
  setBootCheck("startupServerCheck", bootServerReady ? "ready" : "waiting",
    bootServerReady ? "Live game server connection established" : "Waiting for a live game server connection",
    bootServerReady ? "CONNECTED" : "CONNECTING");
  if (!bootServerReady) {
    const retry = document.getElementById("startupRetry");
    if (retry && bootAssetsReady) retry.hidden = false;
  }
  tryFinishBoot();
}
function tryFinishBoot() {
  // Enter the game as soon as assets are ready. Socket can connect in the background.
  if (!bootAssetsReady) return;
  const screen = document.getElementById("startupScreen");
  if (!screen || screen.classList.contains("is-leaving")) return;
  const label = document.getElementById("startupProgressLabel");
  if (label) {
    label.textContent = bootServerReady
      ? "Everything is ready — entering game…"
      : "Graphics ready — connecting to server…";
  }
  screen.classList.add("is-leaving");
  window.setTimeout(() => {
    screen.hidden = true;
    document.body.classList.add("game-ready");
    if (!bootServerReady) showToast("Connecting to game server…");
  }, 650);
}
async function preloadBootAssets() {
  if (bootStarted) return;
  bootStarted = true;
  const token = ++bootLoadToken;
  const retry = document.getElementById("startupRetry");
  if (retry) retry.hidden = true;
  bootFailedAssets = [];
  bootAssetsReady = false;
  setBootCheck("startupAssetsCheck", "waiting", "Loading and decoding graphics", "LOADING");
  updateBootProgress(0, BOOT_ASSET_MANIFEST.length, "Preparing game graphics…");
  let done = 0;
  const failures = [];
  await Promise.all(BOOT_ASSET_MANIFEST.map(async (name) => {
    try {
      const image = new Image();
      image.decoding = "async";
      image.src = "assets/" + name;
      if (typeof image.decode === "function") {
        await image.decode();
      } else {
        await new Promise((resolve, reject) => {
          if (image.complete && image.naturalWidth > 0) return resolve();
          image.onload = resolve;
          image.onerror = reject;
        });
      }
      if (!image.naturalWidth) throw new Error("Image has no decoded pixels");
    } catch (err) {
      failures.push(name);
      console.error("[Hit Coins 2] Startup asset failed:", name, err);
    } finally {
      done++;
      if (token === bootLoadToken) updateBootProgress(done, BOOT_ASSET_MANIFEST.length, "Preparing game graphics…");
    }
  }));
  if (token !== bootLoadToken) return;
  bootFailedAssets = failures;
  if (failures.length) {
    setBootCheck("startupAssetsCheck", "error", `${failures.length} graphic${failures.length === 1 ? "" : "s"} could not load`, "RETRY NEEDED");
    updateBootProgress(done - failures.length, BOOT_ASSET_MANIFEST.length, "Some graphics could not be loaded.");
    const retryButton = document.getElementById("startupRetry");
    if (retryButton) { retryButton.hidden = false; retryButton.textContent = "Retry missing assets"; }
    return;
  }
  bootAssetsReady = true;
  setBootCheck("startupAssetsCheck", "ready", `${BOOT_ASSET_MANIFEST.length} graphics loaded and decoded`, "READY");
  updateBootProgress(BOOT_ASSET_MANIFEST.length, BOOT_ASSET_MANIFEST.length, "Graphics ready — checking live server…");
  const retryButton = document.getElementById("startupRetry");
  if (retryButton) retryButton.hidden = bootServerReady;
  tryFinishBoot();
}
function retryStartup() {
  if (bootFailedAssets.length) {
    bootStarted = false;
    preloadBootAssets();
  }
  if (!hc2Socket && typeof window.io === "function") connectHC2();
  else if (!hc2Socket && typeof window.io !== "function") { window.location.reload(); return; }
  if (hc2Socket && !hc2Socket.connected) hc2Socket.connect();
  updateBootServer(Boolean(hc2Socket && hc2Socket.connected));
  const retry = document.getElementById("startupRetry");
  if (retry && !bootFailedAssets.length && !bootServerReady) {
    retry.hidden = true;
    const label = document.getElementById("startupProgressLabel");
    if (label) label.textContent = "Reconnecting to live server…";
  }
}
document.getElementById("startupRetry")?.addEventListener("click", retryStartup);

function pickWeightedSymbol() {
  const entries = [
    ["sevens.png", 1], ["stars.png", 2], ["bells.png", 3],
    ["watermelon.png", 5], ["grapes.png", 5],
    ["plum.png", 6], ["lemon.png", 8], ["orange.png", 8], ["cherries.png", 16]
  ];
  const total = entries.reduce((sum, item) => sum + item[1], 0);
  let value = Math.random() * total;
  for (const [name, weight] of entries) {
    value -= weight;
    if (value < 0) return name;
  }
  return "lemon.png";
}
function pickWeightedCoin(weights) {
  const total = COIN_SYMBOLS.reduce((sum, name) => sum + (weights[name] || 1), 0);
  let value = Math.random() * total;
  for (const name of COIN_SYMBOLS) {
    value -= (weights[name] || 1);
    if (value < 0) return name;
  }
  return COIN_SYMBOLS[0];
}
// MAIN GAME landing coin. The middle reel only ever gets the crown coin.
function pickLandingCoin(reelIndex) {
  if (reelIndex === LANDING_MATH.middleReel) return LANDING_MATH.middleReelCoin;
  return pickWeightedCoin(LANDING_COIN_WEIGHTS);
}
// BONUS collecting coin (its own weights, not shared with the main game).
function pickCollectCoin() {
  return pickWeightedCoin(COLLECT_COIN_WEIGHTS);
}
function symbolImg(name) {
  const img = document.createElement("img");
  img.className = "symbol";
  img.src = "assets/" + name;
  img.alt = name.replace(/\.(png|svg)$/i, "");
  img.draggable = false;
  img.onerror = () => {
    console.error("[Hit Coins 2] Failed to load symbol asset:", img.src);
    img.onerror = null;
    img.src = "assets/coin_1.png";
    img.alt = "gold coin fallback";
  };
  return img;
}
function setReelSymbols(reel, names) {
  const box = reel.querySelector(".symbols");
  box.classList.remove("is-strip");
  box.style.removeProperty("--cell-h");
  box.replaceChildren(...names.map(symbolImg));
}

/* ---------- Continuous reel strip via rAF (reliable motion, not CSS-var keyframes) ---------- */
const REEL_STRIP_LEN = 24;
function cellHeight(reel) {
  const box = reel.querySelector(".symbols");
  const h = (box && box.clientHeight) || reel.clientHeight || 120;
  return Math.max(28, Math.floor(h / 3));
}
function buildReelStrip(names, cellH) {
  const strip = document.createElement("div");
  strip.className = "reel-strip";
  names.forEach(n => {
    const img = symbolImg(n);
    img.style.cssText = `height:${cellH}px;min-height:${cellH}px;max-height:${cellH}px;flex:0 0 ${cellH}px;width:88%;object-fit:contain;`;
    strip.appendChild(img);
  });
  return strip;
}
function stopReelRaf(session, reelIndex) {
  if (!session || !session.raf) return;
  if (session.raf[reelIndex]) {
    cancelAnimationFrame(session.raf[reelIndex]);
    session.raf[reelIndex] = null;
  }
}
function startReelStripSpin(reel, reelIndex, session) {
  const box = reel.querySelector(".symbols");
  stopReelRaf(session, reelIndex);
  let cellH = cellHeight(reel);
  if (cellH < 30) cellH = 48;
  box.classList.add("is-strip");
  const names = [];
  for (let i = 0; i < REEL_STRIP_LEN; i++) {
    const teasing = session.anticipating && reelIndex === session.third;
    names.push(teasing && Math.random() < 0.22 ? pickLandingCoin(reelIndex) : pickWeightedSymbol());
  }
  // Long strip so motion is obvious
  names.push(...names.slice(0, 9));
  const strip = buildReelStrip(names, cellH);
  strip.style.cssText = "display:flex;flex-direction:column;align-items:center;width:100%;will-change:transform;animation:none;";
  box.replaceChildren(strip);
  reel.classList.add("spinning-reel");

  // Pixels per second — clearly visible vertical scroll
  let speed = fastMode ? 1200 : 700;
  if (session.anticipating && reelIndex === session.third) speed = 1700;
  let offset = 0;
  let last = performance.now();
  if (!session.raf) session.raf = [null, null, null];

  const tick = (now) => {
    if (!session || session.landed[reelIndex] || session.finished) return;
    if (!reel.classList.contains("spinning-reel")) return;
    if (!strip.isConnected) return;
    const dt = Math.min(48, now - last);
    last = now;
    offset += speed * (dt / 1000);

    // Loop only after one complete cycle of the reel strip. 
    const cycleHeight = REEL_STRIP_LEN * cellH;
    if (offset >= cycleHeight) offset %= cycleHeight;
       strip.style.transform = "translate3d(0," + (-offset) + "px,0)";
    session.raf[reelIndex] = requestAnimationFrame(tick);
  };
  session.raf[reelIndex] = requestAnimationFrame(tick);
}
function stopReelStrip(reel, finalNames, session, reelIndex) {
  if (session) stopReelRaf(session, reelIndex);
  const box = reel.querySelector(".symbols");
  reel.classList.remove("spinning-reel", "anticipate-reel");
  const old = box.querySelector(".reel-strip");
  if (old) {
    old.style.animation = "none";
    old.style.transform = "none";
    old.remove();
  }
  box.classList.remove("is-strip");
  // Final result once — same symbols the server sent
  box.replaceChildren(...finalNames.map(symbolImg));
  box.querySelectorAll(".symbol").forEach(img => {
    img.classList.add("symbol-pop");
    img.addEventListener("animationend", () => img.classList.remove("symbol-pop"), { once: true });
  });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => toast.classList.remove("show"), 1800);
}

/* ---------- Haptics + press feedback ---------- */
function haptic(ms = 12) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
}
function updateBalance() { balanceEl.textContent = balance.toFixed(2); }
function updateBet() { betValueEl.textContent = betAmount.toFixed(2); }
function updateAutoBadge() {
  autoBtn.classList.toggle("active", auto);
  autoCountEl.textContent = auto ? String(autoRemaining) : "";
}

/* ---------- Live clock in the footer ---------- */
const clockEl = document.getElementById("clock");
function tickClock() {
  const d = new Date();
  const text = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  if (clockEl.textContent !== text) {
    clockEl.textContent = text;
    clockEl.setAttribute("datetime", text);
  }
}
tickClock();
setInterval(tickClock, 1000);

/* =====================================================================
   Grid generation + payline evaluation
   ===================================================================== */
function makeFinalGrid() {
  const grid = Array.from({length: 3}, () => Array(3).fill(null)); // grid[row][reel]
  // Coin bonus: three coins can appear anywhere on the 3x3 board, but never
  // more than one coin in any vertical reel. They do not need to form a payline.
  const bonus = Math.random() < LANDING_MATH.bonusChance;
  const bonusRows = bonus
    ? [Math.floor(Math.random() * 3), Math.floor(Math.random() * 3), Math.floor(Math.random() * 3)]
    : [-1, -1, -1];

  for (let reel = 0; reel < 3; reel++) {
    const coinRow = bonus ? bonusRows[reel] : (Math.random() < LANDING_MATH.singleCoinChance ? Math.floor(Math.random() * 3) : -1);
    for (let row = 0; row < 3; row++) {
      grid[row][reel] = row === coinRow ? pickLandingCoin(reel) : pickWeightedSymbol();
    }
  }
  return grid;
}
function gridToReelSets(grid) {
  return reels.map((_, reelIndex) => [grid[0][reelIndex], grid[1][reelIndex], grid[2][reelIndex]]);
}
function hasCoinBonus(grid) {
  // Count every coin on the whole 3x3 board, regardless of direction/payline.
  return grid.flat().filter(isCoin).length >= 3;
}
function evaluatePaylines(grid) {
  const wins = [];
  for (const line of PAYLINES) {
    const lineSymbols = line.map(([row, reel]) => grid[row][reel]);
    const nonWild = lineSymbols.filter(name => name !== "sevens.png");
    if (lineSymbols.some(isCoin)) continue;
    const target = nonWild[0] || "sevens.png";
    if (!lineSymbols.every(name => name === target || name === "sevens.png")) continue;
    if (!PAYOUTS[target]) continue;
    // Three 777 symbols use the 777 multiplier; 777 substitutes for a fruit.
    const multiplier = PAYOUTS[target];
    wins.push({symbol: target, multiplier, amount: betAmount * multiplier, line});
  }
  return wins;
}

/* =====================================================================
   Dialog helpers
   ===================================================================== */
function openModal(html, extraClass = "") {
  closeModal();
  modal = document.createElement("div");
  modal.className = "game-overlay";
  modal.innerHTML = `<section class="game-dialog ${extraClass}" role="dialog" aria-modal="true" aria-labelledby="dlgTitle">${html}</section>`;
  game.appendChild(modal);
  return modal;
}
function closeModal() {
  if (modal) { modal.remove(); modal = null; }
}

/* ---------- Coin Collection bonus (full-page, collectors in middle) ---------- */
const BONUS_COIN_VALUES = {
  "coin_1.png": 1, "coin_2.png": 2, 
  "coin_5.png": 5, "coin_10.png": 10, "coin_15.png": 15,
  "crown_coin.png": 1,
  "mini.png": 25, "minor.png": 50, "major.png": 150, "grand.png": 1000
};

const bonusPage        = document.getElementById("bonusPage");
const leftColumnEl     = document.getElementById("leftColumn");
const midColumnEl      = document.getElementById("midColumn");
const rightColumnEl    = document.getElementById("rightColumn");
const respinsEl        = document.getElementById("respinsCount");
const bonusTotalEl     = document.getElementById("bonusTotal");
const bonusSpinBtn     = document.getElementById("bonusSpinBtn");
const bonusCollectBtn  = document.getElementById("bonusCollectBtn");
const bonusTotalWrap   = bonusTotalEl ? bonusTotalEl.closest(".bonus-total") : null;

let bonusState = null;

function clearCelebrationFx() {
  celebrationFx.forEach(el => el.remove());
  celebrationFx = [];
  game.classList.remove("coin-spotlight");
  game.querySelectorAll(".coin-hit, .coin-wait").forEach(el => el.classList.remove("coin-hit", "coin-wait"));
}

function showBonusOverlay(coinNames, session) {
  clearCelebrationFx();
  closeModal();
  openModal(`
    <div class="bonus-coins">${coinNames.map((n,i)=>`<img class="bonus-coin-img" style="animation-delay:${i*0.12}s" src="assets/${n}" alt="coin">`).join("")}</div>
    <h2 id="dlgTitle">CONGRATULATIONS!</h2>
    <p>COIN BONUS UNLOCKED</p>
    <p class="dialog-note">3 re-spins. Coins add to every active collector then clear. Empty collector slots spin to add new collectors.</p>
    <button type="button" class="dialog-primary" id="startCoinBonus">CONTINUE</button>`, "bonus-dialog");
  GameAudio.play("bonus");
  modal.querySelector("#startCoinBonus").addEventListener("click", () => {
    closeModal();
    startCoinCollection(session);
  });
}

/**
 * Collector bonus:
 * - Middle: permanent collectors (start with 1). Existing ones never spin.
 *   Empty collector slots DO spin — that is how a new collector is added.
 * - Left/right: temporary coins. Land → add value to all active collectors → remove.
 * - Respins start at 3; any coin OR new collector resets to 3.
 * - Auto-start first spin. 3s breath after each spin before next.
 * - Tap stop while spinning → reveal immediately.
 * - TOTAL label hidden during play; shown only on final win overlay.
 */
function startCoinCollection(session) {
  // The coins that landed in the main game (the 3 trigger coins) are added to the FIRST collector.
  const landedValue = session && session.finalSets
    ? session.finalSets.flat().filter(isCoin).reduce((sum, name) => sum + (BONUS_COIN_VALUES[name] || 1), 0)
    : 0;
  bonusState = {
    left: [null, null, null],
    right: [null, null, null],
    collectors: [landedValue],
    serverSpins: session && session.serverBonus ? session.serverBonus.spins.slice() : [],
    serverSpinIndex: 0,
    serverMultiplier: session && session.serverBonus ? Number(session.serverBonus.multiplier) : 0,
    serverPayout: session && session.serverBonus ? Number(session.serverBonus.multiplier) * betAmount : 0,
    respins: 3,
    animating: false,
    revealing: false,
    timer: null,
    autoReturnTimer: null,
    pending: null,
    total: 0,
    finished: false
  };
  game.classList.add("bonus-active");
  bonusPage.hidden = false;
  bonusPage.setAttribute("aria-hidden", "false");
  // Keep TOTAL visible so the player sees the build-up
  if (bonusTotalWrap) bonusTotalWrap.style.display = "";
  bonusCollectBtn.hidden = true;
  renderCollectorBoard();
  // Show the landed coins' value arriving in the first collector.
  if (landedValue > 0 && midColumnEl.children[0]) {
    const first = midColumnEl.children[0];
    first.classList.add("value-bump");
    first.insertAdjacentHTML("beforeend", `<span class="collector-gain">+${landedValue}</span>`);
  }
  updateBonusUI();
  bonusSpinBtn.disabled = false;
  bonusSpinBtn.classList.remove("spinning");
  // Auto-start first spin
  setTimeout(() => {
    if (bonusState && !bonusState.animating && !bonusState.finished) beginCollectionSpin();
  }, 500);
}

function randomSpinStrip() {
  const items = [];
  for (let i = 0; i < 5; i++) {
    if (Math.random() < 0.22) {
      items.push(`<div class="strip-empty"></div>`);
    } else {
      const n = COIN_SYMBOLS[Math.floor(Math.random() * COIN_SYMBOLS.length)];
      const val = BONUS_COIN_VALUES[n] || 1;
      items.push(`<div class="strip-item"><img src="assets/${n}" alt=""><span class="strip-label">x${val}</span></div>`);
    }
  }
  items.push(items[0]); // clone of the first symbol => seamless loop
  return items.join("");
}

/** Collector spin strip: uses an existing coin asset (gold_coin.png is not in the manifest). */
function randomCollectorStrip() {
  const items = [];
  for (let i = 0; i < 5; i++) {
    if (Math.random() < 0.3) {
      items.push(`<div class="strip-empty"></div>`);
    } else {
      items.push(`<div class="strip-item"><img src="assets/crown_coin.png" alt=""><span class="strip-label">+</span></div>`);
    }
  }
  items.push(items[0]);
  return items.join("");
}

function coinCellHtml(cell, spinning) {
  if (spinning) {
    return `<div class="bonus-cell spinning"><div class="cell-strip">${randomSpinStrip()}</div></div>`;
  }
  if (!cell) return `<div class="bonus-cell empty"></div>`;
  return `<div class="bonus-cell has-coin">
    <img src="assets/${cell.name}" alt="coin">
    <span class="coin-label">x${cell.value}</span>
  </div>`;
}

function collectorCellHtml(value, spinning, isNew) {
  if (spinning) {
    return `<div class="collector-cell spinning"><div class="cell-strip">${randomCollectorStrip()}</div></div>`;
  }
  if (value == null) {
    return `<div class="collector-cell empty"><span class="collector-placeholder">COLLECTOR</span></div>`;
  }
  const cls = isNew ? "collector-cell active new-flash" : "collector-cell active";
  // Use crown coin so collectors read differently from the numbered prize coins
  return `<div class="${cls}">
    <img src="assets/crown_coin.png" alt="collector">
    <b class="collector-value">${value}</b>
  </div>`;
}

function renderCollectorBoard(opts = {}) {
  if (!bonusState) return;
  const b = bonusState;
  // Static render only. Spinning is driven cell-by-cell by the spin sequencer,
  // so re-rendering can never restart or flicker a spinning strip.
  if (!opts.preserveSide) {
    leftColumnEl.innerHTML  = b.left.map(c => coinCellHtml(c, false)).join("");
    rightColumnEl.innerHTML = b.right.map(c => coinCellHtml(c, false)).join("");
  }
  const numCollectors = b.collectors.length;
  midColumnEl.innerHTML = [0,1,2].map(i =>
    i < numCollectors
      ? collectorCellHtml(b.collectors[i], false, opts.newCollectorIndex === i)
      : collectorCellHtml(null, false, false)
  ).join("");
}

function updateBonusUI() {
  if (!bonusState) return;
  const b = bonusState;
  respinsEl.textContent = b.respins;
  b.total = b.collectors.reduce((s, v) => s + v, 0);
  // Always show and update the running total
  if (bonusTotalEl) bonusTotalEl.textContent = b.total;
  if (bonusTotalWrap) bonusTotalWrap.style.display = "";

  if (b.finished) {
    bonusSpinBtn.disabled = true;
    // Let the player collect / exit immediately instead of only waiting for the auto timer
    bonusCollectBtn.hidden = false;
    return;
  }
  const done = b.respins <= 0 && !b.animating;
  const stoppable = b.animating && !b.holding;   // STOP is only valid while reels are still moving
  bonusSpinBtn.disabled = done || !!b.holding;
  // Collect only appears when the bonus is finished
  bonusCollectBtn.hidden = true;
  bonusSpinBtn.classList.toggle("spinning", stoppable);
  const icon = bonusSpinBtn.querySelector(".bonus-spin-icon");
  if (icon) icon.textContent = stoppable ? "■" : "⟳";
}

function makeCollectionOutcome() {
  const b = bonusState;
  const source = b && b.serverSpins && b.serverSpins[b.serverSpinIndex++];
  if (!source) return { left:[null,null,null], right:[null,null,null], addCollector:false };
  return {
    left: source.left.map(x => x ? { name:x.name, value:Number(x.value) } : null),
    right: source.right.map(x => x ? { name:x.name, value:Number(x.value) } : null),
    addCollector: !!source.addCollector
  };
}

/* ---------- Bonus spin sequencer ----------
 * Order: LEFT column spins -> stops (top to bottom, one box after another) ->
 *        MIDDLE column starts (only its empty collector slots) -> stops ->
 *        RIGHT column starts -> stops.
 * Each box shows ONE symbol at a time. Tapping the button while any reel is still
 * moving stops everything at once and shows the result of that spin; the result is
 * held for a second and only then added to the collectors.
 */
const BONUS_COLUMNS = ["left", "mid", "right"];
const bonusTiming = () => fastMode
  ? { spin: 520,  gap: 190, between: 150, hold: 800  }
  : { spin: 1000, gap: 360, between: 280, hold: 1000 };

function bonusColumnEl(name) {
  return name === "left" ? leftColumnEl : name === "right" ? rightColumnEl : midColumnEl;
}
/** Which boxes of a column take part in the spin. Existing collectors never spin. */
function bonusSpinCells(name) {
  const b = bonusState;
  if (name === "mid") {
    const cells = [];
    for (let i = b.spinCollectors; i < 3; i++) cells.push(i);
    return cells;
  }
  return [0, 1, 2];
}
function setBonusCellSpinning(name, idx) {
  const col = bonusColumnEl(name);
  const cell = col.children[idx];
  if (!cell) return;
  cell.outerHTML = name === "mid" ? collectorCellHtml(null, true, false) : coinCellHtml(null, true);
}
/** Stop one box on its final result. `order` staggers boxes when a tap stops everything at once. */
function settleBonusCell(name, idx, order = 0) {
  const b = bonusState;
  if (!b || b.settled[name][idx]) return;
  b.settled[name][idx] = true;
  const col = bonusColumnEl(name);
  const cell = col.children[idx];
  if (!cell) return;
  const out = b.pending;
  let landed = false;

  if (name === "mid") {
    // Only the first empty slot can become a new collector.
    if (out.addCollector && b.newCollectorIdx < 0 && idx === b.spinCollectors) {
      b.newCollectorIdx = idx;
      b.collectors.push(0);
      cell.outerHTML = collectorCellHtml(0, false, true);
      landed = true;
    } else {
      cell.outerHTML = collectorCellHtml(null, false, false);
    }
  } else {
    const coin = out[name][idx];
    b[name][idx] = coin;
    cell.outerHTML = coinCellHtml(coin, false);
    if (coin) {
      b.coinSum += coin.value;
      b.anyCoin = true;
      landed = true;
    }
  }
  const fresh = col.children[idx];
  if (fresh) {
    fresh.classList.add("settle");
    if (order) fresh.style.setProperty("--settle-delay", (order * 70) + "ms");
    if (landed) fresh.classList.add("landed-flash");
  }
  if (!order) GameAudio.play(landed ? "coin" : "stop");
}

function beginCollectionSpin() {
  const b = bonusState;
  if (!b || b.animating || b.respins <= 0 || b.finished) return;
  clearTimeout(b.timer);
  b.pending = makeCollectionOutcome();
  b.left = [null, null, null];
  b.right = [null, null, null];
  b.spinCollectors = b.collectors.length;      // collectors that exist when this spin starts
  b.settled = { left: [false,false,false], mid: [false,false,false], right: [false,false,false] };
  b.coinSum = 0;
  b.anyCoin = false;
  b.newCollectorIdx = -1;
  b.skipped = false;
  b.holding = false;
  renderCollectorBoard();                      // clean idle board: nothing spins yet
  b.animating = true;
  bonusPage.style.setProperty("--reel-speed", fastMode ? "0.5s" : "0.72s");
  updateBonusUI();
  GameAudio.play("spin");
  runBonusColumn(0);
}

/** Start one column, then stop its boxes one after another. */
function runBonusColumn(ci) {
  const b = bonusState;
  if (!b || b.finished || b.skipped) return;
  if (ci >= BONUS_COLUMNS.length) { endBonusSpin(); return; }
  const name = BONUS_COLUMNS[ci];
  const cells = bonusSpinCells(name);
  if (!cells.length) { runBonusColumn(ci + 1); return; }   // e.g. all 3 collectors already exist
  const t = bonusTiming();
  cells.forEach(i => setBonusCellSpinning(name, i));
  const stopAt = k => {
    if (bonusState !== b || b.skipped) return;
    settleBonusCell(name, cells[k]);
    if (k + 1 < cells.length) b.timer = setTimeout(() => stopAt(k + 1), t.gap);
    else b.timer = setTimeout(() => runBonusColumn(ci + 1), t.between);
  };
  b.timer = setTimeout(() => stopAt(0), t.spin);
}

/** Tap while spinning: stop every box now and show this spin's result. */
function skipCollectionSpin() {
  const b = bonusState;
  if (!b || !b.animating || b.holding || b.finished) return;
  b.skipped = true;
  clearTimeout(b.timer);
  let order = 1;
  BONUS_COLUMNS.forEach(name => {
    bonusSpinCells(name).forEach(i => { if (!b.settled[name][i]) settleBonusCell(name, i, order++); });
  });
  GameAudio.play(b.anyCoin || b.newCollectorIdx >= 0 ? "coin" : "stop");
  endBonusSpin();
}

/** All boxes stopped: hold the result, then add it to the collectors. */
function endBonusSpin() {
  const b = bonusState;
  if (!b || b.finished || b.holding) return;
  b.holding = true;
  const gotSomething = b.anyCoin || b.newCollectorIdx >= 0;
  b.respins = gotSomething ? 3 : Math.max(0, b.respins - 1);
  updateBonusUI();
  if (!b.skipped) GameAudio.play(gotSomething ? "coin" : "stop");
  const t = bonusTiming();

  // Players see the result for a moment BEFORE any value is added.
  b.timer = setTimeout(() => {
    if (bonusState !== b) return;
    if (b.coinSum > 0) {
      // Every collector takes the coins — including a NEW collector that appeared in this same spin.
      for (let i = 0; i < b.collectors.length; i++) {
        b.collectors[i] = +(b.collectors[i] + b.coinSum).toFixed(2);
      }
      // coins fly into the collectors
      [leftColumnEl, rightColumnEl].forEach(col =>
        Array.from(col.children).forEach(c => { if (c.classList.contains("has-coin")) c.classList.add("coin-collect"); }));
    }
    // Update collectors only; side cells are kept so the coins can animate out.
    renderCollectorBoard({ preserveSide: true, newCollectorIndex: b.newCollectorIdx });
    if (b.coinSum > 0) {
      for (let i = 0; i < b.collectors.length; i++) {
        const el = midColumnEl.children[i];
        if (!el) continue;
        el.classList.add("value-bump");
        el.insertAdjacentHTML("beforeend", `<span class="collector-gain">+${b.coinSum}</span>`);
      }
      GameAudio.play("coin");
      haptic(12);
      // Escalating spectacle as the pot grows
      if (b.coinSum >= 10 || b.total >= 50) spawnCoinShower(Math.min(18, 8 + Math.floor(b.coinSum / 5)));
    }
    updateBonusUI();

    b.timer = setTimeout(() => {
      if (bonusState !== b) return;
      b.left = [null, null, null];
      b.right = [null, null, null];
      b.animating = false;
      b.holding = false;
      renderCollectorBoard();
      updateBonusUI();
      if (b.respins <= 0) {
        b.timer = setTimeout(() => autoFinishCollection(), 800);
      } else {
        b.timer = setTimeout(() => {
          if (bonusState && !bonusState.animating && !bonusState.finished) beginCollectionSpin();
        }, BONUS_SPIN_GAP_MS);
      }
    }, b.coinSum > 0 ? 650 : 250);
  }, gotSomething ? t.hold : 450);
}

function autoFinishCollection() {
  const b = bonusState;
  if (!b || b.finished) return;
  b.finished = true;
  b.animating = false;
  clearTimeout(b.timer);

  const multiplier = b.serverMultiplier;
  const payout = b.serverPayout;
  updateBonusUI();

  showBonusWinOverlay(multiplier, payout);
  GameAudio.play("bigWin");

  b.autoReturnTimer = setTimeout(() => exitBonusToMain(), 5000);
}

function showBonusWinOverlay(multiplier, payout) {
  const old = bonusPage.querySelector(".bonus-win-overlay");
  if (old) old.remove();
  const el = document.createElement("div");
  el.className = "bonus-win-overlay";
  el.innerHTML = `
    <div class="bonus-win-card">
      <h2>YOU WIN!</h2>
      <p class="win-mult">×${multiplier}</p>
      <p class="win-amount">${money(payout)}</p>
      <p class="win-note">Returning to game…</p>
    </div>`;
  bonusPage.appendChild(el);
}

function exitBonusToMain() {
  if (!bonusState) return;
  clearTimeout(bonusState.timer);
  clearTimeout(bonusState.autoReturnTimer);
  const overlay = bonusPage.querySelector(".bonus-win-overlay");
  if (overlay) overlay.remove();
  if (bonusTotalWrap) bonusTotalWrap.style.display = "";
  bonusState = null;
  game.classList.remove("bonus-active");
  bonusPage.hidden = true;
  bonusPage.setAttribute("aria-hidden", "true");
  celebrating = false;
}

function finishCoinCollection() {
  const b = bonusState;
  if (!b) return;
  // If still playing, force the end sequence. If already finished, just exit now.
  if (!b.finished) {
    autoFinishCollection();
  } else {
    clearTimeout(b.autoReturnTimer);
    exitBonusToMain();
  }
}

// STOP button must work while spinning
bonusSpinBtn.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  const b = bonusState;
  if (!b || b.finished) return;
  if (b.animating && !b.holding) {
    skipCollectionSpin();               // stop now, show this spin's result
  } else if (!b.animating && b.respins > 0) {
    clearTimeout(b.timer);
    beginCollectionSpin();              // skip the breather and spin again
  }
  // while the result is being shown (holding) the tap is ignored
});
bonusCollectBtn.addEventListener("click", finishCoinCollection);

// Tag the coin pictures that are on the board and return them.
function markCoins(session, className) {
  const marked = [];
  reels.forEach((reel, i) => {
    if (!session.landed[i]) return;
    const imgs = reel.querySelectorAll(".symbol");
    session.finalSets[i].forEach((name, row) => {
      if (isCoin(name) && imgs[row]) {
        imgs[row].classList.add(className);
        marked.push(imgs[row]);
      }
    });
  });
  return marked;
}
function spawnCoinFx(img) {
  const g = game.getBoundingClientRect();
  const r = img.getBoundingClientRect();
  const cx = ((r.left + r.width / 2) - g.left) / g.width * 100;
  const cy = ((r.top + r.height / 2) - g.top) / g.height * 100;
  const ringSize = Math.min(r.width, r.height) / g.width * 100;

  const ring = document.createElement("span");
  ring.className = "coin-ring";
  ring.style.cssText = `left:${cx}%;top:${cy}%;width:${ringSize}%;`;
  game.appendChild(ring);
  celebrationFx.push(ring);

  for (let k = 0; k < 7; k++) {
    const s = document.createElement("span");
    const angle = (Math.PI * 2 * k) / 7 + Math.random() * 0.5;
    const dist = 7 + Math.random() * 5; // % of game width
    s.className = "sparkle";
    s.textContent = "✦";
    s.style.cssText = `left:${cx}%;top:${cy}%;--dx:${(Math.cos(angle) * dist).toFixed(1)}cqw;--dy:${(Math.sin(angle) * dist).toFixed(1)}cqw;animation-delay:${(k * 0.11).toFixed(2)}s`;
    game.appendChild(s);
    celebrationFx.push(s);
  }
}
// 3 coins: let the player see them (a "breath") before the full-page Hold & Spin.
function celebrateCoins(session) {
  celebrating = true;
  // Ensure every reel shows the real final symbols before we glow them
  reels.forEach((reel, i) => {
    if (session.finalSets && session.finalSets[i]) setReelSymbols(reel, session.finalSets[i]);
  });
  game.classList.remove("coin-wait");
  game.querySelectorAll(".coin-wait").forEach(el => el.classList.remove("coin-wait"));
  game.classList.add("coin-spotlight", "screen-shake");
  setTimeout(() => game.classList.remove("screen-shake"), 600);
  // Mark ALL coins on the board (all 3 reels are landed)
  const coinImgs = markCoins(session, "coin-hit");
  coinImgs.forEach((img, idx) => {
    img.classList.add("coin-land-burst");
    setTimeout(() => spawnCoinFx(img), idx * 80);
  });
  GameAudio.play("bonus");
  haptic([30, 40, 30, 40, 50]);
  const coinNames = session.finalSets.flat().filter(isCoin);
  clearTimeout(celebrationTimer);
  celebrationTimer = setTimeout(() => showBonusOverlay(coinNames, session), BONUS_BREATH_MS);
}

/* ---------- Bet selector ---------- */
function openBetSelector() {
  if (spinning || celebrating) return;
  if (auto) { showToast("Stop Auto spin to change the bet"); return; }
  const affordable = amount => amount <= balance + 1e-9;
  // Keep the current bet if the player can afford it, otherwise the biggest one they can.
  let pendingBet = affordable(betAmount)
    ? betAmount
    : ([...BET_AMOUNTS].reverse().find(affordable) ?? null);
  const anyAffordable = BET_AMOUNTS.some(affordable);

  const options = BET_AMOUNTS.map(amount => {
    const ok = affordable(amount);
    return `<button type="button" class="bet-option${amount === pendingBet ? " selected" : ""}" data-amount="${amount}"${ok ? "" : ' disabled aria-disabled="true"'}>ETB ${amount}</button>`;
  }).join("");

  openModal(`
    <h2 id="dlgTitle">SELECT BET</h2>
    <p class="dialog-sub">Balance: ${money(balance)}</p>
    <div class="bet-options">${options}</div>
    ${anyAffordable ? "" : '<p class="dialog-note">Your balance is lower than the smallest bet.</p>'}
    <div class="dialog-actions">
      <button type="button" class="dialog-secondary" id="cancelBet">Cancel</button>
      <button type="button" class="dialog-primary" id="acceptBet"${pendingBet === null ? " disabled" : ""}>Accept</button>
    </div>`, "bet-dialog");

  const optionsEl = modal.querySelector(".bet-options");
  optionsEl.addEventListener("click", event => {
    const button = event.target.closest("[data-amount]");
    if (!button || button.disabled) return;
    pendingBet = Number(button.dataset.amount);
    optionsEl.querySelectorAll(".bet-option").forEach(item => item.classList.toggle("selected", item === button));
  });
  modal.querySelector("#cancelBet").addEventListener("click", closeModal);
  modal.querySelector("#acceptBet").addEventListener("click", () => {
    if (pendingBet === null) return;
    betAmount = pendingBet;
    updateBet();
    closeModal();
    showToast("Bet set to " + money(betAmount));
  });
}

/* ---------- Auto spin ---------- */
function openAutoSelector() {
  if (spinning || celebrating) { showToast("Wait for the spin to finish"); return; }
  let pendingCount = null;
  const options = AUTO_SPIN_OPTIONS.map(n =>
    `<button type="button" class="bet-option auto-option" data-count="${n}"><b>${n}</b><small>spins</small></button>`).join("");

  openModal(`
    <h2 id="dlgTitle">AUTO SPIN</h2>
    <p class="dialog-sub">Choose how many spins, then press Accept.</p>
    <div class="bet-options auto-options">${options}</div>
    <p class="dialog-note">Bet per spin: ${money(betAmount)}. Auto spin stops if your balance runs out or a coin bonus appears.</p>
    <div class="dialog-actions">
      <button type="button" class="dialog-secondary" id="cancelAuto">Cancel</button>
      <button type="button" class="dialog-primary" id="acceptAuto" disabled>Accept</button>
    </div>`, "bet-dialog");

  const acceptBtn = modal.querySelector("#acceptAuto");
  const optionsEl = modal.querySelector(".bet-options");
  optionsEl.addEventListener("click", event => {
    const button = event.target.closest("[data-count]");
    if (!button) return;
    pendingCount = Number(button.dataset.count);
    optionsEl.querySelectorAll(".bet-option").forEach(item => item.classList.toggle("selected", item === button));
    acceptBtn.disabled = false;
  });
  modal.querySelector("#cancelAuto").addEventListener("click", closeModal);
  acceptBtn.addEventListener("click", () => {
    if (!pendingCount) return;
    closeModal();
    startAuto(pendingCount);
  });
}
function startAuto(count) {
  if (balance < betAmount) { showToast("Not enough balance"); return; }
  auto = true;
  autoRemaining = count;
  updateAutoBadge();
  showToast(`Auto spin: ${count} spins`);
  spin();
}
function stopAuto(message) {
  const wasAuto = auto;
  auto = false;
  autoRemaining = 0;
  clearTimeout(autoTimer);
  updateAutoBadge();
  if (wasAuto && message) showToast(message);
}
function scheduleAuto(delay) {
  clearTimeout(autoTimer);
  autoTimer = setTimeout(function tick() {
    if (!auto || spinning) return;
    if (modal || celebrating) { autoTimer = setTimeout(tick, 500); return; } // wait while a dialog is open
    spin();
  }, delay);
}

/* ---------- Settings / How to play / Winning calculation ---------- */
function openSettings() {
  if (celebrating) return;
  renderSettings("main");
}
function switchRow(icon, label, key, on) {
  return `<div class="setting-row">
    <span class="setting-icon">${icon}</span><span class="setting-label">${label}</span>
    <button type="button" class="switch${on ? " on" : ""}" role="switch" aria-checked="${on}" aria-label="${label}" data-toggle="${key}"><i></i><span>${on ? "ON" : "OFF"}</span></button>
  </div>`;
}
function miniGrid(rows, winRows) {
  return `<div class="mini-grid">${rows.map((row, r) =>
    row.map(name => `<img class="${winRows.includes(r) ? "win" : ""}" src="assets/${name}" alt="${name.replace(".png", "")}">`).join("")
  ).join("")}</div>`;
}
function howToHtml() {
  return `
    <h2 id="dlgTitle">HOW TO PLAY</h2>
    <div class="dialog-scroll">
      <ol class="how-list">
        <li><b>Set your bet.</b> Tap <em>BET</em>, pick an amount you can afford and press Accept.</li>
        <li><b>Spin.</b> Tap the big spin button. Tap it again while the reels turn to stop them.</li>
        <li><b>Win on 5 lines.</b> Match 3 identical symbols on the top, middle or bottom row, or on either diagonal.</li>
        <li><b>777 is wild.</b> It replaces any other paying symbol. Three 777 pay the top prize.</li>
        <li><b>Coins.</b> Coin symbols (1, 2, 10, 15, Crown, Mini, Minor, Major, Grand,) do not pay on a line, and a coin on a line breaks it.</li>
        <li><b>Coin bonus.</b> When 2 reels each land a coin, the third reel may keep spinning. If it lands a coin too, the Coin Bonus is unlocked.</li>
        <li><b>Auto spin.</b> Tap <em>AUTO</em>, choose 10, 15, 25 or 50 spins and press Accept. Tap <em>AUTO</em> again to stop.</li>
        <li><b>Fast spin.</b> Tap <em>FAST</em> to make the reels turn quicker.</li>
      </ol>
    </div>
    <div class="dialog-actions"><button type="button" class="dialog-primary" data-view="main">Back</button></div>`;
}
function calcHtml() {
  const bet = betAmount;
  const payRows = Object.entries(PAYOUTS).map(([name, mult]) =>
    `<div class="pay-cell"><img src="assets/${name}" alt="${name.replace(".png", "")}"><b>×${mult}</b></div>`).join("");
  const ex1 = miniGrid([["grapes.png", "sevens.png", "grapes.png"], ["lemon.png", "orange.png", "plum.png"], ["bells.png", "cherries.png", "orange.png"]], [0]);
  const ex2 = miniGrid([["cherries.png", "cherries.png", "cherries.png"], ["orange.png", "plum.png", "bells.png"], ["lemon.png", "lemon.png", "lemon.png"]], [0, 2]);
  return `
    <h2 id="dlgTitle">WINNING CALCULATION</h2>
    <div class="dialog-scroll">
      <p class="how-p"><b>Win = Bet × Multiplier</b> for every winning line. All winning lines are added together.</p>
      <h3>Pay for 3 matching symbols</h3>
      <div class="pay-grid">${payRows}</div>
      <p class="how-note">Examples below use your current bet of <b>${money(bet)}</b>.</p>
      <h3>Example 1 — wild 777</h3>
      ${ex1}
      <p class="how-p">Grapes + 777 + Grapes on the top row pays the grapes multiplier ×16.<br>
      <b>${money(bet)} × 16 = ${money(bet * 16)}</b></p>
      <h3>Example 2 — two lines at once</h3>
      ${ex2}
      <p class="how-p">Top row, 3 cherries: ${money(bet)} × 1 = ${money(bet)}<br>
      Bottom row, 3 lemons: ${money(bet)} × 4 = ${money(bet * 4)}<br>
      <b>Total win = ${money(bet * 1 + bet * 4)}</b></p>
    </div>
    <div class="dialog-actions"><button type="button" class="dialog-primary" data-view="main">Back</button></div>`;
}
function renderSettings(view) {
  let html, cls = "settings-dialog";
  if (view === "how") html = howToHtml();
  else if (view === "calc") html = calcHtml();
  else {
    html = `
      <h2 id="dlgTitle">SETTINGS</h2>
      ${switchRow("♫", "Music", "music", GameAudio.music)}
      ${switchRow("🔊", "Sound", "sound", GameAudio.sound)}
      <button type="button" class="menu-link" data-view="how"><span class="menu-link-icon">?</span><b>How to Play</b><i>›</i></button>
      <button type="button" class="menu-link" data-view="calc"><span class="menu-link-icon">=</span><b>Winning Calculation</b><i>›</i></button>
      <div class="dialog-actions"><button type="button" class="dialog-primary" id="closeSettings">Close</button></div>`;
  }
  openModal(html, cls);
  modal.addEventListener("click", event => {
    const nav = event.target.closest("[data-view]");
    if (nav) { renderSettings(nav.dataset.view); return; }
    const sw = event.target.closest("[data-toggle]");
    if (sw) {
      const on = !sw.classList.contains("on");
      sw.classList.toggle("on", on);
      sw.setAttribute("aria-checked", String(on));
      sw.querySelector("span").textContent = on ? "ON" : "OFF";
      if (sw.dataset.toggle === "music") GameAudio.setMusic(on);
      else { GameAudio.setSound(on); if (on) GameAudio.play("click"); }
      return;
    }
    if (event.target.closest("#closeSettings")) closeModal();
  });
}

/* =====================================================================
   Spinning
   ===================================================================== */
function previewSymbols(reelIndex, session) {
  // While the last reel is "teasing", coins flicker past so the player can hope.
  const teasing = session.anticipating && reelIndex === session.third;
  return Array.from({length: 3}, () => (teasing && Math.random() < 0.15) ? pickLandingCoin(reelIndex) : pickWeightedSymbol());
}
function clearSession(session) {
  (session.intervals || []).forEach(clearInterval);
  (session.reelTimers || []).forEach(clearTimeout);
  (session.timers || []).forEach(clearTimeout);
  if (session.countdown) clearInterval(session.countdown);
  if (session.raf) session.raf.forEach((_, i) => stopReelRaf(session, i));
  if (session.anticipateSfx) { clearInterval(session.anticipateSfx); session.anticipateSfx = null; }
  clearAnticipateSpark();
}
function landReel(session, i) {
  if (session.landed[i] || session.finished) return;
  session.landed[i] = true;
  if (session.intervals[i]) clearInterval(session.intervals[i]);
  if (session.reelTimers[i]) clearTimeout(session.reelTimers[i]);
  const reel = reels[i];
  const wasAnticipating = session.anticipating && i === session.third;
  stopReelStrip(reel, session.finalSets[i], session, i);
  GameAudio.play("stop");
  haptic(8);

  // Third coin just landed after anticipation — stop suspense FX, glow + shake
  if (wasAnticipating) {
    if (session.anticipateSfx) { clearInterval(session.anticipateSfx); session.anticipateSfx = null; }
    clearAnticipateSpark();
    game.classList.remove("anticipating");
    if (session.finalSets[i].some(isCoin)) {
      game.classList.add("screen-shake");
      setTimeout(() => game.classList.remove("screen-shake"), 550);
      haptic([25, 30, 25, 30, 40]);
      requestAnimationFrame(() => {
        markCoins(session, "coin-hit");
        const justLanded = reel.querySelectorAll(".symbol");
        session.finalSets[i].forEach((name, row) => {
          if (isCoin(name) && justLanded[row]) {
            justLanded[row].classList.add("coin-hit", "coin-land-burst");
            spawnCoinFx(justLanded[row]);
          }
        });
      });
      GameAudio.play("coin");
    }
  }

  if (session.landed.every(Boolean)) {
    session.timers.push(setTimeout(() => finishSpin(session), 220));
  } else {
    maybeStartAnticipation(session);
  }
}
// Two coins are on the board and one reel is left: keep it spinning with suspense.
function maybeStartAnticipation(session) {
  if (session.third < 0 || session.anticipating || session.landed[session.third]) return;
  const others = [0, 1, 2].filter(i => i !== session.third);
  if (!others.every(i => session.landed[i])) return;

  session.anticipating = true;
  game.classList.add("anticipating");
  reels[session.third].classList.add("anticipate-reel");
  // Rebuild the held reel with a VERY fast spin + coin teases
  startReelStripSpin(reels[session.third], session.third, session);
  markCoins(session, "coin-wait");
  GameAudio.play("coin");
  startAnticipateSfx(session);
  spawnAnticipateSpark(session.third);

  banner.textContent = "ONE MORE COIN!";
  banner.classList.add("show", "suspense");
  session.timers.push(setTimeout(() => landReel(session, session.third), ANTICIPATION_MS));
}

/* Anticipation suspense: rising tick sound + gold spark on the held column (bottom row) */
function startAnticipateSfx(session) {
  if (session.anticipateSfx) clearInterval(session.anticipateSfx);
  let n = 0;
  const playTick = () => {
    if (!session.anticipating || session.finished) return;
    // Rising urgency ticks (WebAudio tones already in GameAudio)
    GameAudio.play("tick");
    n++;
  };
  playTick();
  session.anticipateSfx = setInterval(playTick, 180);
}
function clearAnticipateSpark() {
  document.querySelectorAll(".anticipate-spark").forEach(el => el.remove());
}
function spawnAnticipateSpark(reelIndex) {
  clearAnticipateSpark();
  const reel = reels[reelIndex];
  if (!reel) return;
  const g = game.getBoundingClientRect();
  const r = reel.getBoundingClientRect();
  // Bottom row center of this column
  const cx = ((r.left + r.width / 2) - g.left) / g.width * 100;
  const cy = ((r.top + r.height * 0.82) - g.top) / g.height * 100;
  for (let i = 0; i < 5; i++) {
    const s = document.createElement("span");
    s.className = "anticipate-spark";
    s.textContent = "✦";
    s.style.cssText = `left:${cx}%;top:${cy}%;animation-delay:${(i * 0.12).toFixed(2)}s;`;
    game.appendChild(s);
  }
}
function requestStop() {
  const s = activeSpin;
  if (!s || s.finished || s.landed.every(Boolean)) return;
  // Manual stop always stops every remaining reel immediately, including the
  // anticipation reel, and removes any suspense/countdown messaging.
  clearSession(s);
  s.anticipating = false;
  s.third = -1;
  game.classList.remove("anticipating");
  clearWinLines();
  banner.classList.remove("show", "suspense");
  banner.textContent = "";
  [0, 1, 2].forEach(i => landReel(s, i));
}

function clearWinLines() {
  const svg = document.getElementById("winLines");
  if (svg) svg.remove();
  game.classList.remove("big-win");
}
function showWinLines(wins) {
  clearWinLines();
  if (!wins.length) return;
  const frame = document.querySelector(".reel-frame");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "winLines";
  svg.setAttribute("viewBox", "0 0 300 300");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  const coords = {0: [[50,150],[150,150],[250,150]], 1: [[50,50],[150,50],[250,50]], 2: [[50,250],[150,250],[250,250]], 3: [[50,50],[150,150],[250,250]], 4: [[50,250],[150,150],[250,50]]};
  wins.forEach(win => {
    const index = PAYLINES.findIndex(line => line.every((pos, j) => pos[0] === win.line[j][0] && pos[1] === win.line[j][1]));
    const points = coords[index];
    if (!points) return;
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", points.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" "));
    path.setAttribute("class", "animated-win-line");
    svg.appendChild(path);
  });
  frame.appendChild(svg);
}
function isBigWin(wins) {
  const hasPremium = wins.some(w => ["sevens.png", "stars.png"].includes(w.symbol));
  const midTierWays = wins.filter(w => ["bells.png", "watermelon.png", "grapes.png"].includes(w.symbol)).length;
  const fruitWays = wins.filter(w => ["cherries.png", "lemon.png", "orange.png"].includes(w.symbol)).length;
  return hasPremium || midTierWays >= 2 || fruitWays >= 4;
}

function finishSpin(session) {
  if (activeSpin !== session || session.finished || !session.serverResult) return;
  session.finished = true;
  clearSession(session);
  game.classList.remove("anticipating");
  reels.forEach(r => r.classList.remove("spinning-reel", "anticipate-reel"));
  banner.classList.remove("show", "suspense");
  banner.textContent = "";
  clearWinLines();
  const wins = (session.serverResult.lineWins || []).map(w => ({
    symbol:w.symbol, multiplier:Number(w.multiplier), amount:betAmount*Number(w.multiplier),
    line:PAYLINES[Number(w.line)] || []
  }));
  const payout = Number(session.serverResult.payout || 0);
  balance = Number(session.serverResult.balance);
  updateBalance();
  if (payout > 0) {
    const bigWin = isBigWin(wins);
    if (wins.length) showWinLines(wins);
    showToast(wins.length ? `${wins.length} winning line${wins.length === 1 ? "" : "s"}!` : "BONUS WIN!");
    GameAudio.play(bigWin ? "bigWin" : "win");
    celebrateWin(payout, bigWin);
  }
  spinning = false; activeSpin = null;
  spinBtn.classList.remove("spinning"); spinBtn.classList.add("stopped");
  spinBtn.setAttribute("aria-label", "Spin");
  const icon = spinBtn.querySelector("span"); if (icon) icon.textContent = "⟳";
  if (session.serverBonus) {
    if (auto) stopAuto("Auto spin stopped — coin bonus!");
    celebrateCoins(session); return;
  }
  if (!celebrating) game.classList.add("idle-on");
  if (auto) {
    if (autoRemaining <= 0) stopAuto("Auto spin finished");
    else if (balance < betAmount) stopAuto("Auto spin stopped — balance too low");
    else scheduleAuto(payout > 0 ? 1400 : (fastMode ? 250 : 450));
  }
}

/* ---------- Win celebration: count-up, coin shower, screen shake ---------- */
function celebrateWin(payout, bigWin) {
  const label = bigWin ? "BIG WIN!" : "WIN";
  banner.classList.add("show");
  if (bigWin) {
    game.classList.add("big-win", "screen-shake");
    setTimeout(() => game.classList.remove("screen-shake"), 600);
    haptic([20, 40, 20, 40, 30]);
  } else {
    haptic(15);
  }
  spawnCoinShower(bigWin ? 28 : 14);
  // Count-up the banner amount
  const target = payout;
  const start = performance.now();
  const dur = bigWin ? 1100 : 650;
  function tick(now) {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = target * eased;
    banner.textContent = label + " " + money(val);
    if (t < 1) requestAnimationFrame(tick);
    else banner.textContent = label + " " + money(target);
  }
  requestAnimationFrame(tick);
}
function spawnCoinShower(count) {
  const layer = document.createElement("div");
  layer.className = "fx-layer";
  game.appendChild(layer);
  for (let i = 0; i < count; i++) {
    const c = document.createElement("span");
    c.className = "fx-coin";
    c.textContent = "●";
    const x = 10 + Math.random() * 80;
    const delay = Math.random() * 0.45;
    const dur = 0.9 + Math.random() * 0.7;
    c.style.cssText = `left:${x}%;animation-delay:${delay}s;animation-duration:${dur}s;`;
    layer.appendChild(c);
  }
  setTimeout(() => layer.remove(), 2200);
}

let hc2Socket = null, pendingRequestId = null, requestCounter = 0;
function connectHC2() {
  if (typeof window.io !== "function") { showToast("Socket.IO client failed to load"); return; }
  hc2Socket = window.io(
  window.HC2_SOCKET_URL || "https://keno-server-20g6.onrender.com",
  {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 60000
  }
);
  hc2Socket.on("connect", () => {
  updateBootServer(true);

  const params = new URLSearchParams(window.location.search);
  const userId = params.get("userId") || "guest_user";

  console.log("Connecting as userId:", userId);   // ← add this

  hc2Socket.emit("initUser", {
    userId: userId,
    name: "Hit Coins 2 Player",
    phone: ""
  });

  hc2Socket.emit("requestBalance", { userId });
  showToast("Connected");
  });

  hc2Socket.on("balanceUpdate", (data) => {
     console.log("Received balanceUpdate:", data);   // ← add this
     if (data && typeof data.balance === "number") {
        balance = data.balance;
        updateBalance();
     }
  });
  hc2Socket.on("disconnect", () => updateBootServer(false));
  hc2Socket.on("connect_error", () => {
    updateBootServer(false);
    const label = document.getElementById("startupProgressLabel");
    if (label && !document.body.classList.contains("game-ready")) label.textContent = "Server unavailable — waiting to reconnect…";
  });
  hc2Socket.on("hc2Error", msg => {
    if (msg && msg.requestId && msg.requestId !== pendingRequestId) return;
    if (activeSpin) { clearSession(activeSpin); activeSpin = null; }
    spinning = false; spinBtn.classList.remove("spinning");
    spinBtn.setAttribute("aria-label","Spin");
    const icon=spinBtn.querySelector("span"); if(icon) icon.textContent="⟳";
    showToast(msg && msg.message || "Spin failed");
    pendingRequestId=null; if(auto) stopAuto();
  });
  hc2Socket.on("hc2SpinResult", message => {
    if (!message || message.requestId !== pendingRequestId || !activeSpin) return;
    const session=activeSpin; pendingRequestId=null;
    session.serverResult=message; session.finalGrid=message.grid;
    session.finalSets=gridToReelSets(message.grid); session.serverBonus=message.bonus || null;
    // If exactly two reels show a coin, hold the empty one for anticipation
    const coinReels = [0,1,2].filter(r => session.finalSets[r].some(isCoin));
    session.third = (coinReels.length === 2) ? [0,1,2].find(r => !coinReels.includes(r)) : -1;
    // Always land left → middle → right by column index (skip the held anticipation reel)
    const step = fastMode ? 180 : 480;
    [0,1,2].forEach(i => {
      if (i === session.third) return;
      session.reelTimers[i] = setTimeout(() => landReel(session, i), step * (i + 1));
    });
  });
}
connectHC2();
updateBootServer(Boolean(hc2Socket && hc2Socket.connected));
preloadBootAssets();

function spin() {
  if (spinning) { showToast("Waiting for server result…"); return; }
  if (modal || celebrating) return;
  if (!hc2Socket || !hc2Socket.connected) { showToast("Not connected to game server"); if(auto) stopAuto(); return; }
  clearTimeout(autoTimer); spinning=true;
  if(auto){autoRemaining--;updateAutoBadge();}
  banner.classList.remove("show","suspense");banner.textContent="";clearWinLines();
  game.classList.remove("big-win");
  spinBtn.classList.add("spinning","btn-press");spinBtn.classList.remove("stopped");
  setTimeout(() => spinBtn.classList.remove("btn-press"), 140);
  spinBtn.setAttribute("aria-label","Waiting for server result");
  const icon=spinBtn.querySelector("span");if(icon)icon.textContent="■";
  GameAudio.play("spin");
  haptic(18);
  game.classList.remove("idle-on"); // idle bob looked like shaking instead of spinning
  const session={finalGrid:null,finalSets:null,third:-1,serverResult:null,serverBonus:null,
    intervals:[null,null,null],reelTimers:[null,null,null],timers:[],landed:[false,false,false],
    anticipating:false,finished:false,countdown:null,raf:[null,null,null],anticipateSfx:null};
  activeSpin=session;
  reels.forEach((reel,i)=>{
    startReelStripSpin(reel, i, session);
  });
  pendingRequestId=`hc2-${Date.now()}-${++requestCounter}`;
  hc2Socket.emit("hc2Spin",{requestId:pendingRequestId,bet:betAmount});
}

/* =====================================================================
   Start-up + button wiring
   ===================================================================== */
function fillReels() {
  const startingGrid = [
    ["coin_10.png", "lemon.png", "bells.png"],
    ["crown_coin.png", "plum.png", "watermelon.png"],
    ["cherries.png", "grand.png", "stars.png"]
  ];
  reels.forEach((reel, i) => setReelSymbols(reel, startingGrid[i]));
}
fillReels();
updateBalance();
updateBet();
updateAutoBadge();

// Small click sound + press feedback on every button (spin has its own sound).
game.addEventListener("pointerdown", event => {
  const btn = event.target.closest("button");
  if (!btn) return;
  btn.classList.add("btn-press");
  haptic(btn.id === "spin" ? 18 : 10);
  if (btn.id !== "spin" && !btn.dataset.toggle) GameAudio.play("click");
});
game.addEventListener("pointerup", event => {
  const btn = event.target.closest("button");
  if (btn) btn.classList.remove("btn-press");
});
game.addEventListener("pointerleave", event => {
  const btn = event.target.closest("button");
  if (btn) btn.classList.remove("btn-press");
});

spinBtn.addEventListener("click", () => {
  if (spinning && activeSpin && activeSpin.serverResult) {
    requestStop();
    return;
  }
  spin();
});
fastBtn.addEventListener("click", () => {
  fastMode = !fastMode;
  fastBtn.classList.toggle("active", fastMode);
  showToast(fastMode ? "Fast spin ON" : "Fast spin OFF");
});
autoBtn.addEventListener("click", () => {
  if (auto) stopAuto("Auto spin stopped");
  else openAutoSelector();
});
document.getElementById("menu").addEventListener("click", openSettings);
betBtn.addEventListener("click", openBetSelector);

/* ---------- Idle atmosphere (subtle motion while waiting) ---------- */
function startIdleFx() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  game.classList.add("idle-on");
  // Soft shimmer pulse on the reel frame
  const frame = document.querySelector(".reel-frame");
  if (frame) frame.classList.add("idle-glow");
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) game.classList.remove("idle-on");
  else if (!spinning && !celebrating) game.classList.add("idle-on");
});
// Start idle once the game is revealed
const bootObserver = new MutationObserver(() => {
  if (document.body.classList.contains("game-ready")) {
    startIdleFx();
    bootObserver.disconnect();
  }
});
bootObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
if (document.body.classList.contains("game-ready")) startIdleFx();
