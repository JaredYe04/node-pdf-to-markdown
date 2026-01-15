// @flow

const ToLineItemTransformation = require('../ToLineItemTransformation')
const ParseResult = require('../../ParseResult')
const ImageItem = require('../../ImageItem')
const { DETECTED_ANNOTATION } = require('../../Annotation')
const BlockType = require('../../markdown/BlockType')
const { headlineByLevel } = require('../../markdown/BlockType')
const { isListItem } = require('../../../util/string-functions')
const HeaderScore = require('../../HeaderScore')
const config = require('../../../util/style-detection-config')

/**
 * Multi-feature header detection using weighted scoring.
 * 
 * Replaces the old height-based sorting with a comprehensive scoring system
 * that considers: fontSize ratio, vertical spacing, position, repetition patterns, etc.
 */
module.exports = class DetectHeaders extends ToLineItemTransformation {
  constructor () {
    super('Detect Headers')
  }

  transform (parseResult /*: ParseResult */) /*: ParseResult */ {
    const { 
      tocPages, 
      headlineTypeToHeightRange, 
      mostUsedHeight, 
      mostUsedDistance, 
      mostUsedFont,
      maxHeight 
    } = parseResult.globals
    const hasToc = tocPages && tocPages.length > 0
    var detectedHeaders = 0

    // Collect all candidate LineItems (excluding images and already-typed items)
    const candidates = []
    parseResult.pages.forEach(page => {
      const textItems = page.items.filter(item => 
        !(item instanceof ImageItem || (item.constructor && item.constructor.name === 'ImageItem') ||
          (item && typeof item === 'object' && item.imageData))
      )
      textItems.forEach(item => {
        if (!item.type && !isListItem(item.text())) {
          candidates.push({ item, page })
        }
      })
    })

    // Calculate page dimensions for position scoring
    const pageDimensions = calculatePageDimensions(parseResult.pages)

    // Calculate fontSize occurrence patterns (for repetition scoring)
    const fontSizeToOccurrence = calculateFontSizeOccurrence(candidates, mostUsedHeight)

    // Score each candidate
    const scoredCandidates = candidates.map(({ item, page }) => {
      const score = calculateHeaderScore(
        item,
        page,
        mostUsedHeight,
        mostUsedDistance,
        mostUsedFont,
        pageDimensions,
        fontSizeToOccurrence,
        candidates
      )
      return { item, page, score }
    })

    // Filter by minimum score threshold
    const headerCandidates = scoredCandidates.filter(
      c => c.score.score >= config.headerDetection.minScore
    )

    // Handle TOC-based detection (if available) - higher priority
    if (hasToc && headlineTypeToHeightRange) {
      const tocHeaders = detectHeadersFromTOC(
        parseResult.pages,
        headlineTypeToHeightRange,
        mostUsedHeight
      )
      tocHeaders.forEach(({ item, level }) => {
        item.type = headlineByLevel(level)
        item.annotation = DETECTED_ANNOTATION
        detectedHeaders++
      })
    }

    // Cluster remaining candidates by fontSize and assign levels
    const fontSizeToLevel = clusterHeadersByFontSize(
      headerCandidates.filter(c => !c.item.type),
      mostUsedHeight,
      config.headerDetection.maxLevel
    )

    // Assign header types based on clustering
    fontSizeToLevel.forEach((level, fontSize) => {
      headerCandidates.forEach(({ item }) => {
        if (!item.type && Math.abs(item.height - fontSize) < 0.5) {
          item.type = headlineByLevel(level)
          item.annotation = DETECTED_ANNOTATION
          detectedHeaders++
        }
      })
    })

    // Handle title pages (pages with maxHeight text)
    const pagesWithMaxHeight = findPagesWithMaxHeight(parseResult.pages, maxHeight)
    pagesWithMaxHeight.forEach(titlePage => {
      titlePage.items.forEach(item => {
        if (!item.type && item.height === maxHeight) {
          item.type = BlockType.H1
          item.annotation = DETECTED_ANNOTATION
          detectedHeaders++
        } else if (!item.type && item.height > mostUsedHeight + ((maxHeight - mostUsedHeight) / 3)) {
          // Second level on title page
          item.type = BlockType.H2
          item.annotation = DETECTED_ANNOTATION
          detectedHeaders++
        }
      })
    })

    return new ParseResult({
      ...parseResult,
      globals: {
        ...parseResult.globals,
        fontSizeToHeaderLevel: fontSizeToLevel, // Store mapping for explainability
      },
      messages: [
        'Detected ' + detectedHeaders + ' headlines using multi-feature scoring.',
        'FontSize to HeaderLevel mapping: ' + JSON.stringify(Array.from(fontSizeToLevel.entries())),
      ],
    })
  }
}

