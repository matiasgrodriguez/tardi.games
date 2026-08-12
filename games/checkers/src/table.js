import { startMatch, sendToAllHands, endMatch } from '@juxhouse/tardi-core/table'
import {
  PLAYERS,
  initialBoard,
  applyMove,
  findMove,
  hasCaptureFrom,
  legalMoves,
  winnerSeat,
} from './shared/checkers-rules.js'
import { mountBoard } from './shared/board.js'

// The table owns all game state. Hands send candidate moves; the table decides
// what is legal and broadcasts the resulting board.
var board = initialBoard()
var players = []
var turn = 0
var forcedFrom = null
var over = false
var victor = null

var update = mountBoard(document.body, function () {})

startMatch({ onMessage: onMove, onPlayersChange: onPlayers })

function onPlayers(info) {
  players = info.players
  render()
  broadcast()
}

function onMove(message) {
  var seat = seatOf(message.playerId)
  var action = message.messageFromHand

  if (over || players.length < 2) return
  if (seat !== turn) return                                   // not this player's turn
  if (!action || typeof action.from !== 'number' || typeof action.to !== 'number') return

  var move = findMove(board, seat, action.from, action.to, forcedFrom)
  if (!move) return

  board = applyMove(board, move, seat)

  if (move.capture !== null && move.capture !== undefined && hasCaptureFrom(board, seat, move.to)) {
    forcedFrom = move.to
    render()
    broadcast()
    return
  }

  forcedFrom = null
  turn = 1 - turn
  victor = winnerSeat(board, turn, forcedFrom)
  if (victor !== -1) {
    over = true
    finish(players[victor].playerId)
  } else {
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
  sendToAllHands({
    board: board,
    turn: turn,
    forcedFrom: forcedFrom,
    over: over,
    victor: victor,
  })
}

function render() {
  update(board, statusText(), { interactive: false, selected: forcedFrom })
}

function statusText() {
  if (victor !== null && victor !== -1) {
    return (players[victor].nick || PLAYERS[victor].label) + ' wins'
  }
  if (players.length < 2) return 'Waiting for players...'
  if (forcedFrom !== null) {
    return (players[turn].nick || PLAYERS[turn].label) + ' must keep jumping'
  }
  if (legalMoves(board, turn, null).length) {
    return (players[turn].nick || PLAYERS[turn].label) + ' to move (' + PLAYERS[turn].label + ')'
  }
  return 'No legal moves'
}

function seatOf(playerId) {
  for (var i = 0; i < players.length; i++) {
    if (players[i].playerId === playerId) return i
  }
  return -1
}
