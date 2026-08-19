import { startMatch, sendToAllHands } from '@juxhouse/tardi-core/table'
import { createMazerBoard } from './shared/mazer-board.js'
import { BOARD_SIZE, clearNode, createNode, formatTarget, getVisibleLaserCellCount, isValidTarget, targetsEqual } from './shared/mazer-geometry.js'

;(function () {
  var GAME_NAME = 'Mazer'
  var MAX_PLAYERS = 2
  var GUESS_MS = 12000
  var LASER_CELLS_PER_VELOCITY_TICK = 10
  var LASER_VELOCITY_TICK_MS = 100
  var LASER_ANIMATION_TICK_MS = 35
  var SCORING_MS = 2600
  var STARTING_MIRRORS = 4
  var MIRRORS_ADDED_PER_ROUND = 2
  var CANNON_MIRROR_AXIS_ODDS = 0.7
  var POINTS_CORRECT = 10
  var POINTS_OPPONENT_MISTAKE = 3

  var players = []
  var scoresByPlayerId = {}
  var phase = 'waiting_for_players'
  var roundNumber = 0
  var round = null
  var timerId = 0
  var countdownTimerId = 0
  var laserAnimationTimerId = 0

  var root = createNode('main', 'mazer-table')
  var header = createNode('header', 'mazer-header')
  var status = createNode('p', 'mazer-status')
  var countdown = createNode('div', 'mazer-countdown')
  var content = createNode('section', 'mazer-content')
  var boardHost = createNode('div', 'mazer-board-host')
  var sidePanel = createNode('aside', 'mazer-side')
  var scoreboard = createNode('div', 'mazer-scoreboard')
  var guesses = createNode('div', 'mazer-guesses')
  var board = createMazerBoard({
    interactive: false,
  })

  installStyles()
  document.body.appendChild(root)
  root.appendChild(header)
  header.appendChild(status)
  header.appendChild(countdown)
  root.appendChild(content)
  content.appendChild(boardHost)
  boardHost.appendChild(board.element)
  content.appendChild(sidePanel)
  sidePanel.appendChild(scoreboard)
  sidePanel.appendChild(guesses)
  render()

  startMatch({
    onMessage: onMessage,
    onPlayersChange: onPlayersChange,
  })

  function onPlayersChange(event) {
    players = (event.players || []).slice(0, MAX_PLAYERS)
    ensureScores()

    if (players.length < 1) {
      stopTimer()
      stopCountdown()
      stopLaserAnimation()
      phase = 'waiting_for_players'
      round = null
      broadcast()
      return
    }

    if (phase === 'waiting_for_players') {
      startNextRound()
      return
    }

    broadcast()
  }

  function onMessage(event) {
    var action = event.messageFromHand

    if (phase !== 'guessing' || !round || !action || action.type !== 'submit_guess') {
      return
    }

    if (!isCurrentPlayer(event.playerId) || round.guessesByPlayerId[event.playerId]) {
      return
    }

    if (!isValidTarget(action.target)) {
      return
    }

    round.guessesByPlayerId[event.playerId] = {
      target: {
        side: action.target.side,
        coordinate: Number(action.target.coordinate),
      },
      correct: null,
    }

    if (players.length > 1 || countGuesses() >= players.length) {
      resolveRound()
      return
    }

    broadcast()
  }

  function startNextRound() {
    var mirrorCount

    stopTimer()
    stopLaserAnimation()
    roundNumber += 1
    mirrorCount = STARTING_MIRRORS + ((roundNumber - 1) * MIRRORS_ADDED_PER_ROUND)
    round = createRound(roundNumber, mirrorCount)
    phase = 'guessing'
    timerId = window.setTimeout(resolveRound, GUESS_MS)
    startCountdown()
    broadcast()
  }

  function resolveRound() {
    if (phase !== 'guessing' || !round) {
      return
    }

    stopTimer()
    stopCountdown()
    phase = 'simulating'
    round.simulationStartedAt = Date.now()
    markCorrectGuesses()
    startLaserAnimation()
    broadcast()
    timerId = window.setTimeout(scoreRound, getLaserAnimationMs(round.laserPath))
  }

  function scoreRound() {
    if (phase !== 'simulating' || !round || round.scored) {
      return
    }

    applyScores()
    stopLaserAnimation()
    round.scored = true
    phase = 'scoring'
    broadcast()
    timerId = window.setTimeout(startNextRound, SCORING_MS)
  }

  function createRound(number, mirrorCount) {
    var mirrors = createMirrors(mirrorCount)
    var cannon = createCannon(mirrors)
    var traced = traceLaser(mirrors, cannon)

    return {
      number: number,
      mirrorCount: mirrorCount,
      mirrors: mirrors,
      cannon: cannon,
      laserPath: traced.path,
      correctTarget: traced.target,
      guessesByPlayerId: {},
      endsAt: Date.now() + GUESS_MS,
      simulationStartedAt: 0,
      scored: false,
    }
  }

  function createMirrors(count) {
    var mirrors = []
    var used = {}
    var max = BOARD_SIZE * BOARD_SIZE
    var safeCount = count > max ? max : count
    var x
    var y
    var key

    while (mirrors.length < safeCount) {
      x = randomInt(BOARD_SIZE)
      y = randomInt(BOARD_SIZE)
      key = x + ':' + y

      if (used[key]) {
        continue
      }

      used[key] = true
      mirrors.push({
        x: x,
        y: y,
        type: Math.random() < 0.5 ? 'slash' : 'backslash',
      })
    }

    return mirrors
  }

  function createCannon(mirrors) {
    var side = ['left', 'top', 'right', 'bottom'][randomInt(4)]
    var coordinate = createCannonCoordinate(side, mirrors)

    if (side === 'left') {
      return { side: side, coordinate: coordinate, x: 0, y: coordinate, direction: 'right' }
    }

    if (side === 'right') {
      return { side: side, coordinate: coordinate, x: BOARD_SIZE - 1, y: coordinate, direction: 'left' }
    }

    if (side === 'top') {
      return { side: side, coordinate: coordinate, x: coordinate, y: 0, direction: 'down' }
    }

    return { side: side, coordinate: coordinate, x: coordinate, y: BOARD_SIZE - 1, direction: 'up' }
  }

  function createCannonCoordinate(side, mirrors) {
    var options

    if (Math.random() >= CANNON_MIRROR_AXIS_ODDS) {
      return randomInt(BOARD_SIZE)
    }

    options = side === 'left' || side === 'right'
      ? getMirrorRows(mirrors)
      : getMirrorColumns(mirrors)

    if (options.length < 1) {
      return randomInt(BOARD_SIZE)
    }

    return options[randomInt(options.length)]
  }

  function getMirrorRows(mirrors) {
    var rows = []
    var seen = {}
    var index
    var y

    for (index = 0; index < mirrors.length; index += 1) {
      y = mirrors[index].y

      if (!seen[y]) {
        seen[y] = true
        rows.push(y)
      }
    }

    return rows
  }

  function getMirrorColumns(mirrors) {
    var columns = []
    var seen = {}
    var index
    var x

    for (index = 0; index < mirrors.length; index += 1) {
      x = mirrors[index].x

      if (!seen[x]) {
        seen[x] = true
        columns.push(x)
      }
    }

    return columns
  }

  function traceLaser(mirrors, cannon) {
    var mirrorByCell = createMirrorMap(mirrors)
    var path = []
    var seen = {}
    var x = cannon.x
    var y = cannon.y
    var direction = cannon.direction
    var key
    var mirror
    var guard

    for (guard = 0; guard < 240; guard += 1) {
      if (!isInsideBoard(x, y)) {
        return { path: path, target: createTargetFromExit(x, y) }
      }

      key = x + ':' + y + ':' + direction

      if (seen[key]) {
        return { path: path, target: { side: 'loop', coordinate: -1 } }
      }

      seen[key] = true
      mirror = mirrorByCell[x + ':' + y] || null
      path.push({ x: x, y: y, direction: direction, mirror: mirror ? mirror.type : null })

      if (mirror) {
        direction = reflect(direction, mirror.type)
      }

      if (direction === 'right') {
        x += 1
      } else if (direction === 'left') {
        x -= 1
      } else if (direction === 'down') {
        y += 1
      } else {
        y -= 1
      }
    }

    return { path: path, target: { side: 'loop', coordinate: -1 } }
  }

  function createTargetFromExit(x, y) {
    if (x < 0) {
      return { side: 'left', coordinate: y }
    }

    if (x >= BOARD_SIZE) {
      return { side: 'right', coordinate: y }
    }

    if (y < 0) {
      return { side: 'top', coordinate: x }
    }

    return { side: 'bottom', coordinate: x }
  }

  function reflect(direction, mirrorType) {
    if (mirrorType === 'slash') {
      if (direction === 'up') return 'right'
      if (direction === 'right') return 'up'
      if (direction === 'down') return 'left'
      return 'down'
    }

    if (direction === 'up') return 'left'
    if (direction === 'left') return 'up'
    if (direction === 'down') return 'right'
    return 'down'
  }

  function markCorrectGuesses() {
    var index
    var player
    var guess

    for (index = 0; index < players.length; index += 1) {
      player = players[index]
      guess = round.guessesByPlayerId[player.playerId]

      if (guess) {
        guess.correct = targetsEqual(guess.target, round.correctTarget)
      }
    }
  }

  function applyScores() {
    var index
    var otherIndex
    var player
    var otherPlayer
    var guess

    for (index = 0; index < players.length; index += 1) {
      player = players[index]
      guess = round.guessesByPlayerId[player.playerId]

      if (guess && guess.correct) {
        scoresByPlayerId[player.playerId] += POINTS_CORRECT
      } else {
        if (players.length > 1) {
          for (otherIndex = 0; otherIndex < players.length; otherIndex += 1) {
            otherPlayer = players[otherIndex]

            if (otherPlayer.playerId !== player.playerId) {
              scoresByPlayerId[otherPlayer.playerId] += POINTS_OPPONENT_MISTAKE
            }
          }
        }
      }
    }
  }

  function broadcast() {
    var publicState = createPublicState()

    render(publicState)
    sendToAllHands(publicState)
  }

  function createPublicState() {
    return {
      name: GAME_NAME,
      phase: phase,
      statusText: getStatusText(),
      board: {
        width: BOARD_SIZE,
        height: BOARD_SIZE,
        mirrors: round ? cloneMirrors(round.mirrors) : [],
      },
      round: round ? {
        number: round.number,
        mirrorCount: round.mirrorCount,
        cannon: cloneTarget(round.cannon),
        laserPath: shouldSendLaserPath() ? cloneLaserPath(round.laserPath) : [],
        correctTarget: shouldSendCorrectTarget() ? cloneTarget(round.correctTarget) : null,
        guessesByPlayerId: cloneGuesses(round.guessesByPlayerId),
        endsAt: round.endsAt,
      } : null,
      players: getPlayerSummaries(),
      scoresByPlayerId: cloneScores(),
    }
  }

  function render(publicState) {
    var state = publicState || createPublicState()

    root.className = 'mazer-table mazer-table-' + state.phase
    status.textContent = state.statusText
    renderCountdown()
    board.render(createTableRenderState(state), null)
    renderScoreboard(state)
    renderGuesses(state)
  }

  function createTableRenderState(state) {
    var tableState = state
    var visiblePath
    var roundState

    if (state.phase !== 'simulating' || !state.round) {
      return tableState
    }

    visiblePath = getVisibleLaserPath(round.laserPath)
    roundState = copyRoundForRender(state.round, visiblePath, round.correctTarget, round.laserPath.length)
    tableState = {
      name: state.name,
      phase: state.phase,
      statusText: state.statusText,
      board: state.board,
      round: roundState,
      players: state.players,
      scoresByPlayerId: state.scoresByPlayerId,
    }

    return tableState
  }

  function copyRoundForRender(sourceRound, visiblePath, correctTarget, fullPathLength) {
    return {
      number: sourceRound.number,
      mirrorCount: sourceRound.mirrorCount,
      cannon: sourceRound.cannon,
      laserPath: visiblePath,
      correctTarget: visiblePath.length >= fullPathLength ? correctTarget : null,
      guessesByPlayerId: sourceRound.guessesByPlayerId,
      endsAt: sourceRound.endsAt,
    }
  }

  function renderScoreboard(state) {
    var heading = createNode('h2', 'mazer-panel-title')
    var index
    var player
    var row
    var name
    var score

    heading.textContent = 'Scores'
    clearNode(scoreboard)
    scoreboard.appendChild(heading)

    for (index = 0; index < state.players.length; index += 1) {
      player = state.players[index]
      row = createNode('div', 'mazer-score-row')
      name = createNode('span', 'mazer-score-name')
      score = createNode('strong', 'mazer-score-value')
      name.textContent = player.nick
      score.textContent = String(player.score)
      row.appendChild(name)
      row.appendChild(score)
      scoreboard.appendChild(row)
    }
  }

  function renderGuesses(state) {
    var heading = createNode('h2', 'mazer-panel-title')
    var index
    var player
    var row
    var guess

    heading.textContent = 'Guesses'
    clearNode(guesses)
    guesses.appendChild(heading)

    for (index = 0; index < state.players.length; index += 1) {
      player = state.players[index]
      guess = state.round ? state.round.guessesByPlayerId[player.playerId] : null
      row = createNode('p', 'mazer-guess-row')
      row.textContent = player.nick + ': ' + formatGuess(guess, state.phase)
      guesses.appendChild(row)
    }
  }

  function getStatusText() {
    if (players.length < 1) {
      return 'Waiting for at least one player.'
    }

    if (!round) {
      return 'Preparing the board.'
    }

    if (phase === 'guessing') {
      return 'Round ' + round.number + ': choose where the laser exits.'
    }

    if (phase === 'simulating') {
      return 'Laser firing.'
    }

    if (phase === 'scoring') {
      return 'Correct target: ' + formatTarget(round.correctTarget) + '. Next board incoming.'
    }

    return 'Waiting for players.'
  }

  function formatGuess(guess, currentPhase) {
    if (!guess) {
      return currentPhase === 'guessing' ? 'thinking' : 'no guess'
    }

    if (guess.correct === true) {
      return formatTarget(guess.target) + ' correct'
    }

    if (guess.correct === false) {
      return formatTarget(guess.target) + ' wrong'
    }

    return 'locked'
  }



  function shouldSendLaserPath() {
    return phase === 'simulating' || phase === 'scoring'
  }

  function shouldSendCorrectTarget() {
    return phase === 'scoring'
  }

  function ensureScores() {
    var index
    var player

    for (index = 0; index < players.length; index += 1) {
      player = players[index]

      if (typeof scoresByPlayerId[player.playerId] !== 'number') {
        scoresByPlayerId[player.playerId] = 0
      }
    }
  }

  function getPlayerSummaries() {
    var summaries = []
    var index
    var player

    for (index = 0; index < players.length; index += 1) {
      player = players[index]
      summaries.push({
        playerId: player.playerId,
        nick: player.nick,
        score: scoresByPlayerId[player.playerId] || 0,
      })
    }

    return summaries
  }

  function cloneMirrors(mirrors) {
    var output = []
    var index
    var mirror

    for (index = 0; index < mirrors.length; index += 1) {
      mirror = mirrors[index]
      output.push({ x: mirror.x, y: mirror.y, type: mirror.type })
    }

    return output
  }

  function cloneLaserPath(path) {
    var output = []
    var index
    var step

    for (index = 0; index < path.length; index += 1) {
      step = path[index]
      output.push({ x: step.x, y: step.y, direction: step.direction, mirror: step.mirror })
    }

    return output
  }

  function cloneGuesses(guessesById) {
    var output = {}
    var key
    var guess

    for (key in guessesById) {
      guess = guessesById[key]
      output[key] = {
        target: cloneTarget(guess.target),
        correct: guess.correct,
      }
    }

    return output
  }

  function cloneScores() {
    var output = {}
    var key

    for (key in scoresByPlayerId) {
      output[key] = scoresByPlayerId[key]
    }

    return output
  }

  function cloneTarget(target) {
    if (!target) {
      return null
    }

    return {
      side: target.side,
      coordinate: target.coordinate,
      x: target.x,
      y: target.y,
      direction: target.direction,
    }
  }

  function createMirrorMap(mirrors) {
    var output = {}
    var index
    var mirror

    for (index = 0; index < mirrors.length; index += 1) {
      mirror = mirrors[index]
      output[mirror.x + ':' + mirror.y] = mirror
    }

    return output
  }






  function isInsideBoard(x, y) {
    return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE
  }

  function isCurrentPlayer(playerId) {
    var index

    for (index = 0; index < players.length; index += 1) {
      if (players[index].playerId === playerId) {
        return true
      }
    }

    return false
  }

  function countGuesses() {
    var count = 0
    var index

    for (index = 0; index < players.length; index += 1) {
      if (round.guessesByPlayerId[players[index].playerId]) {
        count += 1
      }
    }

    return count
  }

  function randomInt(max) {
    return Math.floor(Math.random() * max)
  }



  function stopTimer() {
    if (timerId) {
      window.clearTimeout(timerId)
      timerId = 0
    }
  }

  function startCountdown() {
    stopCountdown()
    renderCountdown()
    countdownTimerId = window.setInterval(renderCountdown, 250)
  }

  function stopCountdown() {
    if (countdownTimerId) {
      window.clearInterval(countdownTimerId)
      countdownTimerId = 0
    }
  }

  function startLaserAnimation() {
    stopLaserAnimation()
    laserAnimationTimerId = window.setInterval(render, LASER_ANIMATION_TICK_MS)
  }

  function stopLaserAnimation() {
    if (laserAnimationTimerId) {
      window.clearInterval(laserAnimationTimerId)
      laserAnimationTimerId = 0
    }
  }

  function getVisibleLaserPath(path) {
    var elapsed
    var visibleCount

    if (!round || !round.simulationStartedAt) {
      return []
    }

    elapsed = Date.now() - round.simulationStartedAt
    visibleCount = getVisibleLaserCellCount(path, elapsed)
    return path.slice(0, visibleCount)
  }

  function getLaserAnimationMs(path) {
    if (!path || path.length < 1) {
      return 0
    }

    return Math.ceil((path.length * LASER_VELOCITY_TICK_MS) / LASER_CELLS_PER_VELOCITY_TICK)
  }


  function renderCountdown() {
    var remainingMs
    var seconds

    if (phase !== 'guessing' || !round) {
      countdown.textContent = ''
      countdown.className = 'mazer-countdown mazer-countdown-hidden'
      return
    }

    remainingMs = round.endsAt - Date.now()

    if (remainingMs < 0) {
      remainingMs = 0
    }

    seconds = Math.ceil(remainingMs / 1000)
    countdown.className = seconds <= 3 ? 'mazer-countdown mazer-countdown-low' : 'mazer-countdown'
    countdown.textContent = String(seconds)
  }

  function installStyles() {
    var style = document.createElement('style')

    style.textContent =
      ':root{font-size:calc(6px + 1.2vmin)}' +
      'html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#101820;color:#f8fafc;font-family:Arial,sans-serif}' +
      '.mazer-table{width:100%;height:100%;box-sizing:border-box;padding:2.4vw;display:block}' +
      '.mazer-table-simulating .mazer-board-host{animation:mazer-table-fire 180ms linear 1}' +
      '.mazer-header{height:8%;min-height:0}' +
      '.mazer-status{margin:.5vw 0 0;font-size:1.8rem;line-height:1.18;color:#d5f3e5}' +
      '.mazer-countdown{position:absolute;top:2.4vw;right:2.4vw;min-width:8vw;height:8vw;border:4px solid #38bdf8;border-radius:8px;background:#0f172a;color:#f8fafc;font-size:4.7rem;line-height:8vw;text-align:center;font-weight:900}' +
      '.mazer-countdown-low{border-color:#f97316;color:#fed7aa}' +
      '.mazer-countdown-hidden{display:none}' +
      '.mazer-content{height:92%;white-space:nowrap}' +
      '.mazer-board-host{display:inline-block;vertical-align:top;width:68%;height:100%}' +
      '.mazer-side{display:inline-block;vertical-align:top;width:29%;height:100%;margin-left:2%;box-sizing:border-box}' +
      '.mazer-panel-title{margin:0 0 1vw;font-size:1.7rem;line-height:1;color:#7dd3fc;text-transform:uppercase}' +
      '.mazer-scoreboard,.mazer-guesses{border:2px solid #334155;border-radius:8px;background:#0f172a;padding:1.4vw;margin-bottom:1.5vw;box-sizing:border-box}' +
      '.mazer-score-row{display:block;overflow:hidden;margin:.8vw 0;font-size:1.7rem;line-height:1.2}' +
      '.mazer-score-name{float:left;max-width:70%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.mazer-score-value{float:right;color:#fde047}' +
      '.mazer-guess-row{margin:.8vw 0;font-size:1.25rem;line-height:1.25;white-space:normal;color:#e5e7eb}' +
      '@keyframes mazer-table-fire{0%{filter:brightness(1)}35%{filter:brightness(1.7)}100%{filter:brightness(1)}}'
    document.head.appendChild(style)
  }
}())
