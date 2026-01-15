// @flow

const ToLineItemBlockTransformation = require('../ToLineItemBlockTransformation')
const ParseResult = require('../../ParseResult')
const ImageItem = require('../../ImageItem')
const { DETECTED_ANNOTATION } = require('../../Annotation')
const BlockType = require('../../markdown/BlockType')

// Detect table blocks
module.exports = class DetectTables extends ToLineItemBlockTransformation {
  constructor () {
    super('$1')
  }

  transform (parseResult /*: ParseResult */) /*: ParseResult */ {
    var foundTables = 0
    parseResult.pages.forEach(page => {
      // Filter out ImageItems - only process LineItemBlocks
      const blocks = page.items.filter(item => 
        !(item instanceof ImageItem || (item.constructor && item.constructor.name === 'ImageItem') ||
          (item && typeof item === 'object' && item.imageData))
      )
      
      blocks.forEach(block => {
        // Only check blocks that haven't been typed yet
        if (!block.type && block.items && block.items.length > 0) {
          if (looksLikeTable(block.items)) {
            block.annotation = DETECTED_ANNOTATION
            block.type = BlockType.TABLE
            foundTables++
          }
        }
      })
    })

    return new ParseResult({
      ...parseResult,
      messages: [
        'Detected ' + foundTables + ' table items.',
      ],
    })
  }
}

