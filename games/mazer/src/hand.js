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
  var controls = createNode('section', 'mazer-controls mazer-controls-hidden')
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
    var texture = createModeTexture(value)

    button.type = 'button'
    button.setAttribute('data-mode', value)
    button.addEventListener('click', onModeSelected)
    name.textContent = label
    copy.textContent = description
    button.appendChild(texture)
    button.appendChild(name)
    button.appendChild(copy)
    return button
  }

  function createModeTexture(modeValue) {
    var layer = createNode('span', 'mazer-mode-texture')
    var baseColor = modeValue === 'rush'
      ? { r: 27, g: 23, b: 19 }
      : { r: 12, g: 25, b: 39 }
    var seed = modeValue === 'rush' ? 29 : 11
    var index
    var cell
    var offset

    for (index = 0; index < 48; index += 1) {
      cell = createNode('span', 'mazer-mode-texture-cell')
      offset = stableColorVariation(seed, index, 5)
      cell.style.backgroundColor = 'rgb(' +
        String(baseColor.r + offset) + ',' +
        String(baseColor.g + offset) + ',' +
        String(baseColor.b + offset) + ')'
      layer.appendChild(cell)
    }

    return layer
  }

  function stableColorVariation(seed, index, range) {
    var value = ((seed + 11) * 73856093) ^ ((index + 17) * 83492791)

    value = value & 0x7fffffff
    value = value % ((range * 2) + 1)
    return value - range
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
      '.mazer-hand{width:100%;height:100%;box-sizing:border-box;padding:14px;display:block;background-color:#182128}' +
      '.mazer-hand-simulating .mazer-board-host{animation:mazer-hand-fire 180ms linear 1}' +
      '.mazer-header{position:relative;height:18%;min-height:88px;box-sizing:border-box}' +
      '.mazer-hand-choosing_mode .mazer-header{height:13%;min-height:72px;border-bottom:4px solid #334155;padding-right:0}' +
      '.mazer-hand-choosing_mode .mazer-status,.mazer-hand-choosing_mode .mazer-round-label{display:none}' +
      '.mazer-title{display:inline-block;margin:0;font-size:2.2rem;line-height:1;font-weight:900}' +
      '.mazer-hand-choosing_mode .mazer-title{padding:7px 10px;background:#020617;color:#f8fafc;box-shadow:5px 5px 0 #0e7490;text-transform:uppercase;letter-spacing:.08em}' +
      '.mazer-round-label{display:block;margin:5px 0 0;font-size:1rem;color:#7dd3fc}' +
      '.mazer-status{margin:7px 0 0;font-size:1.25rem;line-height:1.2;color:#d5f3e5}' +
      '.mazer-countdown{display:inline-block;vertical-align:top;min-width:48px;height:42px;margin:-5px 0 0 12px;border:3px solid #64748b;border-radius:0;background:#111827;color:#f8fafc;font-size:2.2rem;line-height:42px;text-align:center;font-weight:900;box-shadow:4px 4px 0 #020617}' +
      '.mazer-countdown-low{border-color:#f97316;color:#fed7aa}' +
      '.mazer-countdown-hidden,.mazer-controls-hidden,.mazer-board-host-hidden{display:none}' +
      '.mazer-board-host{height:82%}' +
      '.mazer-controls{height:82%;box-sizing:border-box;padding:10px 2px;overflow:auto}' +
      '.mazer-hand-choosing_mode .mazer-controls{height:87%;padding:20px 7px 14px}' +
      '.mazer-controls-title{display:inline-block;margin:0 0 7px;padding:5px 9px;background:#fde047;color:#111827;font-size:1.75rem;line-height:1;text-transform:uppercase;letter-spacing:.05em;box-shadow:4px 4px 0 #92400e}' +
      '.mazer-controls-copy{margin:8px 0 18px;color:#cbd5e1;font-size:1.05rem}' +
      '.mazer-mode-button{display:block;position:relative;width:calc(100% - 7px);min-height:118px;margin:14px 7px 19px 0;padding:17px 16px;overflow:hidden;border:3px solid #38bdf8;border-radius:0;background-color:#0f172a;background-image:linear-gradient(rgba(56,189,248,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(56,189,248,.08) 1px,transparent 1px);background-size:15px 15px;box-shadow:7px 7px 0 #020617;color:#f8fafc;text-align:left;-webkit-appearance:none;appearance:none}' +
      '.mazer-mode-button[data-mode="rush"]{border-color:#f59e0b;background-image:linear-gradient(rgba(245,158,11,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(245,158,11,.08) 1px,transparent 1px)}' +
      '.mazer-mode-button:hover,.mazer-mode-button:focus-visible{filter:brightness(1.2);outline:3px solid #f8fafc;outline-offset:2px}' +
      '.mazer-mode-button:active{transform:translate(4px,4px);box-shadow:3px 3px 0 #020617}' +
      '.mazer-mode-button:disabled{opacity:.55;transform:none}' +
      '.mazer-mode-texture{position:absolute;z-index:0;top:0;right:0;bottom:0;left:0;display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(6,1fr);pointer-events:none}' +
      '.mazer-mode-texture-cell{display:block;border-right:1px solid rgba(148,163,184,.08);border-bottom:1px solid rgba(148,163,184,.08)}' +
      '.mazer-mode-name{display:block;position:relative;z-index:1;font-size:1.45rem;line-height:1.05;color:#67e8f9;text-transform:uppercase;letter-spacing:.035em}' +
      '.mazer-mode-button[data-mode="rush"] .mazer-mode-name{color:#fbbf24}' +
      '.mazer-mode-copy{display:block;position:relative;z-index:1;margin-top:9px;font-size:.95rem;line-height:1.3;color:#d5f3e5}' +
      '@media(max-width:240px){' +
        '.mazer-hand{padding:10px}' +
        '.mazer-hand-choosing_mode .mazer-title{font-size:1.7rem;padding:6px 8px;box-shadow:4px 4px 0 #0e7490}' +
        '.mazer-hand-choosing_mode .mazer-controls{padding:17px 3px 10px}' +
        '.mazer-controls-title{font-size:1.35rem;box-shadow:3px 3px 0 #92400e}' +
        '.mazer-controls-copy{font-size:.9rem;margin-bottom:14px}' +
        '.mazer-mode-button{width:calc(100% - 5px);min-height:130px;margin:12px 5px 16px 0;padding:13px 10px;border-width:2px;box-shadow:5px 5px 0 #020617}' +
        '.mazer-mode-name{font-size:1.05rem}' +
        '.mazer-mode-copy{margin-top:7px;font-size:.8rem;line-height:1.25}' +
      '}' +
      '@keyframes mazer-hand-fire{0%{filter:brightness(1)}35%{filter:brightness(1.7)}100%{filter:brightness(1)}}'
    document.head.appendChild(style)
  }
}())
