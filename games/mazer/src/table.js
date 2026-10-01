import { startMatch, sendToAllHands, endMatch } from '@juxhouse/tardi-core/table'
import { createMazerBoard } from './shared/mazer-board.js'
import { BOARD_SIZE, clearNode, createNode, getVisibleLaserCellCount, isValidTarget, targetsEqual } from './shared/mazer-geometry.js'
import { createMazerRound } from './shared/mazer-round.js'

;(function () {
  var GAME_NAME = 'Mazer'
  var MODE_EVERYONE = 'everyone'
  var MODE_RUSH = 'rush'
  var MATCH_ROUNDS = 8
  var GUESS_MS = 12000
  var LASER_CELLS_PER_VELOCITY_TICK = 10
  var LASER_VELOCITY_TICK_MS = 100
  var LASER_ANIMATION_TICK_MS = 35
  var SCORING_MS = 2600
  var POINTS_CORRECT = 10
  var SPEED_BONUSES = [3, 2, 1]

  var players = []
  var scoresByPlayerId = {}
  var phase = 'waiting_for_players'
  var mode = MODE_EVERYONE
  var roundNumber = 0
  var roundSequence = 0
  var suddenDeathNumber = 0
  var suddenDeathPlayerIds = []
  var round = null
  var winners = []
  var timerId = 0
  var countdownTimerId = 0
  var laserAnimationTimerId = 0

  var root = createNode('main', 'mazer-table')
  var header = createNode('header', 'mazer-header')
  var status = createNode('p', 'mazer-status')
  var countdown = createNode('div', 'mazer-countdown mazer-countdown-hidden')
  var content = createNode('section', 'mazer-content')
  var boardHost = createNode('div', 'mazer-board-host')
  var sidePanel = createNode('aside', 'mazer-side')
  var matchInfo = createNode('div', 'mazer-match-info')
  var scoreboard = createNode('div', 'mazer-scoreboard')
  var board = createMazerBoard({ interactive: false })

  installStyles()
  document.body.appendChild(root)
  root.appendChild(header)
  header.appendChild(status)
  header.appendChild(countdown)
  root.appendChild(content)
  content.appendChild(boardHost)
  boardHost.appendChild(board.element)
  content.appendChild(sidePanel)
  sidePanel.appendChild(matchInfo)
  sidePanel.appendChild(scoreboard)
  render()

  startMatch({
    onMessage: onMessage,
    onPlayersChange: onPlayersChange,
  })

  function onPlayersChange(event) {
    players = (event.players || []).slice()
    ensureScores()

    if (players.length < 1) {
      resetToWaiting()
      return
    }

    if (phase === 'waiting_for_players') {
      phase = 'choosing_mode'
      broadcast()
      return
    }

    if (phase === 'guessing' && countEligibleConnectedPlayers() > 0 && allEligiblePlayersGuessed()) {
      resolveRound('all_guessed')
      return
    }

    broadcast()
  }

  function onMessage(event) {
    var action = event.messageFromHand

    if (!action || !isCurrentPlayer(event.playerId)) {
      return
    }

    if (action.type === 'start_match') {
      if (phase === 'choosing_mode' && isValidMode(action.mode)) {
        beginMatch(action.mode)
      }
      return
    }

    if (action.type !== 'submit_guess' || phase !== 'guessing' || !round) {
      return
    }

    receiveGuess(event.playerId, action.target)
  }

  function beginMatch(nextMode) {
    stopEverything()
    mode = nextMode
    scoresByPlayerId = {}
    ensureScores()
    roundNumber = 0
    roundSequence = 0
    suddenDeathNumber = 0
    suddenDeathPlayerIds = []
    winners = []
    round = null
    startNextRound(false)
  }

  function receiveGuess(playerId, target) {
    var guess

    if (!isEligiblePlayer(playerId) || round.guessesByPlayerId[playerId] || !isValidTarget(target)) {
      return
    }

    guess = {
      target: { side: target.side, coordinate: Number(target.coordinate) },
      correct: false,
      submittedAt: Date.now(),
      submittedOrder: round.nextGuessOrder,
    }
    round.nextGuessOrder += 1
    guess.correct = targetsEqual(guess.target, round.correctTarget)
    round.guessesByPlayerId[playerId] = guess

    if (mode === MODE_RUSH && guess.correct) {
      resolveRound('correct_guess')
      return
    }

    if (allEligiblePlayersGuessed()) {
      resolveRound('all_guessed')
      return
    }

    broadcast()
  }

  function startNextRound(isSuddenDeath) {
    var generated

    stopEverything()

    if (isSuddenDeath) {
      suddenDeathNumber += 1
    } else {
      roundNumber += 1
    }

    roundSequence += 1
    generated = createMazerRound(roundNumber, isSuddenDeath)
    round = {
      id: roundSequence,
      number: roundNumber,
      isSuddenDeath: isSuddenDeath,
      suddenDeathNumber: isSuddenDeath ? suddenDeathNumber : 0,
      difficulty: generated.difficulty,
      mirrorCount: generated.mirrorCount,
      pathLength: generated.pathLength,
      mirrorHits: generated.mirrorHits,
      repeatedCells: generated.repeatedCells,
      mirrors: generated.mirrors,
      cannon: generated.cannon,
      laserPath: generated.laserPath,
      correctTarget: generated.correctTarget,
      eligiblePlayerIds: getRoundPlayerIds(isSuddenDeath),
      guessesByPlayerId: {},
      nextGuessOrder: 0,
      pointsByPlayerId: {},
      endsAt: Date.now() + GUESS_MS,
      resolutionReason: '',
      simulationStartedAt: 0,
      scored: false,
    }
    phase = 'guessing'
    timerId = window.setTimeout(resolveRoundFromTimeout, GUESS_MS)
    startCountdown()
    broadcast()
  }

  function resolveRoundFromTimeout() {
    resolveRound('timeout')
  }

  function resolveRound(reason) {
    if (phase !== 'guessing' || !round) {
      return
    }

    stopTimer()
    stopCountdown()
    phase = 'simulating'
    round.simulationStartedAt = Date.now()
    round.resolutionReason = reason || ''
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
    timerId = window.setTimeout(advanceAfterScoring, SCORING_MS)
  }

  function advanceAfterScoring() {
    var leaders

    if (round.isSuddenDeath || roundNumber >= MATCH_ROUNDS) {
      leaders = getLeadingPlayers()

      if (leaders.length === 1 || players.length < 2) {
        finishMatch(leaders)
        return
      }

      suddenDeathPlayerIds = getPlayerIds(leaders)
      startNextRound(true)
      return
    }

    startNextRound(false)
  }

  function finishMatch(leaders) {
    var victor

    stopEverything()
    winners = leaders.length > 0 ? leaders : getLeadingPlayers()
    phase = 'game_over'
    broadcast()
    victor = winners.length === 1 ? winners[0].playerId : null
    endMatch({ victor: victor })
  }

  function applyScores() {
    var correctGuesses = []
    var index
    var playerId
    var guess
    var points

    round.pointsByPlayerId = {}

    for (index = 0; index < round.eligiblePlayerIds.length; index += 1) {
      playerId = round.eligiblePlayerIds[index]
      guess = round.guessesByPlayerId[playerId]

      if (guess && guess.correct) {
        correctGuesses.push({
          playerId: playerId,
          submittedAt: guess.submittedAt,
          submittedOrder: guess.submittedOrder,
        })
      }
    }

    correctGuesses.sort(function (left, right) {
      return (left.submittedAt - right.submittedAt) || (left.submittedOrder - right.submittedOrder)
    })

    for (index = 0; index < correctGuesses.length; index += 1) {
      playerId = correctGuesses[index].playerId
      points = POINTS_CORRECT

      if (mode === MODE_EVERYONE && round.eligiblePlayerIds.length > 1 && index < SPEED_BONUSES.length) {
        points += SPEED_BONUSES[index]
      }

      if (typeof scoresByPlayerId[playerId] !== 'number') {
        scoresByPlayerId[playerId] = 0
      }

      scoresByPlayerId[playerId] += points
      round.pointsByPlayerId[playerId] = points
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
      mode: mode,
      modeName: getModeName(mode),
      matchRounds: MATCH_ROUNDS,
      statusText: getStatusText(),
      board: {
        width: BOARD_SIZE,
        height: BOARD_SIZE,
        mirrors: round ? cloneMirrors(round.mirrors) : [],
      },
      round: round ? cloneRound() : null,
      players: getPlayerSummaries(),
      scoresByPlayerId: cloneScores(),
      winners: getPlayerSummariesFor(winners),
    }
  }

  function cloneRound() {
    return {
      id: round.id,
      number: round.number,
      isSuddenDeath: round.isSuddenDeath,
      suddenDeathNumber: round.suddenDeathNumber,
      difficulty: round.difficulty,
      mirrorCount: round.mirrorCount,
      pathLength: round.pathLength,
      mirrorHits: round.mirrorHits,
      cannon: cloneTarget(round.cannon),
      laserPath: shouldSendLaserPath() ? cloneLaserPath(round.laserPath) : [],
      correctTarget: shouldSendCorrectTarget() ? cloneTarget(round.correctTarget) : null,
      eligiblePlayerIds: round.eligiblePlayerIds.slice(),
      guessesByPlayerId: cloneGuesses(round.guessesByPlayerId),
      pointsByPlayerId: cloneNumberMap(round.pointsByPlayerId),
      endsAt: round.endsAt,
      resolutionReason: round.resolutionReason,
    }
  }

  function render(publicState) {
    var state = publicState || createPublicState()

    root.className = 'mazer-table mazer-table-' + state.phase
    status.textContent = state.statusText
    renderCountdown()
    board.render(createTableRenderState(state), null)
    renderMatchInfo(state)
    renderScoreboard(state)
  }

  function createTableRenderState(state) {
    var visiblePath
    var tableState

    if (state.phase !== 'simulating' || !state.round) {
      return state
    }

    visiblePath = getVisibleLaserPath(round.laserPath)
    tableState = copyState(state)
    tableState.round = copyRoundForRender(state.round, visiblePath)
    return tableState
  }

  function copyState(state) {
    return {
      name: state.name,
      phase: state.phase,
      mode: state.mode,
      modeName: state.modeName,
      matchRounds: state.matchRounds,
      statusText: state.statusText,
      board: state.board,
      round: state.round,
      players: state.players,
      scoresByPlayerId: state.scoresByPlayerId,
      winners: state.winners,
    }
  }

  function copyRoundForRender(source, visiblePath) {
    var output = {}
    var key

    for (key in source) {
      output[key] = source[key]
    }

    output.laserPath = visiblePath
    output.correctTarget = visiblePath.length >= round.laserPath.length
      ? cloneTarget(round.correctTarget)
      : null
    return output
  }

  function renderMatchInfo(state) {
    var heading = createNode('h2', 'mazer-panel-title')
    var modeText = createNode('p', 'mazer-info-line')
    var roundText = createNode('p', 'mazer-info-line')
    var difficultyText = createNode('p', 'mazer-info-line')

    clearNode(matchInfo)
    heading.textContent = 'Match'
    matchInfo.appendChild(heading)

    if (state.phase === 'waiting_for_players' || state.phase === 'choosing_mode') {
      modeText.textContent = 'Choose a mode on any hand.'
      matchInfo.appendChild(modeText)
      return
    }

    modeText.textContent = state.modeName
    matchInfo.appendChild(modeText)

    if (state.round) {
      roundText.textContent = state.round.isSuddenDeath
        ? 'Sudden death ' + String(state.round.suddenDeathNumber)
        : 'Round ' + String(state.round.number) + ' of ' + String(state.matchRounds)
      difficultyText.textContent = capitalize(state.round.difficulty) + ' · ' +
        String(state.round.pathLength) + ' cells · ' + String(state.round.mirrorHits) + ' turns'
      matchInfo.appendChild(roundText)
      matchInfo.appendChild(difficultyText)
    }
  }

  function renderScoreboard(state) {
    var heading = createNode('h2', 'mazer-panel-title')
    var summaries = state.players.slice()
    var index
    var player
    var row
    var name
    var score

    summaries.sort(function (left, right) {
      return right.score - left.score
    })
    heading.textContent = state.phase === 'game_over' ? 'Final scores' : 'Scores'
    clearNode(scoreboard)
    scoreboard.appendChild(heading)

    for (index = 0; index < summaries.length; index += 1) {
      player = summaries[index]
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

  function getStatusText() {
    var correctPlayers

    if (players.length < 1) return 'Waiting for at least one player.'
    if (phase === 'choosing_mode') return 'Choose Everyone Guesses or Laser Rush on a hand.'
    if (phase === 'game_over') return getGameOverText()
    if (!round) return 'Preparing the board.'

    if (phase === 'guessing') {
      if (round.isSuddenDeath) return 'Sudden death: tied leaders are tracing the laser.'
      if (mode === MODE_RUSH) return 'First correct prediction wins the round.'
      return 'Waiting for every player to lock in a prediction.'
    }

    if (phase === 'simulating') return 'Tracing the laser…'

    correctPlayers = getCorrectPlayers()
    if (correctPlayers.length === 1) return correctPlayers[0].nick + ' found the exit.'
    if (correctPlayers.length > 1) return formatPlayerNames(correctPlayers) + ' found the exit.'
    if (round.resolutionReason === 'timeout') return 'Time ran out. No correct predictions.'
    return 'No correct predictions.'
  }

  function getGameOverText() {
    if (winners.length === 1) return winners[0].nick + ' wins the match!'
    if (winners.length > 1) return formatPlayerNames(winners) + ' share the win!'
    return 'Match complete.'
  }

  function getCorrectPlayers() {
    var output = []
    var index
    var player
    var guess

    if (!round) return output

    for (index = 0; index < players.length; index += 1) {
      player = players[index]
      guess = round.guessesByPlayerId[player.playerId]
      if (guess && guess.correct) output.push(player)
    }

    return output
  }

  function getLeadingPlayers() {
    var leaders = []
    var highScore = -Infinity
    var index
    var player
    var score

    for (index = 0; index < players.length; index += 1) {
      player = players[index]
      score = scoresByPlayerId[player.playerId] || 0
      if (score > highScore) {
        highScore = score
        leaders = [player]
      } else if (score === highScore) {
        leaders.push(player)
      }
    }

    return leaders
  }

  function getRoundPlayerIds(isSuddenDeath) {
    var source = isSuddenDeath ? suddenDeathPlayerIds : getPlayerIds(players)
    var output = []
    var index

    for (index = 0; index < source.length; index += 1) {
      if (isCurrentPlayer(source[index])) output.push(source[index])
    }

    return output
  }

  function getPlayerIds(sourcePlayers) {
    var output = []
    var index
    for (index = 0; index < sourcePlayers.length; index += 1) {
      output.push(sourcePlayers[index].playerId)
    }
    return output
  }

  function isEligiblePlayer(playerId) {
    var index
    if (!round) return false
    for (index = 0; index < round.eligiblePlayerIds.length; index += 1) {
      if (round.eligiblePlayerIds[index] === playerId) return true
    }
    return false
  }

  function allEligiblePlayersGuessed() {
    var index
    var playerId
    var connected = 0

    if (!round) return false

    for (index = 0; index < round.eligiblePlayerIds.length; index += 1) {
      playerId = round.eligiblePlayerIds[index]
      if (!isCurrentPlayer(playerId)) continue
      connected += 1
      if (!round.guessesByPlayerId[playerId]) return false
    }

    return connected > 0
  }

  function countEligibleConnectedPlayers() {
    var count = 0
    var index
    if (!round) return 0
    for (index = 0; index < round.eligiblePlayerIds.length; index += 1) {
      if (isCurrentPlayer(round.eligiblePlayerIds[index])) count += 1
    }
    return count
  }

  function isCurrentPlayer(playerId) {
    var index
    for (index = 0; index < players.length; index += 1) {
      if (players[index].playerId === playerId) return true
    }
    return false
  }

  function isValidMode(value) {
    return value === MODE_EVERYONE || value === MODE_RUSH
  }

  function getModeName(value) {
    return value === MODE_RUSH ? 'Laser Rush' : 'Everyone Guesses'
  }

  function ensureScores() {
    var index
    for (index = 0; index < players.length; index += 1) {
      if (typeof scoresByPlayerId[players[index].playerId] !== 'number') {
        scoresByPlayerId[players[index].playerId] = 0
      }
    }
  }

  function getPlayerSummaries() {
    return getPlayerSummariesFor(players)
  }

  function getPlayerSummariesFor(sourcePlayers) {
    var summaries = []
    var index
    var player
    for (index = 0; index < sourcePlayers.length; index += 1) {
      player = sourcePlayers[index]
      summaries.push({
        playerId: player.playerId,
        nick: player.nick,
        score: scoresByPlayerId[player.playerId] || 0,
      })
    }
    return summaries
  }

  function cloneGuesses(source) {
    var output = {}
    var reveal = phase !== 'guessing'
    var key
    var guess
    for (key in source) {
      guess = source[key]
      output[key] = {
        target: reveal ? cloneTarget(guess.target) : null,
        correct: reveal ? guess.correct : null,
      }
    }
    return output
  }

  function cloneMirrors(source) {
    var output = []
    var index
    for (index = 0; index < source.length; index += 1) {
      output.push({ x: source[index].x, y: source[index].y, type: source[index].type })
    }
    return output
  }

  function cloneLaserPath(source) {
    var output = []
    var index
    var step
    for (index = 0; index < source.length; index += 1) {
      step = source[index]
      output.push({ x: step.x, y: step.y, direction: step.direction, mirror: step.mirror })
    }
    return output
  }

  function cloneTarget(target) {
    if (!target) return null
    return {
      side: target.side,
      coordinate: target.coordinate,
      x: target.x,
      y: target.y,
      direction: target.direction,
    }
  }

  function cloneScores() {
    return cloneNumberMap(scoresByPlayerId)
  }

  function cloneNumberMap(source) {
    var output = {}
    var key
    for (key in source) output[key] = source[key]
    return output
  }

  function formatPlayerNames(sourcePlayers) {
    var names = []
    var index
    for (index = 0; index < sourcePlayers.length; index += 1) names.push(sourcePlayers[index].nick)
    if (names.length < 2) return names[0] || ''
    if (names.length === 2) return names[0] + ' and ' + names[1]
    return names.slice(0, names.length - 1).join(', ') + ', and ' + names[names.length - 1]
  }

  function capitalize(value) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : ''
  }

  function shouldSendLaserPath() {
    return phase === 'simulating' || phase === 'scoring' || phase === 'game_over'
  }

  function shouldSendCorrectTarget() {
    return phase === 'scoring' || phase === 'game_over'
  }

  function resetToWaiting() {
    stopEverything()
    phase = 'waiting_for_players'
    round = null
    winners = []
    broadcast()
  }

  function stopEverything() {
    stopTimer()
    stopCountdown()
    stopLaserAnimation()
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
    if (!round || !round.simulationStartedAt) return []
    elapsed = Date.now() - round.simulationStartedAt
    visibleCount = getVisibleLaserCellCount(path, elapsed)
    return path.slice(0, visibleCount)
  }

  function getLaserAnimationMs(path) {
    if (!path || path.length < 1) return 0
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
    if (remainingMs < 0) remainingMs = 0
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
      '.mazer-match-info,.mazer-scoreboard{border:2px solid #334155;border-radius:8px;background:#0f172a;padding:1.4vw;margin-bottom:1.5vw;box-sizing:border-box}' +
      '.mazer-info-line{margin:.6vw 0;font-size:1.3rem;line-height:1.2;white-space:normal;color:#d5f3e5}' +
      '.mazer-score-row{display:block;overflow:hidden;margin:.8vw 0;font-size:1.7rem;line-height:1.2}' +
      '.mazer-score-name{float:left;max-width:70%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.mazer-score-value{float:right;color:#fde047}' +
      '@keyframes mazer-table-fire{0%{filter:brightness(1)}35%{filter:brightness(1.7)}100%{filter:brightness(1)}}'
    document.head.appendChild(style)
  }
}())
