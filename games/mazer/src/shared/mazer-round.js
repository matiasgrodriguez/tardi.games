import { BOARD_SIZE } from './mazer-geometry.js'

var MAX_GENERATION_ATTEMPTS = 800
var CANNON_MIRROR_AXIS_ODDS = 0.7

var DIFFICULTIES = {
  easy: { mirrorCount: 7, minPath: 7, maxPath: 20, minHits: 1, maxHits: 4 },
  medium: { mirrorCount: 12, minPath: 12, maxPath: 32, minHits: 2, maxHits: 7 },
  hard: { mirrorCount: 18, minPath: 18, maxPath: 60, minHits: 3, maxHits: 12 },
}

export function getDifficultyForRound(roundNumber, isSuddenDeath) {
  if (isSuddenDeath || roundNumber >= 6) {
    return 'hard'
  }

  if (roundNumber >= 3) {
    return 'medium'
  }

  return 'easy'
}

export function createMazerRound(roundNumber, isSuddenDeath, random) {
  var difficulty = getDifficultyForRound(roundNumber, isSuddenDeath)
  var rules = DIFFICULTIES[difficulty]
  var randomNumber = random || Math.random
  var best = null
  var bestPenalty = Infinity
  var attempt
  var candidate
  var penalty

  for (attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    candidate = createCandidate(rules.mirrorCount, randomNumber)

    if (candidate.correctTarget.side === 'loop') {
      continue
    }

    penalty = getDifficultyPenalty(candidate, rules)

    if (penalty < bestPenalty) {
      best = candidate
      bestPenalty = penalty
    }

    if (penalty === 0) {
      break
    }
  }

  // A straight beam always gives us a valid fallback even if an unusually
  // hostile random source produced only loops during candidate generation.
  if (!best) {
    best = createCandidate(0, randomNumber)
  }

  best.number = roundNumber
  best.difficulty = difficulty
  best.generationAttempts = attempt + 1
  return best
}

function createCandidate(mirrorCount, random) {
  var mirrors = createMirrors(mirrorCount, random)
  var cannon = createCannon(mirrors, random)
  var traced = traceLaser(mirrors, cannon)

  return {
    mirrorCount: mirrorCount,
    mirrors: mirrors,
    cannon: cannon,
    laserPath: traced.path,
    correctTarget: traced.target,
    pathLength: traced.path.length,
    mirrorHits: countMirrorHits(traced.path),
    repeatedCells: countRepeatedCells(traced.path),
  }
}

function getDifficultyPenalty(candidate, rules) {
  var penalty = 0

  if (candidate.pathLength < rules.minPath) {
    penalty += (rules.minPath - candidate.pathLength) * 4
  }

  if (candidate.pathLength > rules.maxPath) {
    penalty += candidate.pathLength - rules.maxPath
  }

  if (candidate.mirrorHits < rules.minHits) {
    penalty += (rules.minHits - candidate.mirrorHits) * 12
  }

  if (candidate.mirrorHits > rules.maxHits) {
    penalty += (candidate.mirrorHits - rules.maxHits) * 3
  }

  if (isTrivialReturn(candidate.cannon, candidate.correctTarget)) {
    penalty += 100
  }

  return penalty
}

function isTrivialReturn(cannon, target) {
  return cannon.side === target.side &&
    Math.abs(Number(cannon.coordinate) - Number(target.coordinate)) <= 2
}

function createMirrors(count, random) {
  var mirrors = []
  var used = {}
  var max = BOARD_SIZE * BOARD_SIZE
  var safeCount = count > max ? max : count
  var x
  var y
  var key

  while (mirrors.length < safeCount) {
    x = randomInt(BOARD_SIZE, random)
    y = randomInt(BOARD_SIZE, random)
    key = x + ':' + y

    if (used[key]) {
      continue
    }

    used[key] = true
    mirrors.push({
      x: x,
      y: y,
      type: random() < 0.5 ? 'slash' : 'backslash',
    })
  }

  return mirrors
}

