import { joinMatch, sendToTable } from '@juxhouse/tardi-core/hand'
import { createMazerBoard } from './shared/mazer-board.js'
import { clearNode, createNode, createVariedTileBackground, getVisibleLaserCellCount, isValidTarget } from './shared/mazer-geometry.js'

;(function () {
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
  var roundLabel = createNode('p', 'mazer-round-label')
  var status = createNode('p', 'mazer-status')
  var countdown = createNode('div', 'mazer-countdown mazer-countdown-hidden')
  var boardHost = createNode('div', 'mazer-board-host')
  var board = createMazerBoard({
    interactive: true,
    onTargetSelected: onBoardTargetSelected,
  })

  installStyles()
  root.style.backgroundImage = createVariedTileBackground({ r: 24, g: 33, b: 40 }, 18, 41, 1)
  document.body.appendChild(root)
  root.appendChild(header)
  header.appendChild(title)
  header.appendChild(countdown)
  header.appendChild(roundLabel)
  header.appendChild(status)
  root.appendChild(boardHost)
  boardHost.appendChild(board.element)
  render()

  joinMatch({ onStateChange: onStateChange })

  function onStateChange(envelope) {
    var state = envelope.messageFromTable
    var myGuess

    latestEnvelope = envelope

    if (state && state.round) {
      myGuess = state.round.guessesByPlayerId[envelope.playerId]

      if (state.phase === 'simulating' && state.round.id !== simulationRound) {
        stopCountdown()
        startSimulationAnimation(state.round.id)
      } else if (state.phase !== 'simulating') {
        stopSimulationAnimation()
      }

      if (state.phase === 'guessing') startCountdown()
      else stopCountdown()

      if (state.round.id !== submittedRound && !myGuess) {
        submittedRound = 0
        selectedTarget = null
      }
    } else {
      stopSimulationAnimation()
      stopCountdown()
      submittedRound = 0
      selectedTarget = null
    }

    render()
  }

  function onBoardTargetSelected(target) {
    var state = getTableState()

    if (!canSubmitGuess(state) || !isValidTarget(target)) return

    selectedTarget = { side: target.side, coordinate: target.coordinate }
    submittedRound = state.round.id
    sendToTable({
      type: 'submit_guess',
      target: { side: selectedTarget.side, coordinate: selectedTarget.coordinate },
    })
    render()
  }

  function render() {
    var state = getTableState()
    var phase = state ? state.phase : 'loading'

    root.className = 'mazer-hand mazer-hand-' + phase
    title.textContent = state && state.name ? state.name : 'Mazer'
    roundLabel.textContent = getRoundLabel(state)
    status.textContent = getStatusText(state, phase)
    renderCountdown()
    board.render(createRenderState(state), selectedTarget)
  }

  function getRoundLabel(state) {
    if (!state || !state.round) return ''
    return 'Round ' + String(state.round.number) + ' of ' + String(state.matchRounds)
  }

  function getStatusText(state, phase) {
    var myGuess
    var points

    if (!state) return 'Connecting to table.'

    if (phase === 'guessing') {
      if (!isEligible(state)) {
        return 'You joined during this round. You will play in the next one.'
      }
      if (hasSubmittedGuess()) return 'Guess locked. Waiting for the round to finish.'
      return 'Choose an exit. Everyone gets one attempt.'
    }

    if (phase === 'simulating') return 'Tracing the laser…'

    if (phase === 'scoring') {
      myGuess = getMyGuess()
      points = getMyRoundPoints(state)
      if (myGuess && myGuess.correct) return 'Correct! +' + String(points) + ' points.'
      if (myGuess) return 'That exit was incorrect.'
      return state.round.resolutionReason === 'timeout' ? 'Time ran out.' : 'No guess submitted.'
    }

    if (phase === 'game_over' && isWinner(state)) {
      return state.winners.length > 1 ? 'You share the win!' : 'You win the match!'
    }

    return state.statusText || 'Connecting to table.'
  }

  function isWinner(state) {
    var winners = state && state.winners ? state.winners : []
    var playerId = latestEnvelope ? latestEnvelope.playerId : ''
    var index

    for (index = 0; index < winners.length; index += 1) {
      if (winners[index].playerId === playerId) return true
    }

    return false
  }

  function getMyRoundPoints(state) {
    var playerId = latestEnvelope ? latestEnvelope.playerId : ''
    return state && state.round && state.round.pointsByPlayerId[playerId]
      ? state.round.pointsByPlayerId[playerId]
      : 0
  }

  function canSubmitGuess(state) {
    return !!state && state.phase === 'guessing' && isEligible(state) && !hasSubmittedGuess()
  }

  function isEligible(state) {
    var ids = state && state.round ? state.round.eligiblePlayerIds : []
    var playerId = latestEnvelope ? latestEnvelope.playerId : ''
    var index
    for (index = 0; index < ids.length; index += 1) {
      if (ids[index] === playerId) return true
    }
    return false
  }

  function createRenderState(state) {
    var visiblePath
    var output

    if (!state || state.phase !== 'simulating' || !state.round) return state

    visiblePath = getVisibleLaserPath(state.round.laserPath)
    output = copyState(state)
    output.round = copyRound(state.round)
    output.round.laserPath = visiblePath
    output.round.correctTarget = null
    return output
  }

  function copyState(state) {
    return {
      name: state.name,
      phase: state.phase,
      matchRounds: state.matchRounds,
      statusText: state.statusText,
      board: state.board,
      round: state.round,
      players: state.players,
      scoresByPlayerId: state.scoresByPlayerId,
      winners: state.winners,
    }
  }

  function copyRound(source) {
    var output = {}
    var key
    for (key in source) output[key] = source[key]
    return output
  }

  function getTableState() {
    return latestEnvelope ? latestEnvelope.messageFromTable : null
  }

  function getMyGuess() {
    var state = getTableState()
    if (!state || !state.round || !latestEnvelope) return null
    return state.round.guessesByPlayerId[latestEnvelope.playerId] || null
  }

  function hasSubmittedGuess() {
    var state = getTableState()
    return !!getMyGuess() || !!(state && state.round && submittedRound === state.round.id)
  }

  function startSimulationAnimation(roundId) {
    stopSimulationAnimation()
    simulationRound = roundId
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
    if (!countdownTimerId) countdownTimerId = window.setInterval(renderCountdown, 250)
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
    if (remainingMs < 0) remainingMs = 0
    seconds = Math.ceil(remainingMs / 1000)
    countdown.className = seconds <= 3 ? 'mazer-countdown mazer-countdown-low' : 'mazer-countdown'
    countdown.textContent = String(seconds)
  }

  function getVisibleLaserPath(path) {
    var elapsed
    var visibleCount
    if (!path || path.length < 1 || !simulationStartedAt) return []
    elapsed = Date.now() - simulationStartedAt
    visibleCount = getVisibleLaserCellCount(path, elapsed)
    return path.slice(0, visibleCount)
  }

  function installStyles() {
    var style = document.createElement('style')
    style.textContent =
      ':root{font-size:calc(6px + 1.2vmin)}' +
      'html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#1f2329;color:#f8fafc;font-family:Arial,sans-serif}' +
      '.mazer-hand{width:100%;height:100%;box-sizing:border-box;padding:14px;display:block;background-color:#182128}' +
      '.mazer-hand-simulating .mazer-board-host{animation:mazer-hand-fire 180ms linear 1}' +
      '.mazer-header{position:relative;height:18%;min-height:88px;box-sizing:border-box}' +
      '.mazer-title{display:inline-block;margin:0;font-size:2.2rem;line-height:1;font-weight:900}' +
      '.mazer-round-label{display:block;margin:5px 0 0;font-size:1rem;color:#7dd3fc}' +
      '.mazer-status{margin:7px 0 0;font-size:1.25rem;line-height:1.2;color:#d5f3e5}' +
      '.mazer-countdown{display:inline-block;vertical-align:top;min-width:48px;height:42px;margin:-5px 0 0 12px;border:3px solid #64748b;border-radius:0;background:#111827;color:#f8fafc;font-size:2.2rem;line-height:42px;text-align:center;font-weight:900;box-shadow:4px 4px 0 #020617}' +
      '.mazer-countdown-low{border-color:#f97316;color:#fed7aa}' +
      '.mazer-countdown-hidden{display:none}' +
      '.mazer-board-host{height:82%}' +
      '@media(max-width:240px){' +
        '.mazer-hand{padding:10px}' +
      '}' +
      '@keyframes mazer-hand-fire{0%{filter:brightness(1)}35%{filter:brightness(1.7)}100%{filter:brightness(1)}}'
    document.head.appendChild(style)
  }
}())
