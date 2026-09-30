# Mazer

Mazer is a timed laser prediction game. The Table generates a 9 x 9 board with
random `/` and `\` mirrors, places a cannon on an outer coordinate, and asks the
players to guess where the laser will exit.

The game logic is still intentionally simple and should be refined through
playtesting.

## Current Rules

- Supports every player admitted by the lobby (currently one to five players).
- Each round adds more mirrors than the previous round.
- Cannon placement usually prefers a row or column that already contains a
  mirror, while still allowing fully random starts.
- Both Table and Hand show the board.
- The Hand sends the target guess immediately when the player selects an outer
  coordinate.
- The first valid guess ends the guessing phase for all players.
- The Table shows the remaining guessing time.
- After a valid guess, all Hands enter the simulation phase immediately and
  cannot submit more guesses.
- During simulation, the Table and Hands reveal the laser path over 180ms.
- The Table broadcasts the correct target to Hands only after that animation
  ends.
- The Table owns the generated board, laser simulation, scoring, and timing.
- Correct guesses earn points.
- Wrong or missing guesses give the other players bonus points.
- Wrong guessed coordinates are shown in red after the round resolves.

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
