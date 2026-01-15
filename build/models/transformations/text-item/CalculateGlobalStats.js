// @flow

const ToTextItemTransformation = require('../ToTextItemTransformation')
const ParseResult = require('../../ParseResult')
const WordFormat = require('../../markdown/WordFormat')
const StyleConfidence = require('../../StyleConfidence')
const config = require('../../../util/style-detection-config')

module.exports = class CalculateGlobalStats extends ToTextItemTransformation {
  constructor (fontMap) {
    super('$1')
    this.fontMap = fontMap
  }

  transform (parseResult /*: ParseResult */) /*: ParseResult */ {
    // Parse heights
    const heightToOccurrence = {}
    const fontToOccurrence = {}
    var maxHeight = 0
    var maxHeightFont
    const ImageItem = require('../../ImageItem')
    parseResult.pages.forEach(page => {
      page.items.forEach(item => {
        // Skip ImageItems when calculating stats
        if (item instanceof ImageItem || (item.constructor && item.constructor.name === 'ImageItem') ||
            (item && typeof item === 'object' && item.imageData)) {
          return
        }
        if (!item.height) return
        heightToOccurrence[item.height] = heightToOccurrence[item.height] ? heightToOccurrence[item.height] + 1 : 1
        fontToOccurrence[item.font] = fontToOccurrence[item.font] ? fontToOccurrence[item.font] + 1 : 1
        if (item.height > maxHeight) {
          maxHeight = item.height
          maxHeightFont = item.font
        }
      })
    })
    const mostUsedHeight = parseInt(getMostUsedKey(heightToOccurrence))
    const mostUsedFont = getMostUsedKey(fontToOccurrence)

    // Parse line distances
    const distanceToOccurrence = {}
    parseResult.pages.forEach(page => {
      var lastItemOfMostUsedHeight
      page.items.forEach(item => {
        if (item.height === mostUsedHeight && item.text.trim().length > 0) {
          if (lastItemOfMostUsedHeight && item.y !== lastItemOfMostUsedHeight.y) {
            const distance = lastItemOfMostUsedHeight.y - item.y
            if (distance > 0) {
              distanceToOccurrence[distance] = distanceToOccurrence[distance] ? distanceToOccurrence[distance] + 1 : 1
            }
          }
          lastItemOfMostUsedHeight = item
        } else {
          lastItemOfMostUsedHeight = null
        }
      })
    })
    const mostUsedDistance = parseInt(getMostUsedKey(distanceToOccurrence))
    
    // Calculate average character width per font (for width-based bold detection)
    const fontToWidthStats = calculateFontWidthStats(parseResult.pages, mostUsedFont, mostUsedHeight)
    const bodyAvgWidthPerChar = fontToWidthStats.get(mostUsedFont)?.avgWidthPerChar || 0
    
    // Multi-feature style detection
    const fontIdToName = []
    const fontToFormats = new Map() // Backward compatibility: still output format names
    const fontToStyleProfile = new Map() // New: stores StyleConfidence for explainability
    
    this.fontMap.forEach(function (value, key) {
      fontIdToName.push(key + ' = ' + value.name)
      
      // Skip body font (no special formatting)
      if (key === mostUsedFont) {
        fontToStyleProfile.set(key, new StyleConfidence(0, 0))
        return
      }
      
      // Multi-feature style confidence scoring
      const confidence = calculateStyleConfidence(
        value,
        key,
        mostUsedFont,
        maxHeightFont,
        fontToWidthStats,
        bodyAvgWidthPerChar
      )
      
      fontToStyleProfile.set(key, confidence)
      
      // Convert to WordFormat for backward compatibility
      const format = confidence.toWordFormat(config.styleConfidence.boldThreshold)
      if (format) {
        fontToFormats.set(key, format.name)
      }
    })
    fontIdToName.sort()

    // Make a copy of the originals so all following transformation don't modify them
    const newPages = parseResult.pages.map(page => {
      return {
        ...page,
        items: page.items.map(item => {
          // Preserve ImageItems as-is, copy TextItems
          if (item instanceof ImageItem || (item.constructor && item.constructor.name === 'ImageItem') ||
              (item && typeof item === 'object' && item.imageData)) {
            return item // Keep ImageItem as-is
          }
          return { ...item } // Copy TextItem
        }),
      }
    })
    return new ParseResult({
      ...parseResult,
      pages: newPages,
      globals: {
        mostUsedHeight,
        mostUsedFont,
        mostUsedDistance,
        maxHeight,
        maxHeightFont,
        fontToFormats, // Backward compatibility
        fontToStyleProfile, // New: StyleConfidence map for explainability
        bodyAvgWidthPerChar, // For width-based detection
      },
      messages: [
        'Items per height: ' + JSON.stringify(heightToOccurrence),
        'Items per font: ' + JSON.stringify(fontToOccurrence),
        'Items per distance: ' + JSON.stringify(distanceToOccurrence),
        'Fonts:' + JSON.stringify(fontIdToName),
      ],
    })
  }
}

function getMostUsedKey (keyToOccurrence) {
  var maxOccurence = 0
  var maxKey
  Object.keys(keyToOccurrence).map((element) => {
    if (!maxKey || keyToOccurrence[element] > maxOccurence) {
      maxOccurence = keyToOccurrence[element]
      maxKey = element
    }
  })
  return maxKey
}

