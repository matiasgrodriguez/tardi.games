// A responsive 3x3 board, shared by the (view-only) table and the (interactive)
// hand. Only flexbox + vmin so it renders on old TV browsers (Chromium 38-56):
// no CSS grid, aspect-ratio, or flex gap. Returns an update() function.

var STYLE_ID = 'ttt-style'
var CSS = [
  ':root{font-size:calc(6px + 1.2vmin)}',
  '.ttt-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;',
  'height:100%;box-sizing:border-box;padding:3vmin;font-family:Arial,sans-serif}',
  '.ttt-status{font-size:1.6rem;text-align:center;margin-bottom:2vmin;min-height:6vmin}',
  '.ttt-grid{display:flex;flex-direction:column;width:80vmin;height:80vmin}',
  '.ttt-row{display:flex;flex:1}',
  '.ttt-cell{flex:1;margin:1vmin;border:none;border-radius:2vmin;background:#1e293b;',
  'color:#f8fafc;font-family:inherit;font-size:4.5rem;line-height:1;display:flex;',
  'align-items:center;justify-content:center;cursor:pointer}',
  '.ttt-cell:disabled{cursor:default;opacity:0.9}',
  '@media (min-aspect-ratio:1/1){.ttt-status{font-size:2.7rem}.ttt-cell{font-size:7.5rem}}',
].join('')

// Mounts the board into `root`. `onCellTap(index)` fires when a cell is tapped.
// Returns update(board, statusText, interactive): board is 9 strings ('', 'X',
// 'O'); cells are tappable only when interactive and empty.
export function mountBoard(root, onCellTap) {
  injectStyle()

  var wrap = document.createElement('div')
  wrap.className = 'ttt-wrap'

  var status = document.createElement('div')
  status.className = 'ttt-status'
  wrap.appendChild(status)

  var grid = document.createElement('div')
  grid.className = 'ttt-grid'

  var cells = []
  for (var r = 0; r < 3; r++) {
    var row = document.createElement('div')
    row.className = 'ttt-row'
    for (var c = 0; c < 3; c++) {
      var cell = makeCell(r * 3 + c, onCellTap)
      cells.push(cell)
      row.appendChild(cell)
    }
    grid.appendChild(row)
  }
  wrap.appendChild(grid)
  root.appendChild(wrap)

  return function update(board, statusText, interactive) {
    status.textContent = statusText
    for (var i = 0; i < 9; i++) {
      cells[i].textContent = board[i]
      cells[i].disabled = !interactive || board[i] !== ''
    }
  }
}

function makeCell(index, onCellTap) {
  var cell = document.createElement('button')
  cell.className = 'ttt-cell'
  cell.addEventListener('click', function () { onCellTap(index) })
  return cell
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return
  var style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}
