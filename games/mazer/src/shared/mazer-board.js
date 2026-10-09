import { BOARD_SIZE } from './mazer-geometry.js'

var GRID_SIZE = BOARD_SIZE + 2
var INNER_GRID_SIZE = 3
var BASE_GRAY = 50
var CELL_GAP = 0
var LASER_AMBER = { r: 255, g: 176, b: 0 }
var LASER_AMBER_RGB = 'rgb(255,176,0)'
var LASER_HISTORY = { r: 115, g: 80, b: 12 }
var SELECTED_TARGET_BLUE = { r: 20, g: 104, b: 130 }
var WRONG_TARGET_RED = { r: 220, g: 38, b: 38 }
var CANNON_SLIDE_CELLS_PER_100_MS = 8
var CANNON_SLIDE_CELL_MS = 100 / CANNON_SLIDE_CELLS_PER_100_MS

export function createMazerBoard(options) {
  installMazerBoardStyles()

  var root = createNode('div', 'mazer-board')
  var state = null
  var selectedTarget = null
  var displayedCannon = null
  var cannonSlideTarget = null
  var cannonSlidePath = []
  var cannonSlideIndex = -1
  var cannonSlideStartedAt = 0
  var cannonSlideFrameId = 0
  var cannonSlideUsesAnimationFrame = false
  var needsResize = true
  var lastParentWidth = 0
  var lastParentHeight = 0
  var lastCellSize = 0
  var edgeCellsByKey = {}
  var interiorCellsByKey = {}

  root.addEventListener('click', onClick)
  window.addEventListener('resize', onResize)
  buildStaticBoard()

  return {
    element: root,
    render: render,
    destroy: destroy,
  }

  function render(nextState, nextSelectedTarget) {
    state = nextState
    selectedTarget = nextSelectedTarget

    if (needsResize || lastCellSize < 1) {
      resize()
    }

    syncDisplayedCannon()
    updateAllCells()
  }

  function buildStaticBoard() {
    var y
    var x

    for (y = -1; y <= BOARD_SIZE; y += 1) {
      for (x = -1; x <= BOARD_SIZE; x += 1) {
        root.appendChild(createStaticCell(x, y))
      }
    }
  }

  function createStaticCell(x, y) {
    var target

    if ((x < 0 || x >= BOARD_SIZE) && (y < 0 || y >= BOARD_SIZE)) {
      return createNode('div', 'mazer-board-corner')
    }

    target = getEdgeTarget(x, y)

    if (target) {
      return createEdgeCellRecord(target).node
    }

    return createInteriorCellRecord(x, y).node
  }

  function createEdgeCellRecord(target) {
    var node = options.interactive ? document.createElement('button') : document.createElement('span')
    var record = {
      node: node,
      target: cloneTarget(target),
      innerCells: [],
      signature: '',
    }

    node.className = 'mazer-edge-target'
    appendStaticInnerCells(record)

    if (options.interactive) {
      node.type = 'button'
      node.setAttribute('data-side', target.side)
      node.setAttribute('data-coordinate', String(target.coordinate))
    }

    edgeCellsByKey[getTargetKey(target)] = record
    return record
  }

  function createInteriorCellRecord(x, y) {
    var node = createNode('div', 'mazer-cell')
    var record = {
      node: node,
      x: x,
      y: y,
      innerCells: [],
      signature: '',
    }

    appendStaticInnerCells(record)
    interiorCellsByKey[getCellKey(x, y)] = record
    return record
  }

  function appendStaticInnerCells(record) {
    var innerY
    var innerX
    var inner

    for (innerY = 0; innerY < INNER_GRID_SIZE; innerY += 1) {
      for (innerX = 0; innerX < INNER_GRID_SIZE; innerX += 1) {
        inner = createNode('span', 'mazer-inner-cell')
        record.innerCells.push(inner)
        record.node.appendChild(inner)
      }
    }
  }

  function updateAllCells() {
    var key

    for (key in edgeCellsByKey) {
      updateEdgeCell(edgeCellsByKey[key])
    }

    for (key in interiorCellsByKey) {
      updateInteriorCell(interiorCellsByKey[key])
    }
  }

  function updateEdgeCell(record) {
    var view = getEdgeRenderView(record.target)

    if (record.signature === view.signature) {
      return
    }

    record.signature = view.signature
    record.node.className = view.className
    updateInnerCells(
      record,
      record.target.coordinate,
      sideIndex(record.target.side),
      view.baseColor,
      view.variationRange,
      view.arrowSide,
      [],
      view.glowAll,
      view.glowSprite,
      view.selectedSprite,
      view.selectedSpriteSide,
      view.selectedSpriteColor
    )
  }

  function getEdgeRenderView(target) {
    var className = 'mazer-edge-target'
    var round = state ? state.round : null
    var cannon = displayedCannon
    var correct = round ? round.correctTarget : null
    var guess = round ? findGuessForTarget(round.guessesByPlayerId, target) : null
    var baseColor = { r: 31, g: 41, b: 55 }
    var variationRange = 2
    var arrowSide = ''
    var glowAll = false
    var glowSprite = false
    var selectedSprite = false
    var selectedSpriteSide = ''
    var selectedSpriteColor = null
    var signature
    var historical = isHistoricalEndpoint(target)

    if (cannon && targetsEqual(cannon, target)) {
      className += ' mazer-edge-cannon'
      arrowSide = cannon.side
      glowSprite = hasVisibleLaser(round)
    } else if (correct && targetsEqual(correct, target)) {
      className += ' mazer-edge-laser-exit'
      baseColor = LASER_AMBER
      variationRange = 16
      glowAll = hasVisibleLaser(round)
    } else if (selectedTarget && targetsEqual(selectedTarget, target)) {
      className += ' mazer-edge-selected'
      selectedSprite = true
      selectedSpriteSide = target.side
      selectedSpriteColor = SELECTED_TARGET_BLUE

      if (state && state.phase === 'scoring' && guess && guess.correct === false) {
        className += ' mazer-edge-selected-wrong'
        selectedSpriteColor = WRONG_TARGET_RED
      }
    } else if (state && state.phase === 'scoring' && guess && guess.correct === false) {
      className += ' mazer-edge-wrong'
      selectedSprite = true
      selectedSpriteSide = target.side
      selectedSpriteColor = WRONG_TARGET_RED
    }

    if (historical && !arrowSide && !selectedSprite && !(correct && targetsEqual(correct, target))) {
      baseColor = LASER_HISTORY
      variationRange = 2
    }

    signature = className + '|' +
      colorSignature(baseColor) + '|' +
      String(variationRange) + '|' +
      arrowSide + '|' +
      boolSignature(glowAll) + '|' +
      boolSignature(glowSprite) + '|' +
      boolSignature(selectedSprite) + '|' +
      selectedSpriteSide + '|' +
      colorSignature(selectedSpriteColor)

    return {
      className: className,
      baseColor: baseColor,
      variationRange: variationRange,
      arrowSide: arrowSide,
      glowAll: glowAll,
      glowSprite: glowSprite,
      selectedSprite: selectedSprite,
      selectedSpriteSide: selectedSpriteSide,
      selectedSpriteColor: selectedSpriteColor,
      signature: signature,
    }
  }

  function updateInteriorCell(record) {
    var mirrors = state && state.board ? state.board.mirrors : []
    var path = state && state.round ? state.round.laserPath : []
    var mirror = findMirror(mirrors, record.x, record.y)
    var pathSteps = findLaserPathSteps(path, record.x, record.y)
    var activeSteps = pathSteps.slice()
    var shots = state && state.board ? state.board.resolvedShots || [] : []
    var shotIndex
    for (shotIndex = 0; shotIndex < shots.length; shotIndex += 1) {
      pathSteps = pathSteps.concat(findLaserPathSteps(shots[shotIndex].laserPath, record.x, record.y))
    }
    var className = 'mazer-cell'
    var signature

    if (mirror) {
      className += ' mazer-cell-mirror mazer-cell-mirror-' + mirror.type
    }

    if (pathSteps.length > 0) {
      className += ' mazer-cell-laser'
    }

    signature = className + '|' + getPathStepsSignature(pathSteps) + '|active:' + getPathStepsSignature(activeSteps)

    if (record.signature === signature) {
      return
    }

    record.signature = signature
    record.node.className = className
    updateInnerCells(
      record,
      record.x,
      record.y,
      { r: BASE_GRAY, g: BASE_GRAY, b: BASE_GRAY },
      2,
      '',
      pathSteps,
      false,
      false,
      false,
      '',
      null,
      activeSteps
    )
  }

  function updateInnerCells(record, seedX, seedY, baseColor, variationRange, arrowSide, pathSteps, glowAll, glowSprite, selectedSprite, selectedSpriteSide, selectedSpriteColor, activeSteps) {
    var innerY
    var innerX
    var index

    for (innerY = 0; innerY < INNER_GRID_SIZE; innerY += 1) {
      for (innerX = 0; innerX < INNER_GRID_SIZE; innerX += 1) {
        index = (innerY * INNER_GRID_SIZE) + innerX
        updateInnerCell(
          record.innerCells[index],
          seedX,
          seedY,
          innerX,
          innerY,
          baseColor,
          variationRange,
          arrowSide,
          pathSteps,
          glowAll,
          glowSprite,
          selectedSprite,
          selectedSpriteSide,
          selectedSpriteColor,
          activeSteps
        )
      }
    }
  }

  function updateInnerCell(inner, seedX, seedY, innerX, innerY, baseColor, variationRange, arrowSide, pathSteps, glowAll, glowSprite, selectedSprite, selectedSpriteSide, selectedSpriteColor, activeSteps) {
    var isCannonSprite = isCannonSpriteCell(arrowSide, innerX, innerY)
    var isLaserSprite = isLaserSpriteCell(pathSteps || [], innerX, innerY)
    var mirrorTriangles = getMirrorTriangles(pathSteps || [], innerX, innerY)
    var isMirrorGlowSuppressed = isMirrorGlowSuppressedCell(pathSteps || [], innerX, innerY)
    var isSelectedSprite = selectedSprite && isSelectedSpriteCell(selectedSpriteSide, innerX, innerY)
    var activeTriangles = getMirrorTriangles(activeSteps || [], innerX, innerY)
    var historical = activeSteps && !isLaserSpriteCell(activeSteps, innerX, innerY)
    var innerBaseColor = getInnerBaseColor(baseColor, isCannonSprite, isLaserSprite && mirrorTriangles.length < 1, isSelectedSprite, selectedSpriteColor)
    if (historical && isLaserSprite && mirrorTriangles.length < 1) innerBaseColor = LASER_HISTORY
    var className = 'mazer-inner-cell'

    clearNode(inner)

    if (innerBaseColor) {
      inner.style.backgroundColor = getVariedColor(
        seedX,
        seedY,
        innerX,
        innerY,
        innerBaseColor,
        getInnerVariationRange(variationRange, isCannonSprite, isLaserSprite, isSelectedSprite)
      )
    } else {
      inner.style.backgroundColor = 'transparent'
    }

    if (isCannonSprite) {
      className += ' mazer-cannon-sprite-cell'
    }

    if ((!historical && isLaserSprite && !isMirrorGlowSuppressed) || glowAll || (glowSprite && isCannonSprite)) {
      className += ' mazer-laser-sprite-cell'
    }

    if (isSelectedSprite) {
      className += ' mazer-selected-sprite-cell'
    }

    inner.className = className

    if (mirrorTriangles.length > 0) {
      appendMirrorTriangles(inner, mirrorTriangles, activeTriangles)
    }
  }

  function onClick(event) {
    var target = event.target
    var selected

    while (target && target !== root && target.tagName !== 'BUTTON') {
      target = target.parentNode
    }

    if (!options.interactive || !target || target === root || target.tagName !== 'BUTTON') {
      return
    }

    selected = {
      side: target.getAttribute('data-side'),
      coordinate: Number(target.getAttribute('data-coordinate')),
    }

    if (!isValidTarget(selected)) {
      return
    }

    options.onTargetSelected(selected)
  }

  function onResize() {
    needsResize = true
    resize()
  }

  function resize() {
    var parent = root.parentNode
    var width = parent ? parent.clientWidth : 0
    var height = parent ? parent.clientHeight : 0
    var availableSize
    var cellSize
    var boardSize

    if (width < 1 || height < 1) {
      needsResize = true
      return
    }

    if (!needsResize && width === lastParentWidth && height === lastParentHeight) {
      return
    }

    lastParentWidth = width
    lastParentHeight = height
    availableSize = Math.min(width, height) - (CELL_GAP * (GRID_SIZE - 1))
    cellSize = Math.floor(availableSize / GRID_SIZE)
    if (cellSize < 1) {
      cellSize = 1
    }
    boardSize = (cellSize * GRID_SIZE) + (CELL_GAP * (GRID_SIZE - 1))

    root.style.width = boardSize + 'px'
    root.style.height = boardSize + 'px'
    root.style.gridTemplateColumns = repeatCss(GRID_SIZE, cellSize + 'px')
    root.style.gridTemplateRows = repeatCss(GRID_SIZE, cellSize + 'px')
    lastCellSize = cellSize
    needsResize = false
  }

  function destroy() {
    stopCannonSlide()
    root.removeEventListener('click', onClick)
    window.removeEventListener('resize', onResize)
    clearNode(root)
  }

  function syncDisplayedCannon() {
    var round = state ? state.round : null
    var nextCannon = round ? round.cannon : null
    var path

    if (!nextCannon) {
      stopCannonSlide()
      displayedCannon = null
      cannonSlideTarget = null
      return
    }

    if (!displayedCannon) {
      stopCannonSlide()
      displayedCannon = cloneTarget(nextCannon)
      cannonSlideTarget = cloneTarget(nextCannon)
      return
    }

    if (targetsEqual(displayedCannon, nextCannon)) {
      stopCannonSlide()
      cannonSlideTarget = cloneTarget(nextCannon)
      return
    }

    if (cannonSlideTarget && targetsEqual(cannonSlideTarget, nextCannon)) {
      return
    }

    path = createShortestBorderPath(displayedCannon, nextCannon)
    cannonSlideTarget = cloneTarget(nextCannon)
    if (path.length < 1) {
      displayedCannon = cloneTarget(nextCannon)
      stopCannonSlide()
      return
    }

    startCannonSlide(path)
  }

  function startCannonSlide(path) {
    stopCannonSlide()
    cannonSlidePath = path
    cannonSlideIndex = -1
    cannonSlideStartedAt = Date.now()
    scheduleCannonSlide()
  }

  function scheduleCannonSlide() {
    if (cannonSlideFrameId) {
      return
    }

    if (window.requestAnimationFrame) {
      cannonSlideUsesAnimationFrame = true
      cannonSlideFrameId = window.requestAnimationFrame(advanceCannonSlide)
      return
    }

    cannonSlideUsesAnimationFrame = false
    cannonSlideFrameId = window.setTimeout(advanceCannonSlide, 16)
  }

  function advanceCannonSlide() {
    var previousCannon = displayedCannon ? cloneTarget(displayedCannon) : null
    var elapsed = Date.now() - cannonSlideStartedAt
    var nextIndex = Math.floor(elapsed / CANNON_SLIDE_CELL_MS)

    cannonSlideFrameId = 0

    if (nextIndex >= cannonSlidePath.length) {
      if (cannonSlideTarget) {
        displayedCannon = cloneTarget(cannonSlideTarget)
      }
      stopCannonSlide()
      updateCannonEdgeCells(previousCannon, displayedCannon)
      return
    }

    if (nextIndex > cannonSlideIndex) {
      cannonSlideIndex = nextIndex
      displayedCannon = cloneTarget(cannonSlidePath[cannonSlideIndex])
      updateCannonEdgeCells(previousCannon, displayedCannon)
    }

    scheduleCannonSlide()
  }

  function updateCannonEdgeCells(previousCannon, nextCannon) {
    var previousRecord
    var nextRecord

    if (previousCannon) {
      previousRecord = edgeCellsByKey[getTargetKey(previousCannon)]
      if (previousRecord) {
        updateEdgeCell(previousRecord)
      }
    }

    if (nextCannon && (!previousCannon || !targetsEqual(previousCannon, nextCannon))) {
      nextRecord = edgeCellsByKey[getTargetKey(nextCannon)]
      if (nextRecord) {
        updateEdgeCell(nextRecord)
      }
    }
  }

  function stopCannonSlide() {
    if (cannonSlideFrameId) {
      if (cannonSlideUsesAnimationFrame && window.cancelAnimationFrame) {
        window.cancelAnimationFrame(cannonSlideFrameId)
      } else {
        window.clearTimeout(cannonSlideFrameId)
      }
      cannonSlideFrameId = 0
    }
    cannonSlidePath = []
    cannonSlideIndex = -1
    cannonSlideStartedAt = 0
  }

  function createShortestBorderPath(fromTarget, toTarget) {
    var fromIndex = targetToBorderIndex(fromTarget)
    var toIndex = targetToBorderIndex(toTarget)
    var clockwiseDistance
    var counterClockwiseDistance
    var step
    var distance
    var path = []
    var offset

    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      return path
    }

    clockwiseDistance = (toIndex - fromIndex + (BOARD_SIZE * 4)) % (BOARD_SIZE * 4)
    counterClockwiseDistance = (fromIndex - toIndex + (BOARD_SIZE * 4)) % (BOARD_SIZE * 4)
    step = clockwiseDistance <= counterClockwiseDistance ? 1 : -1
    distance = step === 1 ? clockwiseDistance : counterClockwiseDistance

    for (offset = 1; offset <= distance; offset += 1) {
      path.push(borderIndexToTarget(fromIndex + (step * offset)))
    }

    return path
  }

  function targetToBorderIndex(target) {
    if (!target) {
      return -1
    }

    if (target.side === 'top') {
      return Number(target.coordinate)
    }

    if (target.side === 'right') {
      return BOARD_SIZE + Number(target.coordinate)
    }

    if (target.side === 'bottom') {
      return (BOARD_SIZE * 2) + (BOARD_SIZE - 1 - Number(target.coordinate))
    }

    if (target.side === 'left') {
      return (BOARD_SIZE * 3) + (BOARD_SIZE - 1 - Number(target.coordinate))
    }

    return -1
  }

  function borderIndexToTarget(index) {
    var normalized = ((index % (BOARD_SIZE * 4)) + (BOARD_SIZE * 4)) % (BOARD_SIZE * 4)

    if (normalized < BOARD_SIZE) {
      return { side: 'top', coordinate: normalized }
    }

    if (normalized < BOARD_SIZE * 2) {
      return { side: 'right', coordinate: normalized - BOARD_SIZE }
    }

    if (normalized < BOARD_SIZE * 3) {
      return { side: 'bottom', coordinate: (BOARD_SIZE * 3) - 1 - normalized }
    }

    return { side: 'left', coordinate: (BOARD_SIZE * 4) - 1 - normalized }
  }

  function isHistoricalEndpoint(target) {
    var shots = state && state.board ? state.board.resolvedShots || [] : []
    var index
    for (index = 0; index < shots.length; index += 1) {
      if (targetsEqual(shots[index].cannon, target) || targetsEqual(shots[index].target, target)) return true
    }
    return false
  }

  function hasVisibleLaser(round) {
    return !!(round && round.laserPath && round.laserPath.length > 0)
  }

  function getInnerBaseColor(baseColor, isCannonSprite, isLaserSprite, isSelectedSprite, selectedSpriteColor) {
    if (isLaserSprite) {
      return LASER_AMBER
    }

    if (isCannonSprite) {
      return LASER_AMBER
    }

    if (isSelectedSprite) {
      return selectedSpriteColor || SELECTED_TARGET_BLUE
    }

    return baseColor
  }

  function getInnerVariationRange(variationRange, isCannonSprite, isLaserSprite, isSelectedSprite) {
    if (isLaserSprite) {
      return 16
    }

    if (isCannonSprite) {
      return 16
    }

    if (isSelectedSprite) {
      return 16
    }

    return variationRange
  }

  function isSelectedSpriteCell(side, innerX, innerY) {
    if (side === 'left') {
      return innerY !== 1 || innerX === 0
    }

    if (side === 'right') {
      return innerY !== 1 || innerX === 2
    }

    if (side === 'top') {
      return innerX !== 1 || innerY === 0
    }

    return innerX !== 1 || innerY === 2
  }

  function isCannonSpriteCell(side, innerX, innerY) {
    if (side === 'left') {
      return innerY === 1 || innerX === 0
    }

    if (side === 'right') {
      return innerY === 1 || innerX === 2
    }

    if (side === 'top') {
      return innerX === 1 || innerY === 0
    }

    if (side === 'bottom') {
      return innerX === 1 || innerY === 2
    }

    return false
  }

  function getMirrorTriangles(pathSteps, innerX, innerY) {
    var index
    var step
    var triangle
    var triangles = []
    var seen = {}

    if (!isCenterInnerCell(innerX, innerY)) {
      return triangles
    }

    for (index = 0; index < pathSteps.length; index += 1) {
      step = pathSteps[index]

      if (step && step.mirror && step.direction) {
        triangle = getMirrorTriangleClipPath(step.direction, step.mirror)

        if (!seen[triangle]) {
          seen[triangle] = true
          triangles.push(triangle)
        }
      }
    }

    return triangles
  }

  function appendMirrorTriangles(inner, clipPaths, activeTriangles) {
    var index
    var triangle

    for (index = 0; index < clipPaths.length; index += 1) {
      triangle = createNode('span', 'mazer-mirror-triangle')
      triangle.style.backgroundColor = activeTriangles.indexOf(clipPaths[index]) < 0 ? 'rgb(115,80,12)' : LASER_AMBER_RGB
      triangle.style.webkitClipPath = clipPaths[index]
      triangle.style.clipPath = clipPaths[index]
      inner.appendChild(triangle)
    }
  }

  function getMirrorTriangleClipPath(entryDirection, mirrorType) {
    if (mirrorType === 'slash') {
      if (entryDirection === 'right' || entryDirection === 'down') {
        return 'polygon(0 0, 100% 0, 0 100%)'
      }

      return 'polygon(100% 0, 100% 100%, 0 100%)'
    }

    if (entryDirection === 'right' || entryDirection === 'up') {
      return 'polygon(0 0, 100% 100%, 0 100%)'
    }

    return 'polygon(0 0, 100% 0, 100% 100%)'
  }

  function isMirrorGlowSuppressedCell(pathSteps, innerX, innerY) {
    var index
    var step

    for (index = 0; index < pathSteps.length; index += 1) {
      step = pathSteps[index]

      if (step && step.mirror && isCenterInnerCell(innerX, innerY)) {
        return true
      }
    }

    return false
  }

  function isLaserSpriteCell(pathSteps, innerX, innerY) {
    var index

    for (index = 0; index < pathSteps.length; index += 1) {
      if (isLaserStepSpriteCell(pathSteps[index], innerX, innerY)) {
        return true
      }
    }

    return false
  }

  function isLaserStepSpriteCell(pathStep, innerX, innerY) {
    var direction = pathStep ? pathStep.direction : ''
    var exitDirection

    if (!direction) {
      return false
    }

    if (pathStep.mirror) {
      exitDirection = reflectLaser(direction, pathStep.mirror)
      return isCenterInnerCell(innerX, innerY) ||
        isEntryInnerCell(direction, innerX, innerY) ||
        isExitInnerCell(exitDirection, innerX, innerY)
    }

    if (direction === 'left' || direction === 'right') {
      return innerY === 1
    }

    if (direction === 'up' || direction === 'down') {
      return innerX === 1
    }

    return false
  }

  function isCenterInnerCell(innerX, innerY) {
    return innerX === 1 && innerY === 1
  }

  function isEntryInnerCell(direction, innerX, innerY) {
    if (direction === 'right') {
      return innerX === 0 && innerY === 1
    }

    if (direction === 'left') {
      return innerX === 2 && innerY === 1
    }

    if (direction === 'down') {
      return innerX === 1 && innerY === 0
    }

    if (direction === 'up') {
      return innerX === 1 && innerY === 2
    }

    return false
  }

  function isExitInnerCell(direction, innerX, innerY) {
    if (direction === 'right') {
      return innerX === 2 && innerY === 1
    }

    if (direction === 'left') {
      return innerX === 0 && innerY === 1
    }

    if (direction === 'down') {
      return innerX === 1 && innerY === 2
    }

    if (direction === 'up') {
      return innerX === 1 && innerY === 0
    }

    return false
  }

  function reflectLaser(direction, mirrorType) {
    if (mirrorType === 'slash') {
      if (direction === 'right') return 'up'
      if (direction === 'left') return 'down'
      if (direction === 'down') return 'left'
      return 'right'
    }

    if (direction === 'right') return 'down'
    if (direction === 'left') return 'up'
    if (direction === 'down') return 'right'
    return 'left'
  }

  function getVariedColor(seedX, seedY, innerX, innerY, baseColor, variationRange) {
    var offset = stableVariation(seedX, seedY, innerX, innerY, variationRange)

    return 'rgb(' +
      clampColor(baseColor.r + offset) + ',' +
      clampColor(baseColor.g + offset) + ',' +
      clampColor(baseColor.b + offset) + ')'
  }

  function stableVariation(seedX, seedY, innerX, innerY, variationRange) {
    var safeRange = Math.max(0, Math.floor(Number(variationRange) || 0))
    var value

    if (safeRange === 0) {
      return 0
    }

    value = ((seedX + 11) * 73856093) ^
      ((seedY + 13) * 19349663) ^
      ((innerX + 17) * 83492791) ^
      ((innerY + 19) * 2654435761)
    value = value & 0x7fffffff
    value = value % ((safeRange * 2) + 1)
    return value - safeRange
  }

  function clampColor(value) {
    if (value < 0) {
      return 0
    }

    if (value > 255) {
      return 255
    }

    return value
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

  function sideIndex(side) {
    if (side === 'left') {
      return -1
    }

    if (side === 'right') {
      return BOARD_SIZE
    }

    if (side === 'top') {
      return -2
    }

    return BOARD_SIZE + 1
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

  function findLaserPathSteps(path, x, y) {
    var output = []
    var index
    var step

    for (index = 0; index < path.length; index += 1) {
      step = path[index]

      if (step.x === x && step.y === y) {
        output.push(step)
      }
    }

    return output
  }

  function findGuessForTarget(guessesById, target) {
    var playerId
    var guess

    if (!guessesById) {
      return null
    }

    for (playerId in guessesById) {
      guess = guessesById[playerId]

      if (guess && targetsEqual(guess.target, target)) {
        return guess
      }
    }

    return null
  }

  function targetsEqual(left, right) {
    return !!left && !!right &&
      left.side === right.side &&
      Number(left.coordinate) === Number(right.coordinate)
  }

  function isValidTarget(target) {
    return !!target &&
      (target.side === 'left' || target.side === 'right' || target.side === 'top' || target.side === 'bottom') &&
      Number(target.coordinate) >= 0 &&
      Number(target.coordinate) < BOARD_SIZE
  }

  function cloneTarget(target) {
    return {
      side: target.side,
      coordinate: Number(target.coordinate),
    }
  }

  function getTargetKey(target) {
    return target.side + ':' + String(Number(target.coordinate))
  }

  function getCellKey(x, y) {
    return String(x) + ':' + String(y)
  }

  function getPathStepsSignature(pathSteps) {
    var output = []
    var index
    var step

    for (index = 0; index < pathSteps.length; index += 1) {
      step = pathSteps[index]
      output.push(String(step.direction || '') + '/' + String(step.mirror || ''))
    }

    return output.join(',')
  }

  function colorSignature(color) {
    if (!color) {
      return ''
    }

    return String(color.r) + ',' + String(color.g) + ',' + String(color.b)
  }

  function boolSignature(value) {
    return value ? '1' : '0'
  }

  function repeatCss(count, value) {
    var output = []
    var position

    for (position = 0; position < count; position += 1) {
      output.push(value)
    }

    return output.join(' ')
  }

  function createNode(tagName, className) {
    var node = document.createElement(tagName)
    node.className = className
    return node
  }

  function clearNode(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild)
    }
  }
}

