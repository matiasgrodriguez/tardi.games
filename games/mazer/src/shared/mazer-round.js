import { BOARD_SIZE } from './mazer-geometry.js'

var MAX_GENERATION_ATTEMPTS = 800

var DIFFICULTIES = {
  easy: { minPath: 7, maxPath: 20, minHits: 1, maxHits: 4 },
  medium: { minPath: 12, maxPath: 32, minHits: 2, maxHits: 7 },
  hard: { minPath: 18, maxPath: 60, minHits: 3, maxHits: 12 },
}

export function getDifficultyForRound(roundNumber) {
  if (roundNumber >= 6) return 'hard'
  if (roundNumber >= 3) return 'medium'
  return 'easy'
}

// Plan all shots together so the mirrors stay fixed and no route is reused
// from either endpoint. The existing path-length and bounce bands still apply.
export function createMazerMatch(random) {
  var randomNumber = random || Math.random
  var best = null
  var bestPenalty = Infinity
  var attempt
  var mirrors
  var routes
  var rounds
  var used
  var total
  var number
  var slot
  var selectedCount
  var selectionOrder = [6, 7, 8, 3, 4, 5, 1, 2]
  var rules
  var index
  var candidate
  var chosen
  var penalty
  var chosenPenalty

  for (attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    // Vary density to find enough distinct routes for all three bands.
    mirrors = createMirrors(18 + randomInt(10, randomNumber), randomNumber)
    routes = createRoutes(mirrors)
    rounds = assignDifficultyBands(routes)
    if (rounds) return { mirrors: mirrors, rounds: rounds }
    rounds = []
    used = {}
    total = 0
    selectedCount = 0
    // Reserve the scarce long routes before assigning the easier shots.
    for (slot = 0; slot < selectionOrder.length; slot += 1) {
      number = selectionOrder[slot]
      rules = DIFFICULTIES[getDifficultyForRound(number)]
      chosen = null
      chosenPenalty = Infinity
      for (index = 0; index < routes.length; index += 1) {
        candidate = routes[index]
        if (used[targetKey(candidate.cannon)] || used[targetKey(candidate.correctTarget)]) continue
        // Short same-edge returns are never useful prediction puzzles.
        if (isTrivialReturn(candidate.cannon, candidate.correctTarget)) continue
        penalty = getDifficultyPenalty(candidate, rules)
        if (penalty < chosenPenalty) {
          chosen = candidate
          chosenPenalty = penalty
        }
      }
      if (!chosen) break
      used[targetKey(chosen.cannon)] = true
      used[targetKey(chosen.correctTarget)] = true
      chosen.number = number
      chosen.difficulty = getDifficultyForRound(number)
      rounds[number - 1] = chosen
      selectedCount += 1
      total += chosenPenalty
    }
    if (selectedCount === 8 && total < bestPenalty) {
      best = { mirrors: mirrors, rounds: rounds }
      bestPenalty = total
    }
    if (bestPenalty === 0) break
  }
  // Empty geometry always has enough distinct, non-returning routes.
  if (!best) {
    mirrors = []
    routes = createRoutes(mirrors)
    rounds = routes.slice(0, 8)
    for (number = 1; number <= 8; number += 1) {
      rounds[number - 1].number = number
      rounds[number - 1].difficulty = getDifficultyForRound(number)
    }
    best = { mirrors: mirrors, rounds: rounds }
  }
  return best
}

// A route can fit several bands. Reassign earlier choices when necessary
// rather than consuming an easy route that a later slot needs.
function assignDifficultyBands(routes) {
  var unique = []
  var seen = {}
  var owners = []
  var selected = []
  var index
  var route
  var key
  var number
  for (index = 0; index < routes.length; index += 1) {
    route = routes[index]
    if (isTrivialReturn(route.cannon, route.correctTarget)) continue
    key = [targetKey(route.cannon), targetKey(route.correctTarget)].sort().join('|')
    if (seen[key]) continue
    seen[key] = true
    unique.push(route)
  }
  function assign(slot, visited) {
    var routeIndex
    var previous
    var rules = DIFFICULTIES[getDifficultyForRound(slot + 1)]
    for (routeIndex = 0; routeIndex < unique.length; routeIndex += 1) {
      if (visited[routeIndex] || getDifficultyPenalty(unique[routeIndex], rules) !== 0) continue
      visited[routeIndex] = true
      previous = owners[routeIndex]
      if (typeof previous === 'number' && !assign(previous, visited)) continue
      owners[routeIndex] = slot
      selected[slot] = unique[routeIndex]
      return true
    }
    return false
  }
  for (number = 1; number <= 8; number += 1) {
    if (!assign(number - 1, {})) return null
  }
  for (number = 1; number <= 8; number += 1) {
    selected[number - 1].number = number
    selected[number - 1].difficulty = getDifficultyForRound(number)
  }
  return selected
}

export function getGuessPoints(elapsedMs, durationMs) {
  var remaining = Math.max(0, Math.min(durationMs, durationMs - elapsedMs))
  return 100 + Math.floor(100 * remaining / durationMs)
}

function targetKey(target) {
  return target.side + ':' + target.coordinate
}

function createRoutes(mirrors) {
  var routes = []
  var sides = ['left', 'top', 'right', 'bottom']
  var side
  var coordinate
  var cannon
  var traced
  for (side = 0; side < sides.length; side += 1) {
    for (coordinate = 0; coordinate < BOARD_SIZE; coordinate += 1) {
      cannon = createCannon(sides[side], coordinate)
      traced = traceLaser(mirrors, cannon)
      if (traced.target.side === 'loop') continue
      routes.push({
        mirrorCount: mirrors.length,
        mirrors: mirrors,
        cannon: cannon,
        laserPath: traced.path,
        correctTarget: traced.target,
        pathLength: traced.path.length,
        mirrorHits: countMirrorHits(traced.path),
        repeatedCells: countRepeatedCells(traced.path),
      })
    }
  }
  return routes
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

function createCannon(side, coordinate) {
  if (side === 'left') return { side: side, coordinate: coordinate, x: 0, y: coordinate, direction: 'right' }
  if (side === 'right') return { side: side, coordinate: coordinate, x: BOARD_SIZE - 1, y: coordinate, direction: 'left' }
  if (side === 'top') return { side: side, coordinate: coordinate, x: coordinate, y: 0, direction: 'down' }
  return { side: side, coordinate: coordinate, x: coordinate, y: BOARD_SIZE - 1, direction: 'up' }
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
