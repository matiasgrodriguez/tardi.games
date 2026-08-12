import { joinMatch, sendToTable } from '@juxhouse/tardi-core/hand'
import { PLAYERS, isSeatPiece, legalMoves } from './shared/checkers-rules.js'
import { mountBoard } from './shared/board.js'

// The hand is this player's controller. It highlights legal destinations, but
// the table is still authoritative for every move.
var state = null
var seat = -1
var selected = null
var targets = []

var update = mountBoard(document.body, onCellTap)

joinMatch({ onStateChange: onStateChange })

function onStateChange(envelope) {
  seat = seatOf(envelope.players, envelope.playerId)
  state = envelope.messageFromTable
  syncSelection()
  render()
}

function onCellTap(index) {
  if (!state || state.over) return
  if (state.turn !== seat) return
  if (state.forcedFrom !== null && state.forcedFrom !== undefined) {
    selected = state.forcedFrom
    targets = destinationsFor(selected)
    if (contains(targets, index)) sendToTable({ from: selected, to: index })
    render()
    return
  }

  if (selected !== null && contains(targets, index)) {
    sendToTable({ from: selected, to: index })
    return
  }

  if (isSeatPiece(state.board[index], seat) && destinationsFor(index).length) {
    selected = index
    targets = destinationsFor(index)
  } else {
    selected = null
    targets = []
  }
  render()
}

function render() {
  if (!state) {
    update(emptyBoard(), 'Waiting for the table...', { interactive: false })
    return
  }
  var myTurn = !state.over && state.turn === seat
  update(state.board, statusText(), {
    interactive: myTurn,
    selected: selected,
    targets: targets,
  })
}

function statusText() {
  if (state.over) return state.victor === seat ? 'You win!' : 'You lose'
  if (state.turn !== seat) return 'Waiting for opponent...'
  if (state.forcedFrom !== null && state.forcedFrom !== undefined) return 'Keep jumping'
  return 'Your move (' + PLAYERS[seat].label + ')'
}

function syncSelection() {
  if (!state || state.over || state.turn !== seat) {
    selected = null
    targets = []
    return
  }

  if (state.forcedFrom !== null && state.forcedFrom !== undefined) {
    selected = state.forcedFrom
    targets = destinationsFor(selected)
  } else if (selected !== null && isSeatPiece(state.board[selected], seat)) {
    targets = destinationsFor(selected)
    if (!targets.length) selected = null
  } else {
    selected = null
    targets = []
  }
}

function destinationsFor(from) {
  var moves = legalMoves(state.board, seat, state.forcedFrom)
  var result = []
  for (var i = 0; i < moves.length; i++) {
    if (moves[i].from === from) result.push(moves[i].to)
  }
  return result
}

function contains(items, value) {
  for (var i = 0; i < items.length; i++) {
    if (items[i] === value) return true
  }
  return false
}

function emptyBoard() {
  var board = []
  for (var i = 0; i < 64; i++) board.push('')
  return board
}

function seatOf(players, playerId) {
  for (var i = 0; i < players.length; i++) {
    if (players[i].playerId === playerId) return i
  }
  return -1
}
