# Mazer

Mazer is a timed laser prediction game. The Table generates a 9 x 9 board with
random `/` and `\` mirrors, places a cannon on an outer coordinate, and asks the
players to guess where the laser will exit.

## Current Rules

- Supports every player admitted by the lobby (currently one to five players).
- A match lasts eight rounds: two easy, three medium, and three hard.
- A tie after round eight starts sudden-death hard boards until one leader
  remains.
- Solo matches start immediately in Everyone Guesses mode. Before multiplayer
  matches, a player chooses Everyone Guesses or Laser Rush.
- In Everyone Guesses, every player gets one hidden prediction. The round ends
  after everyone submits or time expires. Correct predictions earn 10 points,
  plus speed bonuses of 3, 2, and 1 for the first three correct players.
- In Laser Rush, every player gets one prediction. An incorrect prediction
  locks only that player out; the first correct prediction ends the round and
  earns 10 points.
- Solo games use the same eight-round match and scoring structure.
- Difficulty is based on the traced laser path, including its length and the
  number of mirrors actually hit, rather than the total mirror count alone.
- The generator rejects loops and short returns near the cannon, including the
  trivial neighboring-cell U shape.
- Both Table and Hand show the board.
- The Hand sends the target guess immediately when the player selects an outer
  coordinate.
- The Table shows the remaining guessing time.
- During simulation, the Table and Hands progressively reveal the laser path.
- The Table broadcasts the correct target to Hands only after that animation
  ends.
- The Table owns the generated board, laser simulation, scoring, and timing.
- Wrong guessed coordinates are shown in red after the round resolves.
- Once there is one winner, the game reports that result to the Tardi platform,
  which provides the standard replay flow.

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