/**
 * Calculate HeaderScore for a LineItem using multiple features.
 */
function calculateHeaderScore (item, page, mostUsedHeight, mostUsedDistance, mostUsedFont, pageDimensions, fontSizeToOccurrence, allCandidates) {
  const fontSize = item.height
  const fontSizeRatio = fontSize / mostUsedHeight

  // Feature 1: fontSizeRatio (most important)
  // Only consider if significantly larger than body
  if (fontSizeRatio < config.headerDetection.fontSizeRatioThreshold) {
    return new HeaderScore(0, { fontSizeRatio, reason: 'fontSize too small' })
  }

  // Feature 2: Vertical spacing
  const verticalSpacing = calculateVerticalSpacing(item, page, allCandidates, mostUsedDistance)
  
  // Feature 3: Is standalone (no adjacent text on same line)
  const isStandalone = isLineStandalone(item, page, allCandidates)
  
  // Feature 4: Position on page (0 = bottom, 1 = top)
  const positionOnPage = pageDimensions[page.index] 
    ? (pageDimensions[page.index].maxY - item.y) / (pageDimensions[page.index].maxY - pageDimensions[page.index].minY)
    : 0.5
  
  // Feature 5: Repetition pattern (how often this fontSize appears)
  const occurrence = fontSizeToOccurrence.get(fontSize) || 0
  const maxOccurrence = Math.max(...Array.from(fontSizeToOccurrence.values()))
  const repetitionPattern = maxOccurrence > 0 ? occurrence / maxOccurrence : 0
  
  // Feature 6: Is uppercase (weak signal)
  const text = item.text()
  const isUppercase = text === text.toUpperCase() && text.length > 1 && /[A-Z]/.test(text)
  
  // Feature 7: Font family difference
  const fontFamilyDiff = item.font !== mostUsedFont

  return HeaderScore.create({
    fontSizeRatio,
    verticalSpacing: verticalSpacing / (mostUsedDistance * config.headerDetection.verticalSpacingMultiplier),
    isStandalone,
    positionOnPage,
    repetitionPattern,
    isUppercase,
    fontFamilyDiff,
  })
}

/**
 * Calculate vertical spacing before and after a line item.
 */
function calculateVerticalSpacing (item, page, allCandidates, mostUsedDistance) {
  const pageCandidates = allCandidates
    .filter(c => c.page.index === page.index)
    .map(c => c.item)
    .sort((a, b) => b.y - a.y) // Top to bottom

  const itemIndex = pageCandidates.findIndex(i => i === item)
  if (itemIndex === -1) return 0

  let spacingBefore = 0
  let spacingAfter = 0

  if (itemIndex > 0) {
    const prevItem = pageCandidates[itemIndex - 1]
    spacingBefore = prevItem.y - item.y - prevItem.height
  }

  if (itemIndex < pageCandidates.length - 1) {
    const nextItem = pageCandidates[itemIndex + 1]
    spacingAfter = item.y - nextItem.y - item.height
  }

  // Return maximum spacing (headers typically have larger spacing)
  return Math.max(spacingBefore, spacingAfter, 0)
}

/**
 * Check if a line is standalone (no other text on similar Y coordinate).
 */
