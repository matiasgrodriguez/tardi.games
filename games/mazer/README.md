# Mazer

Mazer is a timed laser prediction game. The Table generates a 9 x 9 board with
random `/` and `\` mirrors, places a cannon on an outer coordinate, and asks the
players to guess where the laser will exit.

## Current Rules

- Supports one to five players with the same rules and automatic match start.
- Every match ends after eight rounds; tied leaders share the win.
- All eight rounds use one fixed 9 x 9 layout with 18–27 mirrors.
- The cannon moves between distinct routes: two easy, three medium, three hard.
- Difficulty uses the existing path-length and mirror-hit bands. Bounce counts
  can overlap within and between bands; they do not strictly increase each round.
- The generator plans all eight routes together, preferring a maze that satisfies
  every band. If none is found within the generation budget, it uses the closest
  complete plan. Loops, trivial same-edge returns, and previously used routes
  (including their reverse direction) are excluded.
- Every player gets one hidden prediction and 12 seconds to submit it.
- The round resolves after everyone submits or time expires.
- Correct predictions earn 100 points plus a speed bonus:
  `floor(100 * remaining guessing time / 12 seconds)`. Incorrect or missing
  predictions earn zero. Solo players receive the same speed bonus.
- With a shared screen, Table and Hand show the board and animate each shot.
- In phone-only games, the hidden Table skips UI creation, rendering, and display
  timers. Hands show wrapping Match and Scores panels below the maze.
- The Hand reserves space for status text at the current width so phase changes
  do not shift the board. Panels and long player names can scroll without clipping.
- Earlier shots remain dimly visible for the rest of the match, even if nobody
  guessed correctly. The current shot is bright; crossing beams do not interact.
- The correct exit reaches Hands after the animation finishes. Guesses stay
  hidden during guessing, and incorrect targets appear red after resolution.
- The Table owns maze generation, laser simulation, scoring, and timing.
- Results are reported to the Tardi platform for its standard replay flow.

## UI Rendering Rules

- Game code may use string templates where that makes the UI easier to build and
  maintain.
- The Hand UI may lean more heavily on templates because it runs on player
  phones and tablets.
- The Table UI must stay conservative because it may run on old TV browsers.
- Keep Table templates simple and ES5-friendly.
- Avoid modern browser-only APIs in the Table.
- Do not interpolate untrusted text, such as player names, directly into HTML.
  Escape it first or insert it with `textContent`.
- Dynamic board rendering should prioritize predictable performance. If a large
  template becomes hard to reason about, use small DOM helpers for that part.

## Validation

Run `npm test` for maze-generation, scoring, and match-flow regression checks.
Run `npm run build` to compile Table and Hand bundles.
