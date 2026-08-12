export var PLAYERS = [
  { piece: 'r', king: 'R', label: 'Red' },
  { piece: 'b', king: 'B', label: 'Black' },
]

export function initialBoard() {
  var board = []
  for (var i = 0; i < 64; i++) board.push('')

  for (var r = 0; r < 3; r++) {
    for (var c = 0; c < 8; c++) {
      if (isDarkSquare(r, c)) board[indexOf(r, c)] = 'r'
    }
  }

  for (var br = 5; br < 8; br++) {
    for (var bc = 0; bc < 8; bc++) {
      if (isDarkSquare(br, bc)) board[indexOf(br, bc)] = 'b'
    }
  }

  return board
}

export function legalMoves(board, seat, forcedFrom) {
  var captures = []
  var quietMoves = []

  for (var i = 0; i < board.length; i++) {
    if (forcedFrom !== null && forcedFrom !== undefined && i !== forcedFrom) continue
    if (!isSeatPiece(board[i], seat)) continue

    var pieceMoves = movesForPiece(board, i, seat)
    for (var m = 0; m < pieceMoves.length; m++) {
      if (pieceMoves[m].capture !== null && pieceMoves[m].capture !== undefined) {
        captures.push(pieceMoves[m])
      } else {
        quietMoves.push(pieceMoves[m])
      }
    }
  }

  return captures.length ? captures : quietMoves
}

export function movesForPiece(board, from, seat) {
  var piece = board[from]
  if (!isSeatPiece(piece, seat)) return []

  var moves = []
  var fromRow = rowOf(from)
  var fromCol = colOf(from)
  var dirs = directionsFor(piece, seat)

  for (var i = 0; i < dirs.length; i++) {
    var dr = dirs[i][0]
    var dc = dirs[i][1]
    var r1 = fromRow + dr
    var c1 = fromCol + dc
    var r2 = fromRow + dr * 2
    var c2 = fromCol + dc * 2

    if (!onBoard(r1, c1)) continue

    var mid = indexOf(r1, c1)
    if (board[mid] === '') {
      moves.push({ from: from, to: mid, capture: null })
    } else if (isOpponentPiece(board[mid], seat) && onBoard(r2, c2)) {
      var landing = indexOf(r2, c2)
      if (board[landing] === '') {
        moves.push({ from: from, to: landing, capture: mid })
      }
    }
  }

  return moves
}

export function hasCaptureFrom(board, seat, from) {
  var moves = movesForPiece(board, from, seat)
  for (var i = 0; i < moves.length; i++) {
    if (moves[i].capture !== null && moves[i].capture !== undefined) return true
  }
  return false
}

export function applyMove(board, move, seat) {
  var next = board.slice()
  var piece = next[move.from]
  next[move.from] = ''
  if (move.capture !== null && move.capture !== undefined) next[move.capture] = ''

  var toRow = rowOf(move.to)
  if (piece === 'r' && toRow === 7) piece = 'R'
  if (piece === 'b' && toRow === 0) piece = 'B'

  next[move.to] = piece
  return next
}

export function findMove(board, seat, from, to, forcedFrom) {
  var moves = legalMoves(board, seat, forcedFrom)
  for (var i = 0; i < moves.length; i++) {
    if (moves[i].from === from && moves[i].to === to) return moves[i]
  }
  return null
}

export function hasPieces(board, seat) {
  for (var i = 0; i < board.length; i++) {
    if (isSeatPiece(board[i], seat)) return true
  }
  return false
}

export function winnerSeat(board, turn, forcedFrom) {
  if (!hasPieces(board, 0)) return 1
  if (!hasPieces(board, 1)) return 0
  if (legalMoves(board, turn, forcedFrom).length === 0) return 1 - turn
  return -1
}

export function isSeatPiece(piece, seat) {
  return seat === 0 ? piece === 'r' || piece === 'R' : piece === 'b' || piece === 'B'
}

export function isOpponentPiece(piece, seat) {
  return piece !== '' && !isSeatPiece(piece, seat)
}

export function isKing(piece) {
  return piece === 'R' || piece === 'B'
}

export function rowOf(index) {
  return Math.floor(index / 8)
}

export function colOf(index) {
  return index % 8
}

export function indexOf(row, col) {
  return row * 8 + col
}

export function isDarkSquare(row, col) {
  return (row + col) % 2 === 1
}

function directionsFor(piece, seat) {
  if (isKing(piece)) return [[1, -1], [1, 1], [-1, -1], [-1, 1]]
  return seat === 0 ? [[1, -1], [1, 1]] : [[-1, -1], [-1, 1]]
}

function onBoard(row, col) {
  return row >= 0 && row < 8 && col >= 0 && col < 8
}