function looksLikeTable (items) {
  if (items.length === 0) {
    return false
  }
  
  // Collect all words from all items to analyze structure
  const lines = []
  items.forEach(item => {
    if (item.words && item.words.length > 0) {
      const lineText = item.words.map(w => w.string).join(' ')
      lines.push(lineText)
    }
  })
  
  // Exclude obvious non-table patterns first
  const allText = lines.join(' ')
  
  // Exclude if it's a complete sentence with punctuation (not a table)
  if (allText.match(/[。，、！？；：]/) && allText.length > 30) {
    // Check if it's a complete sentence (has sentence-ending punctuation)
    const sentenceEndings = allText.match(/[。！？]/g)
    if (sentenceEndings && sentenceEndings.length >= 1) {
      // Likely a paragraph, not a table
      return false
    }
  }
  
  // Exclude if it contains common paragraph patterns
  if (allText.match(/(这是|用于|测试|示例|说明|内容|理论上|可能|但是|因为|所以)/) && 
      allText.length > 20 && !allText.match(/[✅⚠️❌]/u)) {
    // Likely a paragraph with descriptive text
    return false
  }
  
  // Single-line table detection (strict but should catch real tables)
  if (lines.length === 1) {
    const singleLine = lines[0]
    const words = singleLine.split(/\s+/).filter(w => w.trim().length > 0)
    
    // Exclude if it's clearly a sentence/paragraph with ending punctuation
    if (singleLine.match(/[。！？]$/) && singleLine.length > 30) {
      return false
    }
    
    // Exclude if it contains common paragraph patterns
    if (singleLine.match(/(这是|用于|测试|示例|说明|内容|理论上|可能|但是|因为|所以)/) && 
        singleLine.length > 20 && !singleLine.match(/[✅⚠️❌]/u)) {
      return false
    }
    
    // Must have multiple words/phrases (table-like structure)
    if (words.length >= 4) {
      // Strong indicator: table keywords AND emoji/symbols
      const hasTableKeywords = singleLine.match(/(名称|类型|支持|备注|标题|公式|表格|列表|模块|覆盖|情况)/)
      const hasEmoji = singleLine.match(/[✅⚠️❌]/u)
      
      // Strong table indicators: keywords + emoji + multiple short words
      if (hasTableKeywords && hasEmoji && words.length >= 4) {
        // Additional check: most words should be short (table data pattern)
        const shortWords = words.filter(w => w.length <= 15).length
        if (shortWords >= 4) {
          return true
        }
      }
      
      // Alternative: very structured pattern with many short words (no sentence punctuation)
      if (words.length >= 6 && words.filter(w => w.length <= 12).length >= 5) {
        // Must NOT be a sentence (no sentence-ending punctuation)
        if (!singleLine.match(/[。！？]/)) {
          return true
        }
      }
      
      // Special case: table header pattern (名称 类型 是否支持 备注) followed by data
      if (hasTableKeywords && words.length >= 6) {
        // Check if it contains table header keywords in sequence
        const headerPattern = /(名称|类型).*(支持|备注)/
        if (headerPattern.test(singleLine) && !singleLine.match(/[。！？]/)) {
          // Additional check: should have emoji or multiple data items
          if (hasEmoji || words.length >= 8) {
            return true
          }
        }
      }
      
      // Very specific pattern: "名称 类型 是否支持 备注" followed by data with emoji
      // This is a common table pattern in Chinese documents
      if (singleLine.match(/名称.*类型.*支持.*备注/) && hasEmoji && words.length >= 8) {
        return true
      }
      
      // Even more specific: if it contains "名称 类型" and emoji, and has many words
      if (singleLine.match(/名称.*类型/) && hasEmoji && words.length >= 6) {
        // Check that it's not a sentence
        if (!singleLine.match(/[。！？]/)) {
          return true
        }
      }
    }
    
    // Single line is rarely a table, be conservative
    return false
  }
  
  if (lines.length < 2) {
    return false
  }
  
  // Check for table indicators:
  // 1. Multiple lines with similar structure
  // 2. Contains pipe characters (|) or multiple columns
  // 3. Has separator line (--- or similar)
  // 4. Contains table-like patterns (multiple words separated by spaces)
  
  let hasPipes = false
  let hasSeparator = false
  let columnCounts = []
  let hasTablePattern = false
  
  lines.forEach((line, index) => {
    // Check for pipe characters
    if (line.includes('|')) {
      hasPipes = true
      const columns = line.split('|').filter(c => c.trim().length > 0)
      columnCounts.push(columns.length)
    }
    
    // Check for separator line (---, ===, etc.)
    if (line.match(/^[\s]*[-=]{3,}[\s]*$/)) {
      hasSeparator = true
    }
    
    // Count potential columns by multiple spaces or tabs
    const parts = line.split(/\s{2,}|\t/)
    const validParts = parts.filter(p => p.trim().length > 0)
    
    if (validParts.length >= 2) {
      columnCounts.push(validParts.length)
      
      // Check for table-like patterns: multiple short words/phrases
      if (validParts.length >= 2 && validParts.every(p => p.trim().length < 30)) {
        hasTablePattern = true
      }
    }
  })
  
  // Table detection criteria (more lenient):
  // 1. Has pipes and multiple lines
  if (hasPipes && lines.length >= 2) {
    // Check if column counts are consistent
    if (columnCounts.length >= 2) {
      const firstCount = columnCounts[0]
      const consistent = columnCounts.slice(1, Math.min(5, columnCounts.length)).every(count => 
        Math.abs(count - firstCount) <= 2 // Allow more variance
      )
      if (consistent && firstCount >= 2) {
        return true
      }
    }
    // If has pipes, likely a table even if column counts vary
    if (lines.length >= 2) {
      return true
    }
  }
  
  // 2. Has separator line and consistent column structure
  if (hasSeparator && columnCounts.length >= 2) {
    const firstCount = columnCounts[0]
    const consistent = columnCounts.slice(1).every(count => 
      Math.abs(count - firstCount) <= 2
    )
    if (consistent && firstCount >= 2) {
      return true
    }
  }
  
  // 3. Multiple lines with consistent column structure (no pipes, but multiple columns)
  if (!hasPipes && columnCounts.length >= 2 && hasTablePattern) {
    const firstCount = columnCounts[0]
    const consistent = columnCounts.slice(1, Math.min(5, columnCounts.length)).every(count => 
      Math.abs(count - firstCount) <= 2
    )
    if (consistent && firstCount >= 2 && lines.length >= 2) {
      return true
    }
  }
  
  // 4. Multiple lines with consistent column structure (strict)
  if (lines.length >= 2 && columnCounts.length >= 2 && 
      columnCounts.every(count => count >= 2) && hasTablePattern) {
    // Additional validation: check if it's not just a paragraph
    const allText = lines.join(' ')
    // Exclude if it looks like a paragraph with sentences
    if (!allText.match(/[。！？]/) || allText.split(/[。！？]/).length <= 3) {
      // Check column consistency
      const firstCount = columnCounts[0]
      const consistent = columnCounts.slice(1, Math.min(4, columnCounts.length)).every(count => 
        Math.abs(count - firstCount) <= 1
      )
      if (consistent) {
        return true
      }
    }
  }
  
  return false
}

