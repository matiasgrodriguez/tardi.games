// Tic-tac-toe rules, shared by the table and the hand.

export var MARKS = ['X', 'O']

var LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]

// The winning mark ('X' or 'O'), or '' if there is no winner yet.
export function winner(board) {
  for (var i = 0; i < LINES.length; i++) {
    var a = LINES[i][0], b = LINES[i][1], c = LINES[i][2]
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a]
    }
  }
  return ''
}

export function isDraw(board) {
  return board.indexOf('') === -1
}