function installMazerBoardStyles() {
  if (document.getElementById('mazer-board-styles')) {
    return
  }

  var style = document.createElement('style')
  style.id = 'mazer-board-styles'
  style.textContent =
    '.mazer-board{display:grid;gap:0;align-content:center;justify-content:center;margin:0 auto;max-width:100%;max-height:100%;box-sizing:border-box;background:transparent}' +
    '.mazer-board-corner,.mazer-board-edge,.mazer-cell{position:relative;box-sizing:border-box;min-width:0;min-height:0}' +
    '.mazer-board-corner{background:transparent}' +
    '.mazer-edge-target{display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr 1fr;gap:0;width:100%;height:100%;margin:0;border:1px solid #020617;border-radius:0;padding:0;overflow:hidden;background:#020617;color:transparent;font-size:0rem;line-height:0;box-sizing:border-box;-webkit-appearance:none;appearance:none;transition:filter 120ms ease,box-shadow 120ms ease}' +
    'button.mazer-edge-target:hover,button.mazer-edge-target:focus-visible{filter:brightness(1.28);box-shadow:inset 0 0 0 2px rgba(255,176,0,.95),0 0 10px rgba(255,143,0,.8),0 0 18px rgba(255,111,0,.5);outline:none;z-index:3}' +
    '.mazer-cell{display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr 1fr;gap:0;overflow:hidden;background:#263238;border:1px solid #020617}' +
    '.mazer-inner-cell{display:block;position:relative;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden}' +
    '.mazer-mirror-triangle{position:absolute;inset:0;display:block;z-index:2}' +
    '.mazer-cell-mirror:after{content:"";position:absolute;left:16.666%;top:16.666%;width:94.281%;height:0;box-sizing:border-box;border-top:3px solid #93c5fd;transform-origin:left center;z-index:2}' +
    '.mazer-cell-mirror-slash:after{left:16.666%;top:83.333%;transform:rotate(-45deg)}' +
    '.mazer-cell-mirror-backslash:after{left:16.666%;top:16.666%;transform:rotate(45deg)}' +
    '.mazer-laser-sprite-cell{box-shadow:0 0 4px rgba(255,213,79,.9),0 0 8px rgba(255,176,0,.7),0 0 14px rgba(255,176,0,.45),0 0 22px rgba(255,111,0,.28);z-index:1}'
  document.head.appendChild(style)
}