/**
 * Calculate average character width statistics per font.
 * This enables width-based bold detection (bold text is typically 10-20% wider).
 */
function calculateFontWidthStats (pages, mostUsedFont, mostUsedHeight) {
  const fontToWidthStats = new Map()
  const ImageItem = require('../../ImageItem')
  
  pages.forEach(page => {
    page.items.forEach(item => {
      // Skip ImageItems
      if (item instanceof ImageItem || (item.constructor && item.constructor.name === 'ImageItem') ||
          (item && typeof item === 'object' && item.imageData)) {
        return
      }
      
      if (!item.font || !item.text || !item.width || !item.height) return
      
      // Only consider items with body height (to compare same-size fonts)
      if (Math.abs(item.height - mostUsedHeight) > 0.5) return
      
      const textLength = item.text.trim().length
      if (textLength === 0) return
      
      const widthPerChar = item.width / textLength
      
      if (!fontToWidthStats.has(item.font)) {
        fontToWidthStats.set(item.font, {
          totalWidth: 0,
          totalChars: 0,
          samples: []
        })
      }
      
      const stats = fontToWidthStats.get(item.font)
      stats.totalWidth += item.width
      stats.totalChars += textLength
      stats.samples.push({ width: item.width, chars: textLength, widthPerChar })
    })
  })
  
  // Calculate averages
  fontToWidthStats.forEach((stats, font) => {
    if (stats.totalChars > 0) {
      stats.avgWidthPerChar = stats.totalWidth / stats.totalChars
      stats.sampleCount = stats.samples.length
    }
  })
  
  return fontToWidthStats
}

/**
 * Multi-feature style confidence scoring.
 * 
 * Features (in priority order):
 * 1. FontDescriptor.FontWeight (if available from PDF)
 * 2. Character width comparison (same fontFamily, different weight)
 * 3. Width relative to body text average
 * 4. Font name string matching (weak signal, fallback)
 * 
 * @param {Object} fontObj - Font object from PDF.js
 * @param {string} fontId - Font ID
 * @param {string} mostUsedFont - Body font ID
 * @param {string} maxHeightFont - Font used for max height text
 * @param {Map} fontToWidthStats - Width statistics per font
 * @param {number} bodyAvgWidthPerChar - Average width per character for body font
 * @returns {StyleConfidence}
 */
function calculateStyleConfidence (fontObj, fontId, mostUsedFont, maxHeightFont, fontToWidthStats, bodyAvgWidthPerChar) {
  const weights = config.fontStyleWeights
  let boldScore = 0
  let italicScore = 0
  
  const fontName = (fontObj.name || '').toLowerCase()
  
  // Feature 1: FontDescriptor.FontWeight (highest priority if available)
  if (fontObj.fontDescriptor) {
    const fontWeight = fontObj.fontDescriptor.FontWeight
    if (fontWeight !== undefined && fontWeight !== null) {
      // Normal font weight is typically 400, bold is 700+
      if (fontWeight >= 600) {
        boldScore += weights.fontDescriptorWeight
      }
      // Italic detection from fontDescriptor
      if (fontObj.fontDescriptor.ItalicAngle && Math.abs(fontObj.fontDescriptor.ItalicAngle) > 0) {
        italicScore += weights.fontDescriptorWeight
      }
    }
  }
  
  // Feature 2: Width comparison (compare with same fontFamily variants)
  const currentWidthStats = fontToWidthStats.get(fontId)
  if (currentWidthStats && bodyAvgWidthPerChar > 0 && currentWidthStats.sampleCount >= config.widthComparison.minSamples) {
    const widthRatio = currentWidthStats.avgWidthPerChar / bodyAvgWidthPerChar
    if (widthRatio >= config.widthComparison.widthRatioThreshold) {
      // Bold text is typically 10-20% wider
      const widthScore = Math.min(1, (widthRatio - 1) / 0.2) // Normalize: 1.0 -> 0, 1.2 -> 1
      boldScore += widthScore * weights.widthComparison
    }
  }
  
  // Feature 3: Width relative to body average
  if (currentWidthStats && bodyAvgWidthPerChar > 0) {
    const relativeWidth = currentWidthStats.avgWidthPerChar / bodyAvgWidthPerChar
    if (relativeWidth > 1.1) {
      const relativeScore = Math.min(1, (relativeWidth - 1) / 0.15)
      boldScore += relativeScore * weights.bodyWidthRatio
    }
  }
  
  // Feature 4: Font name string matching (weak signal, fallback)
  if (fontName.includes('bold') && (fontName.includes('oblique') || fontName.includes('italic'))) {
    boldScore += weights.fontNameMatch
    italicScore += weights.fontNameMatch
  } else if (fontName.includes('bold')) {
    boldScore += weights.fontNameMatch
  } else if (fontName.includes('oblique') || fontName.includes('italic')) {
    italicScore += weights.fontNameMatch
  }
  
  // Legacy fallback: maxHeightFont heuristic (very weak)
  if (fontId === maxHeightFont && boldScore < 0.3) {
    boldScore += 0.1
  }
  
  return new StyleConfidence(boldScore, italicScore)
}
