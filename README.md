# Hit Coins 2 UI Prototype

V2 mobile-first HTML/CSS/JavaScript prototype based on the supplied screenshot.

## Run it
1. Extract the ZIP.
2. Open `index.html` in a modern browser, or use a local static server.
3. Tap the large center spin button to animate the reels. Use Autoplay and Fast Spin to test the controls.

## Files
- `index.html` — layout
- `style.css` — responsive visual styling
- `app.js` — prototype spin/autoplay interactions
- `assets/reference-background.png` — supplied screenshot used as the decorative background
- `assets/*.svg` — separate symbol artwork for animated reels

## Important
This is a UI prototype. The balance, random outcomes, and payout display are placeholder demo behavior, not real-money or production game logic. The screenshot is used as a background outside the overlaid reel area; other static areas may need additional masking/tuning after testing on the target phone.


## V2 updates
- Polished control/status layering and button interaction feedback.
- Improved reel-strip animation and reduced-motion accessibility support.


## V3 updates
- Rebuilt the reels as fixed-height symbol cells so three symbols remain visible.
- Improved gold frame, reel dividers, and win-banner styling.
- Reel strips now animate vertically and stop on the selected visible symbols.


## V4 updates
- Corrected the reel layout to show three symbols in each of three columns (9 visible symbols total).
- Improved reel strip animation and staggered stop timing.
- Updated menu and bet controls to give immediate prototype feedback.


## V5 updates
- Added a cleaned lower background to remove the original screenshot's duplicate/nonfunctional controls.
- The UI's own HTML buttons and balance/footer are now the visible interactive layer.


## V6 updates
- Rebuilt the lower background from the red patterned area to remove the obvious horizontal seam.
- Kept the original top art and reel frame unchanged.
- Tightened symbol fitting so all three rows have more breathing room.


## V7 updates
- Refined cherries, grapes, watermelon, gold coin, and bell SVGs with gradients and highlights.
- Reel symbols now use explicit per-cell sizing to keep the 3x3 display aligned and prevent bottom clipping.


## V8 updates
- Replaced long reel-strip transforms with a stable 3-row grid; all 9 symbol slots stay visible.
- Reels cycle symbols in-place and stop independently, preventing blank columns and partial symbols.
- Moved the win banner below the reel frame so it does not cover fruit symbols.
- Rebuilt the lower background from a control-free texture tile to avoid the stretched horizontal seam.


## V9 updates — reference symbol integration
- Cropped all 16 symbols from the supplied transparent sprite sheet into individual local PNG assets.
- Updated the existing symbol array to use the new PNGs while keeping the current reel grid, spin timings, fast spin, autoplay, balance, and controls.
- Added local image preloading and console errors for failed symbol loads.
- Restored the existing win banner element expected by the JavaScript and stylesheet so the spin handler can run without a null-element error.
- Kept the original sprite sheet unchanged at `assets/reference-symbol-sheet.png`.


## V14 updates
- **Two coins → 30-second suspense.** When two reels land a coin, the remaining reel keeps spinning for 30 seconds (coins flicker past, the reel glows, a countdown banner shows). Tapping Stop during this time is ignored. Tune with `ANTICIPATION_MS` in `app.js`.
- **Three coins → a "breath" before the overlay.** The coins pulse, wobble and sparkle (other symbols dim) for about 1.9 seconds, then the Congratulations overlay opens. Tune with `BONUS_BREATH_MS`.
- **Numbered coins 1, 2, 3, 4, 5, 10, 15** added as new symbols (`assets/coin_*.png`, built on the gold coin art). They count as coins for the 2-coin / 3-coin rules. Their frequency is set in `COIN_WEIGHTS`.
- **Bet list** now disables every amount larger than the balance; only amounts equal to or below the balance can be selected.
- **Auto spin** opens a list (10 / 15 / 25 / 50) with Cancel / Accept. The AUTO button shows the spins left; tap it to stop.
- **Settings button** opens: Music on/off, Sound on/off (generated with WebAudio, saved in the browser), How to Play, and Winning Calculation with examples based on the current bet.
- **Control buttons** redesigned (Settings, Bet, Auto, Fast): gold rims, gloss, icons, labels and a lit state.
- **Footer clock** now shows the real current time (HH:MM, 24-hour).

