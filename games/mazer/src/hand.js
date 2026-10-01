import { joinMatch, sendToTable } from '@juxhouse/tardi-core/hand'
import { createMazerBoard } from './shared/mazer-board.js'
import { clearNode, createNode, getVisibleLaserCellCount, isValidTarget } from './shared/mazer-geometry.js'

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
  var controls = createNode('section', 'mazer-controls mazer-controls-hidden')
  var boardHost = createNode('div', 'mazer-board-host')
  var board = createMazerBoard({
    interactive: true,
    onTargetSelected: onBoardTargetSelected,
  })

  installStyles()
  document.body.appendChild(root)
  root.appendChild(header)
  header.appendChild(title)
  header.appendChild(roundLabel)
  header.appendChild(status)
  header.appendChild(countdown)
  root.appendChild(controls)
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

  function onModeSelected(event) {
    var button = event.currentTarget
    var state = getTableState()

    if (!state || state.phase !== 'choosing_mode') return

    sendToTable({ type: 'start_match', mode: button.getAttribute('data-mode') })
    disableModeButtons()
  }

  function render() {
    var state = getTableState()
    var phase = state ? state.phase : 'loading'

    root.className = 'mazer-hand mazer-hand-' + phase
    title.textContent = state && state.name ? state.name : 'Mazer'
    roundLabel.textContent = getRoundLabel(state)
    status.textContent = getStatusText(state, phase)
    renderCountdown()
    renderControls(state, phase)
    boardHost.className = shouldShowControls(phase)
      ? 'mazer-board-host mazer-board-host-hidden'
      : 'mazer-board-host'
    board.render(createRenderState(state), selectedTarget)
  }

  function renderControls(state, phase) {
    var heading
    var copy

    clearNode(controls)

    if (!shouldShowControls(phase)) {
      controls.className = 'mazer-controls mazer-controls-hidden'
      return
    }

    controls.className = 'mazer-controls'
    heading = createNode('h2', 'mazer-controls-title')
    copy = createNode('p', 'mazer-controls-copy')

    heading.textContent = 'Choose a mode'
    copy.textContent = 'Any player can start the match.'

    controls.appendChild(heading)
    controls.appendChild(copy)
    controls.appendChild(createModeButton(
      'Everyone Guesses',
      'everyone',
      'Everyone locks in one answer. Correct answers score, with small speed bonuses.'
    ))
    controls.appendChild(createModeButton(
      'Laser Rush',
      'rush',
      'One attempt each. A wrong answer locks you out; the first correct answer ends the round.'
    ))
  }

  function createModeButton(label, value, description) {
    var button = createNode('button', 'mazer-mode-button')
    var name = createNode('strong', 'mazer-mode-name')
    var copy = createNode('span', 'mazer-mode-copy')

    button.type = 'button'
    button.setAttribute('data-mode', value)
    button.addEventListener('click', onModeSelected)
    name.textContent = label
    copy.textContent = description
    button.appendChild(name)
    button.appendChild(copy)
    return button
  }

  function disableModeButtons() {
    var buttons = controls.getElementsByTagName('button')
    var index
    for (index = 0; index < buttons.length; index += 1) buttons[index].disabled = true
  }

  function shouldShowControls(phase) {
    return phase === 'choosing_mode'
  }

  function getRoundLabel(state) {
    if (!state || !state.round || shouldShowControls(state.phase)) return ''
    if (state.round.isSuddenDeath) return 'Sudden death ' + String(state.round.suddenDeathNumber)
    return state.modeName + ' · Round ' + String(state.round.number) + ' of ' + String(state.matchRounds)
  }

  function getStatusText(state, phase) {
    var myGuess
    var points

    if (!state) return 'Connecting to table.'

    if (phase === 'guessing') {
      if (!isEligible(state)) {
        return state.round.isSuddenDeath
          ? 'Watch the tied leaders play this sudden-death board.'
          : 'You joined during this round. You will play in the next one.'
      }
      if (hasSubmittedGuess()) return 'Guess locked. Waiting for the round to finish.'
      if (state.mode === 'rush') return 'One attempt: be the first player to find the correct exit.'
      return 'Choose an exit. Everyone gets one attempt.'
    }

    if (phase === 'simulating') return 'Tracing the laser…'

    if (phase === 'scoring') {
      myGuess = getMyGuess()
      points = getMyRoundPoints(state)
      if (myGuess && myGuess.correct) return 'Correct! +' + String(points) + ' points.'
      if (myGuess) return 'That exit was incorrect.'
      if (!isEligible(state)) return 'Sudden-death round complete.'
      return state.round.resolutionReason === 'timeout' ? 'Time ran out.' : 'No guess submitted.'
    }

    if (phase === 'game_over' && isWinner(state)) {
      return 'You win the match'
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
      '.mazer-hand{width:100%;height:100%;box-sizing:border-box;padding:14px;display:block}' +
      '.mazer-hand-simulating .mazer-board-host{animation:mazer-hand-fire 180ms linear 1}' +
      '.mazer-header{position:relative;height:18%;min-height:88px;padding-right:70px;box-sizing:border-box}' +
      '.mazer-title{display:inline-block;margin:0;font-size:2.2rem;line-height:1;font-weight:900}' +
      '.mazer-round-label{display:inline-block;margin:0 0 0 10px;font-size:1rem;color:#7dd3fc}' +
      '.mazer-status{margin:7px 0 0;font-size:1.25rem;line-height:1.2;color:#d5f3e5}' +
      '.mazer-countdown{position:absolute;top:0;right:0;min-width:54px;height:54px;border:3px solid #64748b;border-radius:8px;background:#111827;color:#f8fafc;font-size:2.6rem;line-height:54px;text-align:center;font-weight:900}' +
      '.mazer-countdown-low{border-color:#f97316;color:#fed7aa}' +
      '.mazer-countdown-hidden,.mazer-controls-hidden,.mazer-board-host-hidden{display:none}' +
      '.mazer-board-host{height:82%}' +
      '.mazer-controls{height:82%;box-sizing:border-box;padding:10px 2px;overflow:auto}' +
      '.mazer-controls-title{margin:0 0 6px;font-size:2rem}' +
      '.mazer-controls-copy{margin:0 0 14px;color:#cbd5e1;font-size:1.1rem}' +
      '.mazer-mode-button{display:block;width:100%;margin:10px 0;padding:14px;border:2px solid #38bdf8;border-radius:10px;background:#0f172a;color:#f8fafc;text-align:left}' +
      '.mazer-mode-button:active{background:#164e63}' +
      '.mazer-mode-button:disabled{opacity:.55}' +
      '.mazer-mode-name{display:block;font-size:1.5rem;color:#fde047}' +
      '.mazer-mode-copy{display:block;margin-top:5px;font-size:1rem;line-height:1.25;color:#d5f3e5}' +
      '@keyframes mazer-hand-fire{0%{filter:brightness(1)}35%{filter:brightness(1.7)}100%{filter:brightness(1)}}'
    document.head.appendChild(style)
  }
}())
