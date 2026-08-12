import { startMatch, sendToAllHands, endMatch } from '@juxhouse/tardi-core/table'
import { MARKS, winner, isDraw } from './shared/tic-tac-toe-rules.js'
import { mountBoard } from './shared/board.js'

// The table owns the game state. It is a view-only display: taps are ignored.
var board = ['', '', '', '', '', '', '', '', '']
var players = []
var turn = 0
var over = false

var update = mountBoard(document.body, function () {})

startMatch({ onMessage: onMove, onPlayersChange: onPlayers })

function onPlayers(info) {
  players = info.players
  render()
  broadcast()
}

function onMove(message) {
  var seat = seatOf(message.playerId)
  var cell = message.messageFromHand

  if (over || players.length < 2) return
  if (seat !== turn) return                                   // not this player's turn
  if (typeof cell !== 'number' || board[cell] !== '') return  // taken or invalid

  board[cell] = MARKS[seat]

  if (winner(board)) {
    over = true
    finish(players[seat].playerId)
  } else if (isDraw(board)) {
    over = true
    finish(null)
  } else {
    turn = 1 - turn
    render()
    broadcast()
  }
}

function finish(victor) {
  render()
  broadcast()
  endMatch({ victor: victor })
}

function broadcast() {
  sendToAllHands({ board: board, turn: turn, over: over })
}

function render() {
  update(board, statusText(), false)
}

function statusText() {
  if (winner(board)) return winner(board) + ' wins'
  if (isDraw(board)) return 'Draw'
  if (players.length < 2) return 'Waiting for players...'
  return (players[turn].nick || MARKS[turn]) + ' to move (' + MARKS[turn] + ')'
}

function seatOf(playerId) {
  for (var i = 0; i < players.length; i++) {
    if (players[i].playerId === playerId) return i
  }
  return -1
}
