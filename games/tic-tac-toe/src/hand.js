import { joinMatch, sendToTable } from '@juxhouse/tardi-core/hand'
import { MARKS, winner, isDraw } from './shared/tic-tac-toe-rules.js'
import { mountBoard } from './shared/board.js'

// The hand is this player's controller. It renders the board and sends the
// tapped cell to the table, which decides what is legal.
var state = null
var seat = -1

var update = mountBoard(document.body, onCellTap)

joinMatch({ onStateChange: onStateChange })

function onStateChange(envelope) {
  seat = seatOf(envelope.players, envelope.playerId)
  state = envelope.messageFromTable
  render()
}

function onCellTap(cell) {
  if (!state || state.over) return
  if (state.turn !== seat) return
  if (state.board[cell] !== '') return
  sendToTable(cell)
}

function render() {
  if (!state) {
    update(['', '', '', '', '', '', '', '', ''], 'Waiting for the table...', false)
    return
  }
  var myTurn = !state.over && state.turn === seat
  update(state.board, statusText(), myTurn)
}

function statusText() {
  var win = winner(state.board)
  if (win) return win === MARKS[seat] ? 'You win!' : 'You lose'
  if (isDraw(state.board)) return 'Draw'
  return state.turn === seat ? 'Your move (' + MARKS[seat] + ')' : 'Waiting for opponent...'
}

function seatOf(players, playerId) {
  for (var i = 0; i < players.length; i++) {
    if (players[i].playerId === playerId) return i
  }
  return -1
}
