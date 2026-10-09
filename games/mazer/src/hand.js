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
  var roundInfo = createNode('div', 'mazer-round-info')
  var roundLabel = createNode('p', 'mazer-round-label')
  var status = createNode('p', 'mazer-status')
  var countdown = createNode('span', 'mazer-countdown mazer-countdown-hidden')
  var statusMeasure = createNode('p', 'mazer-status mazer-status-measure')
  var panels = createNode('section', 'mazer-panels mazer-panels-hidden')
  var matchInfo = createNode('div', 'mazer-match-info')
  var scoreboard = createNode('div', 'mazer-scoreboard')
  var panelSignature = ''
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
  header.appendChild(roundInfo)
  roundInfo.appendChild(roundLabel)
  roundInfo.appendChild(countdown)
  header.appendChild(status)
  header.appendChild(statusMeasure)
  statusMeasure.setAttribute('aria-hidden', 'true')
  root.appendChild(boardHost)
  boardHost.appendChild(board.element)
  root.appendChild(panels)
  panels.appendChild(matchInfo)
  panels.appendChild(scoreboard)
  window.addEventListener('resize', updateLayout)
  render()
  updateLayout()

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
    updateLayout()
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
    renderPanels(state)
    board.render(createRenderState(state), selectedTarget)
  }

  function renderPanels(state) {
    var show = state && state.hasSharedScreen === false
    var signature
    var heading
    var line
    var summaries
    var index
    var row
    var name
    var score
    panels.className = show ? 'mazer-panels' : 'mazer-panels mazer-panels-hidden'
    if (!show) return
    signature = JSON.stringify([state.phase === 'game_over', state.round && state.round.number, state.players])
    if (signature === panelSignature) return
    panelSignature = signature
    clearNode(matchInfo)
    clearNode(scoreboard)
    heading = createNode('h2', 'mazer-panel-title')
    heading.textContent = 'Match'
    matchInfo.appendChild(heading)
    line = createNode('p', 'mazer-info-line')
    line.textContent = getRoundLabel(state)
    matchInfo.appendChild(line)
    if (state.round) {
      line = createNode('p', 'mazer-info-line')
      line.textContent = state.round.difficulty.charAt(0).toUpperCase() + state.round.difficulty.slice(1) + ' · ' +
        String(state.round.pathLength) + ' cells · ' + String(state.round.mirrorHits) + ' turns'
      matchInfo.appendChild(line)
    }
    line = createNode('p', 'mazer-info-line')
    line.textContent = 'Correct: 100 points + up to 100 for speed'
    matchInfo.appendChild(line)
    heading = createNode('h2', 'mazer-panel-title')
    heading.textContent = state.phase === 'game_over' ? 'Final scores' : 'Scores'
    scoreboard.appendChild(heading)
    summaries = state.players.slice().sort(function (left, right) { return right.score - left.score })
    for (index = 0; index < summaries.length; index += 1) {
      row = createNode('div', 'mazer-score-row')
      name = createNode('span', 'mazer-score-name')
      score = createNode('strong', 'mazer-score-value')
      name.textContent = summaries[index].nick
      score.textContent = String(summaries[index].score)
      row.appendChild(name)
      row.appendChild(score)
      scoreboard.appendChild(row)
    }
  }

  // Reserve the tallest possible status for the current roster and width.
  // Shorter statuses reuse that space, keeping the board still between phases.
  function updateLayout() {
    var state = getTableState()
    var candidates = [
      'Connecting to table.',
      'You joined during this round. You will play in the next one.',
      'Guess locked. Waiting for the round to finish.',
      'Choose an exit. Everyone gets one attempt.',
      'Correct! +200 points.',
      'You share the win!',
    ]
    var names = []
    var joinedNames
    var height = 0
    var index
    var style
    var available
    var width
    if (state) {
      candidates.push(state.statusText || '')
      for (index = 0; index < state.players.length; index += 1) {
        names.push(state.players[index].nick)
        candidates.push(state.players[index].nick + ' wins the match!')
      }
      joinedNames = names.length > 2
        ? names.slice(0, names.length - 1).join(', ') + ', and ' + names[names.length - 1]
        : names.join(' and ')
      candidates.push(joinedNames + ' share the win!')
      candidates.push(joinedNames + ' found the exit.')
    }
    for (index = 0; index < candidates.length; index += 1) {
      statusMeasure.textContent = candidates[index]
      height = Math.max(height, statusMeasure.offsetHeight)
    }
    status.style.height = String(height) + 'px'
    style = window.getComputedStyle(root)
    width = root.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    available = window.innerHeight - header.offsetHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - 6
    // Fullscreen can make a phone-only viewport wider than it is tall.
    // Keep every exit visible at once, with scrolling only needed to reach
    // the panels below the maze.
    boardHost.style.height = String(Math.min(width, Math.max(110, available))) + 'px'
    board.resize()
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
      hasSharedScreen: state.hasSharedScreen,
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
      countdown.textContent = '12s remaining'
      countdown.className = 'mazer-countdown mazer-countdown-hidden'
      return
    }
    remainingMs = Number(state.round.endsAt) - Date.now()
    if (remainingMs < 0) remainingMs = 0
    seconds = Math.ceil(remainingMs / 1000)
    countdown.className = seconds <= 3 ? 'mazer-countdown mazer-countdown-low' : 'mazer-countdown'
    countdown.textContent = String(seconds) + 's remaining'
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
      'html,body{margin:0;width:100%;height:auto;min-height:100%;overflow-x:hidden;overflow-y:auto;background:#1f2329;color:#f8fafc;font-family:Arial,sans-serif}' +
      '.mazer-hand{width:100%;min-height:100vh;box-sizing:border-box;padding:14px;display:block;background-color:#182128}' +
      '.mazer-hand-simulating .mazer-board-host{animation:mazer-hand-fire 180ms linear 1}' +
      '.mazer-header{position:relative;box-sizing:border-box;min-height:76px;padding-right:80px}' +
      '.mazer-title{display:block;overflow-wrap:anywhere;margin:0;font-size:2.2rem;line-height:1;font-weight:900}' +
      '.mazer-round-info{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px;margin-top:4px;font-size:1rem;line-height:1.3}' +
      '.mazer-round-label{margin:0;color:#7dd3fc}' +
      '.mazer-status{margin:4px 0 0;font-size:1.25rem;line-height:1.2;color:#d5f3e5}' +
      '.mazer-countdown{display:block;min-width:8em;white-space:nowrap;color:#f8fafc;font-weight:900;font-variant-numeric:tabular-nums}' +
      '.mazer-countdown-low{color:#fed7aa}' +
      '.mazer-countdown-hidden{visibility:hidden}' +
      '.mazer-status{overflow-wrap:anywhere}' +
      '.mazer-status-measure{position:absolute;left:0;right:80px;top:0;visibility:hidden;pointer-events:none}' +
      '.mazer-board-host{margin-top:6px;width:100%}' +
      '.mazer-panels{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px;padding-bottom:4px}' +
      '.mazer-panels-hidden{display:none}' +
      '.mazer-match-info,.mazer-scoreboard{flex:1 1 150px;min-width:0;box-sizing:border-box;border:2px solid #334155;background:#0f172a;padding:10px;box-shadow:3px 3px 0 #020617;overflow-wrap:anywhere}' +
      '.mazer-panel-title{margin:0 0 8px;font-size:1.5rem;line-height:1.1;color:#7dd3fc;text-transform:uppercase}' +
      '.mazer-info-line{margin:6px 0;font-size:1.15rem;line-height:1.3;color:#d5f3e5}' +
      '.mazer-score-row{display:flex;align-items:baseline;gap:8px;margin:6px 0;font-size:1.3rem;line-height:1.3}' +
      '.mazer-score-name{flex:1;min-width:0;overflow-wrap:anywhere}' +
      '.mazer-score-value{flex:none;color:#fde047}' +
      '@media(max-width:240px){' +
        '.mazer-hand{padding:10px}' +
      '}' +
      '@keyframes mazer-hand-fire{0%{filter:brightness(1)}35%{filter:brightness(1.7)}100%{filter:brightness(1)}}'
    document.head.appendChild(style)
  }
}())
