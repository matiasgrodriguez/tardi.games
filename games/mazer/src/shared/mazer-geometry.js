// Shared mazer geometry and board helpers: pure functions and the board
// constants they need, used by both the table and the hand. These were
// byte-identical in both files before extraction.

var BOARD_SIZE = 9
var LASER_CELLS_PER_VELOCITY_TICK = 10
var LASER_VELOCITY_TICK_MS = 100

  function cannonGlyph(side) {
    if (side === 'left') return '>'
    if (side === 'right') return '<'
    if (side === 'top') return 'v'
    return '^'
  }

  function clearNode(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild)
    }
  }

  function createNode(tagName, className) {
    var node = document.createElement(tagName)
    node.className = className
    return node
  }

  function createVariedTileBackground(baseColor, tileSize, seed, variationRange) {
    var tilesPerSide = 10
    var size = tileSize * tilesPerSide
    var lineColor = {
      r: clampBackgroundColor(baseColor.r + 10),
      g: clampBackgroundColor(baseColor.g + 10),
      b: clampBackgroundColor(baseColor.b + 10),
    }
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges">'
    var x
    var y
    var offset

    for (y = 0; y < tilesPerSide; y += 1) {
      for (x = 0; x < tilesPerSide; x += 1) {
        offset = stableBackgroundVariation(seed, x, y, variationRange)
        svg += '<rect x="' + (x * tileSize) + '" y="' + (y * tileSize) + '" width="' + tileSize + '" height="' + tileSize + '" ' +
          'fill="rgb(' +
          clampBackgroundColor(baseColor.r + offset) + ',' +
          clampBackgroundColor(baseColor.g + offset) + ',' +
          clampBackgroundColor(baseColor.b + offset) + ')" ' +
          'stroke="rgb(' + lineColor.r + ',' + lineColor.g + ',' + lineColor.b + ')" stroke-width="1"/>'
      }
    }

    svg += '</svg>'
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")'
  }

  function stableBackgroundVariation(seed, x, y, variationRange) {
    var range = Math.max(0, Math.floor(Number(variationRange) || 0))
    var value

    if (range === 0) {
      return 0
    }

    value = ((seed + 11) * 73856093) ^
      ((x + 17) * 83492791) ^
      ((y + 19) * 2654435761)
    value = value & 0x7fffffff
    value = value % ((range * 2) + 1)
    return value - range
  }

  function clampBackgroundColor(value) {
    if (value < 0) return 0
    if (value > 255) return 255
    return value
  }

  function findGuessForTarget(guessesById, target) {
    var playerId
    var guess

    for (playerId in guessesById) {
      guess = guessesById[playerId]

      if (guess && targetsEqual(guess.target, target)) {
        return guess
      }
    }

    return null
  }

  function findMirror(mirrors, x, y) {
    var index
    var mirror

    for (index = 0; index < mirrors.length; index += 1) {
      mirror = mirrors[index]

      if (mirror.x === x && mirror.y === y) {
        return mirror
      }
    }

    return null
  }

  function formatTarget(target) {
    if (!target) {
      return ''
    }

    if (target.side === 'loop') {
      return 'loop'
    }

    return target.side + ' ' + String(target.coordinate + 1)
  }

  function getEdgeTarget(x, y) {
    if (x < 0 && y >= 0 && y < BOARD_SIZE) {
      return { side: 'left', coordinate: y }
    }

    if (x >= BOARD_SIZE && y >= 0 && y < BOARD_SIZE) {
      return { side: 'right', coordinate: y }
    }

    if (y < 0 && x >= 0 && x < BOARD_SIZE) {
      return { side: 'top', coordinate: x }
    }

    if (y >= BOARD_SIZE && x >= 0 && x < BOARD_SIZE) {
      return { side: 'bottom', coordinate: x }
    }

    return null
  }

  function getVisibleLaserCellCount(path, elapsed) {
    var visibleCount

    if (!path || path.length < 1) {
      return 0
    }

    visibleCount = Math.floor((elapsed * LASER_CELLS_PER_VELOCITY_TICK) / LASER_VELOCITY_TICK_MS) + 1

    if (visibleCount < 1) {
      return 1
    }

    if (visibleCount > path.length) {
      return path.length
    }

    return visibleCount
  }

  function isLaserPathCell(path, x, y) {
    var index
    var step

    for (index = 0; index < path.length; index += 1) {
      step = path[index]

      if (step.x === x && step.y === y) {
        return true
      }
    }

    return false
  }

  function isValidTarget(target) {
    return !!target &&
      (target.side === 'left' || target.side === 'right' || target.side === 'top' || target.side === 'bottom') &&
      Number(target.coordinate) >= 0 &&
      Number(target.coordinate) < BOARD_SIZE
  }

  function targetsEqual(left, right) {
    return !!left && !!right &&
      left.side === right.side &&
      Number(left.coordinate) === Number(right.coordinate)
  }

export {
  BOARD_SIZE,
  cannonGlyph,
  clearNode,
  createNode,
  createVariedTileBackground,
  findGuessForTarget,
  findMirror,
  formatTarget,
  getEdgeTarget,
  getVisibleLaserCellCount,
  isLaserPathCell,
  isValidTarget,
  targetsEqual,
}
