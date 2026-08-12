# Tic-Tac-Toe — a minimal Tardi game

A minimal, complete Tardi game you can fork to build your own. It is two-player
tic-tac-toe in a few small files, and it shows the whole shape of a Tardi game:
a **table** (the TV display), a **hand** (each player's controller), and
**shared** modules used by both.

## Layout

```
game.json            title, description, player count
assets/thumbnail.png 512x512
src/
  table.js           the TV display: owns the game state
  hand.js            a player's controller: renders and sends taps
  shared/
    tic-tac-toe-rules.js  game rules (winner, draw) — used by table AND hand
    board.js              the responsive 3x3 board UI — used by table AND hand
dist/                Build output: hand.js, table.js, plus copies of game.json and assets/.
```

## The SDK

Your game imports the SDK; nothing is injected globally.

```js
// table.js
import { startMatch, sendToAllHands, endMatch } from '@juxhouse/tardi-core/table'

// hand.js
import { joinMatch, sendToTable } from '@juxhouse/tardi-core/hand'
```

- The **table** calls `startMatch({ onMessage, onPlayersChange })`, broadcasts
  state with `sendToAllHands(state)`, and ends with `endMatch({ victor })`.
- The **hand** calls `joinMatch({ onStateChange })` and sends actions with
  `sendToTable(action)`.

See the Tardi GameSDK docs for the full callback shapes.

## Build

```
npm install
npm run build      # bundles src/ into ES5 dist/hand.js + dist/table.js for old TV browsers
```

`npm run build` runs `tardi-build`, which transpiles your modern JS (classes,
arrow functions, `import`, shared modules) down to a single self-contained ES5
file per role that runs on 2018 TVs. You write modern code; the build makes it
compatible.

## Test it locally

```
npm run dev
```

This opens the dev harness that comes with the build tool: one table and one
hand per player side by side, wired together exactly like the Tardi platform but
with no PeerJS or lobby. Open it, play both hands, and watch the table. Nothing
to set up — the harness reads your `game.json` for the title and player count.

## Make it yours

1. Edit `game.json` (title, description, players).
2. Replace `assets/thumbnail.png` (512x512).
3. Rewrite `src/` for your game. Keep rules and UI that both sides need in
   `src/shared/`.
4. `npm run build`, then publish the repo.
