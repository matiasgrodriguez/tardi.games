import { isDarkSquare, isKing } from './checkers-rules.js'

// A responsive 8x8 checkers board, shared by the table and hand. It sticks to
// flexbox and vmin so it renders on old TV browsers.
var STYLE_ID = 'checkers-style'
var CSS = [
  ':root{font-size:calc(6px + 1.2vmin)}',
  'body{margin:0;background:#18202a;color:#f8fafc}',
  '.chk-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;',
  'height:100%;box-sizing:border-box;padding:3vmin;font-family:Arial,sans-serif}',
  '.chk-status{font-size:1.55rem;text-align:center;margin-bottom:2vmin;min-height:6vmin}',
  '.chk-board{display:flex;flex-direction:column;width:86vmin;height:86vmin;',
  'border:1.3vmin solid #273447;background:#273447;box-sizing:border-box}',
  '.chk-row{display:flex;flex:1}',
  '.chk-cell{position:relative;flex:1;border:0;margin:0;padding:0;font-family:inherit;',
  'display:flex;align-items:center;justify-content:center;box-sizing:border-box}',
  '.chk-light{background:#d8c7a3}',
  '.chk-dark{background:#6f3f2b;cursor:pointer}',
  '.chk-cell:disabled{cursor:default}',
  '.chk-cell.chk-selected{box-shadow:inset 0 0 0 0.8vmin #facc15}',
  '.chk-cell.chk-target:after{content:"";width:34%;height:34%;border-radius:50%;background:#facc15;opacity:0.85}',
  '.chk-piece{width:72%;height:72%;border-radius:50%;box-sizing:border-box;display:flex;',
  'align-items:center;justify-content:center;font-weight:bold;font-size:1.45rem;',
  'box-shadow:inset 0 -0.6vmin 0 rgba(0,0,0,0.22),0 0.35vmin 0.6vmin rgba(0,0,0,0.25)}',
  '.chk-red{background:#d94444;color:#fff4f4;border:0.45vmin solid #8f1f1f}',
  '.chk-black{background:#20242b;color:#f8fafc;border:0.45vmin solid #05070a}',
  '.chk-cell.chk-target .chk-piece{display:none}',
  '@media (min-aspect-ratio:1/1){.chk-status{font-size:2.45rem}.chk-piece{font-size:2.25rem}}',
].join('')

export function mountBoard(root, onCellTap) {
  injectStyle()

  var wrap = document.createElement('div')
  wrap.className = 'chk-wrap'

  var status = document.createElement('div')
  status.className = 'chk-status'
  wrap.appendChild(status)

  var boardEl = document.createElement('div')
  boardEl.className = 'chk-board'

  var cells = []
  for (var r = 0; r < 8; r++) {
    var row = document.createElement('div')
    row.className = 'chk-row'
    for (var c = 0; c < 8; c++) {
      var index = r * 8 + c
      var cell = makeCell(index, r, c, onCellTap)
      cells.push(cell)
      row.appendChild(cell)
    }
    boardEl.appendChild(row)
  }
  wrap.appendChild(boardEl)
  root.appendChild(wrap)

  return function update(board, statusText, options) {
    options = options || {}
    status.textContent = statusText
    for (var i = 0; i < 64; i++) {
      cells[i].className = baseClass(i)
      if (options.selected === i) cells[i].className += ' chk-selected'
      if (contains(options.targets, i)) cells[i].className += ' chk-target'
      cells[i].innerHTML = ''
      if (board[i]) cells[i].appendChild(makePiece(board[i]))
      cells[i].disabled = !options.interactive
    }
  }
}

function makeCell(index, row, col, onCellTap) {
  var cell = document.createElement('button')
  cell.className = 'chk-cell ' + (isDarkSquare(row, col) ? 'chk-dark' : 'chk-light')
  cell.addEventListener('click', function () { onCellTap(index) })
  return cell
}

function makePiece(piece) {
  var el = document.createElement('div')
  el.className = 'chk-piece ' + (piece === 'r' || piece === 'R' ? 'chk-red' : 'chk-black')
  el.textContent = isKing(piece) ? 'K' : ''
  return el
}

function baseClass(index) {
  var row = Math.floor(index / 8)
  var col = index % 8
  return 'chk-cell ' + (isDarkSquare(row, col) ? 'chk-dark' : 'chk-light')
}

function contains(items, value) {
  if (!items) return false
  for (var i = 0; i < items.length; i++) {
    if (items[i] === value) return true
  }
  return false
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return
  var style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}
