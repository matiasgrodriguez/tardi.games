import { joinMatch, sendToTable } from '@juxhouse/tardi-core/hand'
import { createMazerBoard } from './shared/mazer-board.js'
import { clearNode, createNode, formatTarget, getVisibleLaserCellCount, isValidTarget } from './shared/mazer-geometry.js'

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

  var root = createNode('main', 'mazer-hand')
  var header = createNode('header', 'mazer-header')
  var title = createNode('h1', 'mazer-title')
  var status = createNode('p', 'mazer-status')
  var boardHost = createNode('div', 'mazer-board-host')
  var footer = createNode('footer', 'mazer-footer')
  var guessText = createNode('p', 'mazer-guess-text')
  var board = createMazerBoard({
    interactive: true,
    onTargetSelected: onBoardTargetSelected,
  })

  installStyles()
  document.body.appendChild(root)
  root.appendChild(header)
  header.appendChild(title)
  header.appendChild(status)
  root.appendChild(boardHost)
  boardHost.appendChild(board.element)
  root.appendChild(footer)
  footer.appendChild(guessText)
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
        startSimulationAnimation(state.round.number)
      } else if (state.phase !== 'simulating') {
        stopSimulationAnimation()
      }

      if (state.round.number !== submittedRound && !myGuess) {
        submittedRound = 0
        selectedTarget = null
      }
    } else {
      stopSimulationAnimation()
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
    var myGuess = getMyGuess()
    var phase = state ? state.phase : 'loading'

    root.className = 'mazer-hand mazer-hand-' + phase
    title.textContent = state && state.name ? state.name : 'Mazer'
    status.textContent = state && state.statusText ? state.statusText : 'Connecting to table.'
    board.render(createRenderState(state), selectedTarget)

    if (phase === 'simulating') {
      guessText.textContent = 'Laser firing...'
    } else if (myGuess) {
      guessText.textContent = 'Guess locked: ' + formatTarget(myGuess.target)
    } else if (selectedTarget) {
      guessText.textContent = 'Guess locked: ' + formatTarget(selectedTarget)
    } else {
      guessText.textContent = 'Tap an outer coordinate to predict the exit.'
    }
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
      'html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#071512;color:#f8fafc;font-family:Arial,sans-serif}' +
      '.mazer-hand{width:100%;height:100%;box-sizing:border-box;padding:14px;display:block}' +
      '.mazer-hand-simulating .mazer-board-host{animation:mazer-hand-fire 180ms linear 1}' +
      '.mazer-header{height:16%;min-height:78px}' +
      '.mazer-title{margin:0;font-size:3.3rem;line-height:1;font-weight:900}' +
      '.mazer-status{margin:8px 0 0;font-size:1.4rem;line-height:1.2;color:#d5f3e5}' +
      '.mazer-board-host{height:64%}' +
      '.mazer-footer{height:20%;box-sizing:border-box;padding-top:12px}' +
      '.mazer-guess-text{margin:0;font-size:1.5rem;line-height:1.25;color:#e5e7eb}' +
      '@keyframes mazer-hand-fire{0%{filter:brightness(1)}35%{filter:brightness(1.7)}100%{filter:brightness(1)}}'
    document.head.appendChild(style)
  }
}())