function createCannon(mirrors, random) {
  var side = ['left', 'top', 'right', 'bottom'][randomInt(4, random)]
  var coordinate = createCannonCoordinate(side, mirrors, random)

  if (side === 'left') {
    return { side: side, coordinate: coordinate, x: 0, y: coordinate, direction: 'right' }
  }

  if (side === 'right') {
    return { side: side, coordinate: coordinate, x: BOARD_SIZE - 1, y: coordinate, direction: 'left' }
  }

  if (side === 'top') {
    return { side: side, coordinate: coordinate, x: coordinate, y: 0, direction: 'down' }
  }

  return { side: side, coordinate: coordinate, x: coordinate, y: BOARD_SIZE - 1, direction: 'up' }
}

function createCannonCoordinate(side, mirrors, random) {
  var options

  if (random() >= CANNON_MIRROR_AXIS_ODDS) {
    return randomInt(BOARD_SIZE, random)
  }

  options = side === 'left' || side === 'right'
    ? getMirrorRows(mirrors)
    : getMirrorColumns(mirrors)

  if (options.length < 1) {
    return randomInt(BOARD_SIZE, random)
  }

  return options[randomInt(options.length, random)]
}

function getMirrorRows(mirrors) {
  var rows = []
  var seen = {}
  var index
  var y

  for (index = 0; index < mirrors.length; index += 1) {
    y = mirrors[index].y

    if (!seen[y]) {
      seen[y] = true
      rows.push(y)
    }
  }

  return rows
}

function getMirrorColumns(mirrors) {
  var columns = []
  var seen = {}
  var index
  var x

  for (index = 0; index < mirrors.length; index += 1) {
    x = mirrors[index].x

    if (!seen[x]) {
      seen[x] = true
      columns.push(x)
    }
  }

  return columns
}

export function traceLaser(mirrors, cannon) {
  var mirrorByCell = createMirrorMap(mirrors)
  var path = []
  var seen = {}
  var x = cannon.x
  var y = cannon.y
  var direction = cannon.direction
  var key
  var mirror
  var guard

  for (guard = 0; guard < 240; guard += 1) {
    if (!isInsideBoard(x, y)) {
      return { path: path, target: createTargetFromExit(x, y) }
    }

    key = x + ':' + y + ':' + direction

    if (seen[key]) {
      return { path: path, target: { side: 'loop', coordinate: -1 } }
    }

    seen[key] = true
    mirror = mirrorByCell[x + ':' + y] || null
    path.push({ x: x, y: y, direction: direction, mirror: mirror ? mirror.type : null })

    if (mirror) {
      direction = reflect(direction, mirror.type)
    }

    if (direction === 'right') {
      x += 1
    } else if (direction === 'left') {
      x -= 1
    } else if (direction === 'down') {
      y += 1
    } else {
      y -= 1
    }
  }

  return { path: path, target: { side: 'loop', coordinate: -1 } }
}

function createTargetFromExit(x, y) {
  if (x < 0) return { side: 'left', coordinate: y }
  if (x >= BOARD_SIZE) return { side: 'right', coordinate: y }
  if (y < 0) return { side: 'top', coordinate: x }
  return { side: 'bottom', coordinate: x }
}

function reflect(direction, mirrorType) {
  if (mirrorType === 'slash') {
    if (direction === 'up') return 'right'
    if (direction === 'right') return 'up'
    if (direction === 'down') return 'left'
    return 'down'
  }

  if (direction === 'up') return 'left'
  if (direction === 'left') return 'up'
  if (direction === 'down') return 'right'
  return 'down'
}

function createMirrorMap(mirrors) {
  var output = {}
  var index
  var mirror

  for (index = 0; index < mirrors.length; index += 1) {
    mirror = mirrors[index]
    output[mirror.x + ':' + mirror.y] = mirror
  }

  return output
}

function countMirrorHits(path) {
  var count = 0
  var index

  for (index = 0; index < path.length; index += 1) {
    if (path[index].mirror) {
      count += 1
    }
  }

  return count
}

function countRepeatedCells(path) {
  var seen = {}
  var repeats = 0
  var index
  var key

  for (index = 0; index < path.length; index += 1) {
    key = path[index].x + ':' + path[index].y

    if (seen[key]) {
      repeats += 1
    }

    seen[key] = true
  }

  return repeats
}

function isInsideBoard(x, y) {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE
}

function randomInt(max, random) {
  return Math.floor(random() * max)
}