## V15 updates — Full-page Hold & Spin bonus
- **Bonus has its own page.** After 3 coins land, a dedicated full-screen Hold & Spin page opens (main reels/controls hidden).
- **Purple background + jackpot badges + coin-pile logo** styled to match the official reference screenshot.
- **3×3 individual cell windows.** Each empty cell spins *inside its own box* with a continuous vertical strip of coins (or can land empty / any coin).
- **Sequential stop order:** cells stop left-to-right, top-to-bottom (first column box → next column → third → second-column first box of next row …) exactly as requested.
- **Re-spins:** start at 3; any new coin resets to 3; when re-spins hit 0 or board is full, Collect appears.
- **Payout** = sum of all held coin values × current bet.
- Triggering coins from the base game are transferred onto the bonus board as held.

## V16 updates — Correct collector mechanic (matches your description)
- **Middle column = collectors.** Starts with 1 collector. Up to 3 collectors can appear.
- **Left & right columns = coin boxes.** When coins land (e.g. x2, x1, MINI) their values are **added to every active collector** (1+2+25 = 28 added to each).
- **New collector** can appear in the middle; it starts at 0 and collects from future coins.
- **3 re-spins** at the start. Any coin **or** new collector resets re-spins back to 3 (even from 0).
- **Spin behaviour:** if you wait, boxes stop one-by-one automatically; if you tap the button while spinning, the final result is shown immediately.
- **End of bonus:** sum of all collectors (e.g. 40+30+10 = 80) is the multiplier → win = 80 × current bet added to balance.
- Full-page purple UI kept (jackpots, logo, gold frame).

## V17 refinements
- Coins that land add their value to all active collectors, then are **removed** (cell empty again). Collectors stay permanently.
- Collectors display their **current collected total**.
- Coin value shown as label on the coin (xN).
- Spin strips are **random**: mix of coins, empty slots, or continuous coins.
- First spin starts **automatically** when bonus page opens.
- Tap stop while spinning → instant final result for that spin.
- After last spin: auto-calculate win, show “YOU WIN” overlay, then return to main game after 5 seconds.

## V18 updates — Bonus spin sequence
- **Column by column:** LEFT column spins and stops first, then the MIDDLE (collector) column starts, then the RIGHT column. Boxes inside a column stop one after another (top to bottom) at a moderate speed. Tune with `bonusTiming()` in `app.js`.
- **One symbol per box:** each spinning box now shows a single symbol at a time (no more stacked coins).
- **Tap to stop:** tapping the button while reels move stops every remaining box and shows that spin's result; the result is held for ~1 second, then the values are added to the collectors (coins shrink into them, collectors bump and show "+N").
- Polished UI: glowing spin window, drop-in bounce on stop, landed-coin glow, collector value animation, reduced-motion support.
- Main game logic and base-game files are untouched.

## V19 updates
- A new collector that appears in the same spin as coins now collects those coins too.
- Coin **landing** math (main game) and coin **collecting** math (bonus) are separate, each with its own weights: `LANDING_MATH` / `LANDING_COIN_WEIGHTS` and `COLLECT_MATH` / `COLLECT_COIN_WEIGHTS` at the top of `app.js`.
- Main game: the middle reel can only land the crown coin. The bonus page is not affected.
- Bonus: wait between spins is now 0.5 s (`BONUS_SPIN_GAP_MS`).
- The values of the 3 coins that triggered the bonus are added to the first collector when the bonus page opens.


## Server-authoritative integration (Hit Coins 2 server)

The browser no longer chooses the final base-game grid, evaluates paylines, or credits/debits a spin. It sends `hc2Spin` over Socket.IO and displays the server's `hc2SpinResult`. Bonus coin outcomes and the bonus multiplier are also consumed from the server response; browser-side random values are only used for reel-strip animation while waiting.

### Required server setup
1. Serve this UI from the same origin as the Socket.IO game server, or set `window.HC2_SOCKET_URL` in `index.html` to the Socket.IO server URL.
2. The server must authenticate the socket and set `socket.userId` using your existing trusted `initUser` flow before accepting `hc2Spin`. Do not trust a user ID supplied by the browser.
3. The supplied server module does not send an initial balance event. The UI starts at ETB 0 and updates its displayed balance from `hc2SpinResult`; wire your existing authenticated balance initialization event into `balance` / `updateBalance()` if the UI needs the real balance before the first spin.
4. Ensure the `hc2_pool` row with `id = 1` exists, and that `hc2_adjust_balance` and the `hc2_spins` table are configured in Supabase.

Do not open `index.html` directly as a file; use your web server so Socket.IO can connect.
