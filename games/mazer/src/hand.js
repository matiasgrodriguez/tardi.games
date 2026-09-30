import { joinMatch, sendToTable } from '@juxhouse/tardi-core/hand'
import { createMazerBoard } from './shared/mazer-board.js'
import { clearNode, createNode, getVisibleLaserCellCount, isValidTarget } from './shared/mazer-geometry.js'

;(function () {
  var LASER_CELLS_PER_VELOCITY_TICK = 10
  var LASER_VELOCITY_TICK_MS = 100
  var LASER_ANIMATION_TICK_MS = 35
  var latestEnvelope = null
  var selectedTarget = null
  var submittedRound = 0
  var simulationRound = 0
  var simulationStartedAt = 0
  var simulationTimerId = 0
  var countdownTimerId = 0

  var root = createNode('main', 'mazer-hand')
  var header = createNode('header', 'mazer-header')
  var title = createNode('h1', 'mazer-title')
  var status = createNode('p', 'mazer-status')
  var countdown = createNode('div', 'mazer-countdown mazer-countdown-hidden')
  var boardHost = createNode('div', 'mazer-board-host')
  var board = createMazerBoard({
    interactive: true,
    onTargetSelected: onBoardTargetSelected,
  })

  installStyles()
  document.body.appendChild(root)
  root.appendChild(header)
  header.appendChild(title)
  header.appendChild(status)
  header.appendChild(countdown)
  root.appendChild(boardHost)
  boardHost.appendChild(board.element)
  render()

  joinMatch({
    onStateChange: onStateChange,
  })

  function onStateChange(envelope) {
    var state = envelope.messageFromTable
    var myGuess

    latestEnvelope = envelope

    if (state && state.round) {
      myGuess = state.round.guessesByPlayerId[envelope.playerId]

      if (state.phase === 'simulating' && state.round.number !== simulationRound) {
        stopCountdown()
        startSimulationAnimation(state.round.number)
      } else if (state.phase !== 'simulating') {
        stopSimulationAnimation()
      }

      if (state.phase === 'guessing') {
        startCountdown()
      } else {
        stopCountdown()
      }

      if (state.round.number !== submittedRound && !myGuess) {
        submittedRound = 0
        selectedTarget = null
      }
    } else {
      stopSimulationAnimation()
      stopCountdown()
    }

    render()
  }

  function onBoardTargetSelected(target) {
    var state = getTableState()

    if (!state || state.phase !== 'guessing' || hasSubmittedGuess()) {
      return
    }

    if (!isValidTarget(target)) {
      return
    }

    selectedTarget = { side: target.side, coordinate: target.coordinate }
    submitGuess()
    render()
  }

  function submitGuess() {
    var state = getTableState()

    if (!state || state.phase !== 'guessing' || !selectedTarget || hasSubmittedGuess()) {
      return
    }

    submittedRound = state.round.number
    sendToTable({
      type: 'submit_guess',
      target: {
        side: selectedTarget.side,
        coordinate: selectedTarget.coordinate,
      },
    })
    render()
  }

  function render() {
    var state = getTableState()
    var phase = state ? state.phase : 'loading'

    root.className = 'mazer-hand mazer-hand-' + phase
    title.textContent = state && state.name ? state.name : 'Mazer'
    status.textContent = getStatusText(state, phase)
    renderCountdown()
    board.render(createRenderState(state), selectedTarget)
  }

  function getStatusText(state, phase) {
    if (phase === 'guessing') {
      return 'Tap an outer coordinate to predict where the laser exits before the other players do.'
    }

    if (phase === 'scoring') {
      return getScoringStatusText(state)
    }

    return state && state.statusText ? state.statusText : 'Connecting to table.'
  }

  function getScoringStatusText(state) {
    var missedText = getMissedStatusText(state)
    var winner = getCorrectPlayer(state)

    if (state && state.round && state.round.resolutionReason === 'timeout') {
      return 'Round timed out.'
    }

    if (winner) {
      if (latestEnvelope && winner.playerId === latestEnvelope.playerId) {
        return 'You won.'
      }

      return winner.nick + ' won.'
    }

    if (missedText) {
      return missedText
    }

    return state && state.statusText ? state.statusText : 'Next board incoming.'
  }

  function getCorrectPlayer(state) {
    var players = state && state.players ? state.players : []
    var guessesByPlayerId = state && state.round ? state.round.guessesByPlayerId : {}
    var index
    var player
    var guess

    for (index = 0; index < players.length; index += 1) {
      player = players[index]
      guess = guessesByPlayerId[player.playerId]

      if (guess && guess.correct === true) {
        return player
      }
    }

    return null
  }

  function getMissedStatusText(state) {
    var missedPlayers = getMissedPlayers(state)

    if (missedPlayers.length < 1) {
      return ''
    }

    if (latestEnvelope && containsPlayer(missedPlayers, latestEnvelope.playerId)) {
      return 'You missed the target.'
    }

    if (missedPlayers.length === 1) {
      return missedPlayers[0].nick + ' missed the target.'
    }

    return formatPlayerNames(missedPlayers) + ' missed the target.'
  }

  function getMissedPlayers(state) {
    var players = state && state.players ? state.players : []
    var guessesByPlayerId = state && state.round ? state.round.guessesByPlayerId : {}
    var missedPlayers = []
    var index
    var player
    var guess

    for (index = 0; index < players.length; index += 1) {
      player = players[index]
      guess = guessesByPlayerId[player.playerId]

      if (guess && guess.correct === false) {
        missedPlayers.push(player)
      }
    }

    return missedPlayers
  }

  function containsPlayer(players, playerId) {
    var index

    for (index = 0; index < players.length; index += 1) {
      if (players[index].playerId === playerId) {
        return true
      }
    }

    return false
  }

  function formatPlayerNames(players) {
    var names = []
    var index

    for (index = 0; index < players.length; index += 1) {
      names.push(players[index].nick)
    }

    if (names.length === 2) {
      return names[0] + ' and ' + names[1]
    }

    return names.slice(0, names.length - 1).join(', ') + ', and ' + names[names.length - 1]
  }

  function createRenderState(state) {
    var visiblePath

    if (!state || state.phase !== 'simulating' || !state.round) {
      return state
    }

    visiblePath = getVisibleLaserPath(state.round.laserPath)

    return {
      name: state.name,
      phase: state.phase,
      statusText: state.statusText,
      board: state.board,
      round: {
        number: state.round.number,
        mirrorCount: state.round.mirrorCount,
        cannon: state.round.cannon,
        laserPath: visiblePath,
        correctTarget: null,
        guessesByPlayerId: state.round.guessesByPlayerId,
        endsAt: state.round.endsAt,
        resolutionReason: state.round.resolutionReason,
      },
      players: state.players,
      scoresByPlayerId: state.scoresByPlayerId,
    }
  }

  function getTableState() {
    return latestEnvelope ? latestEnvelope.messageFromTable : null
  }

  function getMyGuess() {
    var state = getTableState()

    if (!state || !state.round || !latestEnvelope) {
      return null
    }

    return state.round.guessesByPlayerId[latestEnvelope.playerId] || null
  }

  function hasSubmittedGuess() {
    var state = getTableState()

    return !!getMyGuess() ||
      !!(state && state.round && submittedRound === state.round.number)
  }

  function startSimulationAnimation(roundNumber) {
    stopSimulationAnimation()
    simulationRound = roundNumber
    simulationStartedAt = Date.now()
    simulationTimerId = window.setInterval(render, LASER_ANIMATION_TICK_MS)
  }

  function stopSimulationAnimation() {
    if (simulationTimerId) {
      window.clearInterval(simulationTimerId)
      simulationTimerId = 0
    }
  }

  function startCountdown() {
    if (!countdownTimerId) {
      countdownTimerId = window.setInterval(renderCountdown, 250)
    }

    renderCountdown()
  }

  function stopCountdown() {
    if (countdownTimerId) {
      window.clearInterval(countdownTimerId)
      countdownTimerId = 0
    }
  }

  function renderCountdown() {
    var state = getTableState()
    var remainingMs
    var seconds

    if (!state || state.phase !== 'guessing' || !state.round) {
      countdown.textContent = ''
      countdown.className = 'mazer-countdown mazer-countdown-hidden'
      return
    }

    remainingMs = Number(state.round.endsAt) - Date.now()

    if (remainingMs < 0) {
      remainingMs = 0
    }

    seconds = Math.ceil(remainingMs / 1000)
    countdown.className = seconds <= 3 ? 'mazer-countdown mazer-countdown-low' : 'mazer-countdown'
    countdown.textContent = String(seconds)
  }

  function getVisibleLaserPath(path) {
    var elapsed
    var visibleCount

    if (!path || path.length < 1 || !simulationStartedAt) {
      return []
    }

    elapsed = Date.now() - simulationStartedAt
    visibleCount = getVisibleLaserCellCount(path, elapsed)
    return path.slice(0, visibleCount)
  }











  function installStyles() {
    var style = document.createElement('style')

    style.textContent =
      ':root{font-size:calc(6px + 1.2vmin)}' +
      'html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#1f2329;color:#f8fafc;font-family:Arial,sans-serif}' +
      '.mazer-hand{width:100%;height:100%;box-sizing:border-box;padding:14px;display:block}' +
      '.mazer-hand-simulating .mazer-board-host{animation:mazer-hand-fire 180ms linear 1}' +
      '.mazer-header{position:relative;height:16%;min-height:78px;padding-right:70px;box-sizing:border-box}' +
      '.mazer-title{margin:0;font-size:2.2rem;line-height:1;font-weight:900}' +
      '.mazer-status{margin:7px 0 0;font-size:1.4rem;line-height:1.2;color:#d5f3e5}' +
      '.mazer-countdown{position:absolute;top:0;right:0;min-width:54px;height:54px;border:3px solid #64748b;border-radius:8px;background:#111827;color:#f8fafc;font-size:2.6rem;line-height:54px;text-align:center;font-weight:900}' +
      '.mazer-countdown-low{border-color:#f97316;color:#fed7aa}' +
      '.mazer-countdown-hidden{display:none}' +
      '.mazer-board-host{height:84%}' +
      '@keyframes mazer-hand-fire{0%{filter:brightness(1)}35%{filter:brightness(1.7)}100%{filter:brightness(1)}}'
    document.head.appendChild(style)
  }
}())
