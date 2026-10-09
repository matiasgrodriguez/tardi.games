import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'

const read = path => fs.readFileSync(new URL('../src/' + path, import.meta.url), 'utf8')
const asModule = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
const geometry = await import(asModule(read('shared/mazer-geometry.js')))
const rounds = await import(asModule(read('shared/mazer-round.js').replace('./mazer-geometry.js', asModule(read('shared/mazer-geometry.js')))))
const key = t => t.side + ':' + t.coordinate
const bands = { easy: [7, 20, 1, 4], medium: [12, 32, 2, 7], hard: [18, 60, 3, 12] }
function seeded(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
}

test('fixed mazes supply eight distinct routes in the existing difficulty bands', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const match = rounds.createMazerMatch(seeded(seed))
    assert.equal(match.rounds.length, 8)
    const used = new Set()
    for (const [index, round] of match.rounds.entries()) {
      assert.equal(round.number, index + 1)
      assert.equal(round.mirrors, match.mirrors)
      assert.equal(round.difficulty, rounds.getDifficultyForRound(index + 1))
      assert.deepEqual(rounds.traceLaser(match.mirrors, round.cannon).target, round.correctTarget)
      for (const target of [round.cannon, round.correctTarget]) {
        assert(!used.has(key(target)), 'route must not repeat, including in reverse')
        used.add(key(target))
      }
      const [minPath, maxPath, minHits, maxHits] = bands[round.difficulty]
      assert(round.pathLength >= minPath && round.pathLength <= maxPath, `seed ${seed}: path outside ${round.difficulty}`)
      assert(round.mirrorHits >= minHits && round.mirrorHits <= maxHits, `seed ${seed}: bounces outside ${round.difficulty}`)
    }
  }
})

test('speed points depend on elapsed time, with bounded integer bonuses', () => {
  assert.deepEqual([-100, 0, 3000, 6000, 11999, 12000, 13000].map(ms => rounds.getGuessPoints(ms, 12000)), [200, 200, 175, 150, 100, 100, 100])
})

function matchHarness(playerCount, sharedScreen = true) {
  let now = 100000, nextTimer = 0, callbacks, state, result
  const timers = new Map()
  let intervalCount = 0
  const node = () => ({ style: {}, appendChild() {}, firstChild: null })
  const context = {
    ...geometry, ...rounds,
    hasSharedScreen: () => sharedScreen,
    createMazerMatch: () => rounds.createMazerMatch(seeded(17)),
    createNode: (...args) => { assert(sharedScreen, 'hidden Table must not create UI nodes'); return node(...args) }, createVariedTileBackground: () => '', clearNode() {},
    createMazerBoard: () => ({ element: node(), render() {} }),
    document: { body: node(), head: node(), createElement: node },
    Date: { now: () => now },
    window: {
      setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id },
      clearTimeout(id) { timers.delete(id) }, setInterval() { intervalCount++; return ++nextTimer }, clearInterval() {},
    },
    startMatch: opts => { callbacks = opts },
    sendToAllHands: next => { state = next }, endMatch: next => { result = next },
  }
  vm.runInNewContext(read('table.js').replace(/^import .*\n/gm, ''), context)
  callbacks.onPlayersChange({ players: Array.from({length: playerCount}, (_, i) => ({playerId: 'p' + i, nick: 'Player ' + i})) })
  return {
    get state() { return state }, get result() { return result },
    get intervalCount() { return intervalCount },
    elapse(ms) { now += ms },
    guess(id, target) { callbacks.onMessage({playerId: id, messageFromHand: {type: 'submit_guess', target}}) },
    correct() { return rounds.traceLaser(state.board.mirrors, state.round.cannon).target },
    next() { const [id, timer] = timers.entries().next().value; timers.delete(id); now += timer.delay; timer.fn() },
  }
}

test('hidden guesses, one attempt, time scoring, and persistent failed shots', () => {
  const game = matchHarness(2)
  assert.equal(game.state.phase, 'guessing')
  game.elapse(3000)
  game.guess('p0', game.correct())
  assert.equal(game.state.phase, 'guessing')
  assert.equal(game.state.round.guessesByPlayerId.p0.target, null)
  assert.equal(game.state.round.guessesByPlayerId.p0.correct, null)
  game.guess('p0', {side: 'loop', coordinate: -1})
  game.elapse(3000)
  game.guess('p1', game.correct())
  assert.equal(game.state.phase, 'simulating')
  assert.equal(game.state.round.correctTarget, null)
  game.next()
  assert.equal(game.state.scoresByPlayerId.p0, 175)
  assert.equal(game.state.scoresByPlayerId.p1, 150)
  const mirrors = JSON.stringify(game.state.board.mirrors)
  game.next()
  assert.equal(game.state.round.number, 2)
  assert.equal(game.state.board.resolvedShots.length, 1)
  assert.equal(game.state.round.laserPath.length, 0)
  assert.equal(JSON.stringify(game.state.board.mirrors), mirrors)
  game.next() // Nobody answers round two.
  game.next()
  game.next()
  assert.equal(game.state.board.resolvedShots.length, 2)
  assert.equal(game.state.scoresByPlayerId.p0, 175)
})

test('solo earns speed points and tied matches finish after exactly eight rounds', () => {
  const solo = matchHarness(1)
  solo.elapse(6000)
  solo.guess('p0', solo.correct())
  solo.next()
  assert.equal(solo.state.scoresByPlayerId.p0, 150)
  const tied = matchHarness(2)
  for (let i = 0; i < 8; i++) {
    assert.equal(tied.state.round.number, i + 1)
    tied.next(); tied.next(); tied.next()
  }
  assert.equal(tied.state.phase, 'game_over')
  assert.equal(tied.state.winners.length, 2)
  assert.equal(tied.result.victor, null)
})


test('phone-only Table skips all rendering and animation loops while running the match', () => {
  const game = matchHarness(1, false)
  assert.equal(game.state.hasSharedScreen, false)
  for (let i = 0; i < 8; i++) {
    game.elapse(3000)
    game.guess('p0', game.correct())
    game.next(); game.next()
  }
  assert.equal(game.state.phase, 'game_over')
  assert.equal(game.state.scoresByPlayerId.p0, 8 * 175)
  assert.equal(game.intervalCount, 0)
})