function isLineStandalone (item, page, allCandidates) {
  const pageCandidates = allCandidates
    .filter(c => c.page.index === page.index && c.item !== item)
    .map(c => c.item)

  // Check if any other item is on a similar Y coordinate (within threshold)
  const threshold = item.height * 0.5
  const hasAdjacentText = pageCandidates.some(other => 
    Math.abs(other.y - item.y) < threshold
  )

  return !hasAdjacentText
}

/**
 * Calculate page dimensions for position scoring.
 */
function calculatePageDimensions (pages) {
  const dimensions = {}
  pages.forEach(page => {
    if (page.items.length === 0) return

    const textItems = page.items.filter(item => 
      !(item instanceof ImageItem || (item.constructor && item.constructor.name === 'ImageItem') ||
        (item && typeof item === 'object' && item.imageData))
    )

    if (textItems.length === 0) return

    const ys = textItems.map(item => item.y || 0)
    dimensions[page.index] = {
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    }
  })
  return dimensions
}

/**
 * Calculate fontSize occurrence patterns.
 */
function calculateFontSizeOccurrence (candidates, mostUsedHeight) {
  const fontSizeToOccurrence = new Map()
  candidates.forEach(({ item }) => {
    const fontSize = item.height
    fontSizeToOccurrence.set(fontSize, (fontSizeToOccurrence.get(fontSize) || 0) + 1)
  })
  return fontSizeToOccurrence
}

/**
 * Cluster headers by fontSize and assign levels (H1-H4 max).
 * Uses fontSize ratio to determine hierarchy.
 */
function clusterHeadersByFontSize (candidates, mostUsedHeight, maxLevel) {
  if (candidates.length === 0) return new Map()

  // Group by fontSize (with tolerance)
  const fontSizeGroups = new Map()
  candidates.forEach(({ item }) => {
    const fontSize = item.height
    // Find existing group within tolerance
    let found = false
    for (const [existingSize] of fontSizeGroups) {
      if (Math.abs(existingSize - fontSize) < 0.5) {
        fontSizeGroups.get(existingSize).push(item)
        found = true
        break
      }
    }
    if (!found) {
      fontSizeGroups.set(fontSize, [item])
    }
  })

  // Sort fontSizes by ratio (largest first)
  const sortedSizes = Array.from(fontSizeGroups.keys())
    .map(size => ({ size, ratio: size / mostUsedHeight }))
    .filter(({ ratio }) => ratio >= config.headerDetection.fontSizeRatioThreshold)
    .sort((a, b) => b.ratio - a.ratio)

  // Assign levels (H1-H4 max)
  const fontSizeToLevel = new Map()
  sortedSizes.forEach(({ size }, index) => {
    const level = Math.min(index + 1, maxLevel)
    fontSizeToLevel.set(size, level)
  })

  return fontSizeToLevel
}

/**
 * Detect headers from TOC (if available).
 */
function detectHeadersFromTOC (pages, headlineTypeToHeightRange, mostUsedHeight) {
  const headers = []
  const headlineTypes = Object.keys(headlineTypeToHeightRange)
  
  headlineTypes.forEach(headlineType => {
    const range = headlineTypeToHeightRange[headlineType]
    if (range && range.max > mostUsedHeight) {
      const level = BlockType.enumValueOf(headlineType).headlineLevel
      pages.forEach(page => {
        const textItems = page.items.filter(item => 
          !(item instanceof ImageItem || (item.constructor && item.constructor.name === 'ImageItem') ||
            (item && typeof item === 'object' && item.imageData))
        )
        textItems.forEach(item => {
          if (!item.type && Math.abs(item.height - range.max) < 0.5) {
            headers.push({ item, level })
          }
        })
      })
    }
  })
  
  return headers
}

function findPagesWithMaxHeight (pages, maxHeight) {
  const maxHeaderPagesSet = new Set()
  pages.forEach(page => {
    page.items.forEach(item => {
      if (!item.type && item.height === maxHeight) {
        maxHeaderPagesSet.add(page)
      }
    })
  })
  return maxHeaderPagesSet
}
