// @flow

/*::
import LineItemBlock from '../LineItemBlock'
*/

const { Enum } = require('enumify')

function firstFormat (lineItem) {
  if (lineItem.words.length === 0) {
    return null
  }
  return lineItem.words[0].format
}

function isPunctationCharacter (string) {
  if (string.length !== 1) {
    return false
  }
  return string[0] === '.' || string[0] === '!' || string[0] === '?'
}

function linesToText (lineItems, disableInlineFormats) {
  var text = ''
  var openFormat

  const closeFormat = () => {
    text += openFormat.endSymbol
    openFormat = null
  }

  lineItems.forEach((line, lineIndex) => {
    line.words.forEach((word, i) => {
      const wordType = word.type
      const wordFormat = word.format
      if (openFormat && (!wordFormat || wordFormat !== openFormat)) {
        closeFormat()
      }

      if (i > 0 && !(wordType && wordType.attachWithoutWhitespace) && !isPunctationCharacter(word.string)) {
        text += ' '
      }

      if (wordFormat && !openFormat && (!disableInlineFormats)) {
        openFormat = wordFormat
        text += openFormat.startSymbol
      }

      if (wordType && (!disableInlineFormats || wordType.plainTextFormat)) {
        text += wordType.toText(word.string)
      } else {
        text += word.string
      }
    })
    if (openFormat && (lineIndex === lineItems.length - 1 || firstFormat(lineItems[lineIndex + 1]) !== openFormat)) {
      closeFormat()
    }
    text += '\n'
  })
  return text
}

// An Markdown block
class BlockType extends Enum {

}

module.exports = BlockType

BlockType.initEnum({
  H1: {
    headline: true,
    headlineLevel: 1,
    toText (block /*: LineItemBlock */) /*: string */ {
      // Allow inline formats (bold/italic) in headers
      // Markdown allows: ### **Bold Title** and ### *Italic Title*
      return '# ' + linesToText(block.items, false)
    },
  },
  H2: {
    headline: true,
    headlineLevel: 2,
    toText (block /*: LineItemBlock */) /*: string */ {
      return '## ' + linesToText(block.items, false)
    },
  },
  H3: {
    headline: true,
    headlineLevel: 3,
    toText (block /*: LineItemBlock */) /*: string */ {
      return '### ' + linesToText(block.items, false)
    },
  },
  H4: {
    headline: true,
    headlineLevel: 4,
    toText (block /*: LineItemBlock */) /*: string */ {
      return '#### ' + linesToText(block.items, false)
    },
  },
  H5: {
    headline: true,
    headlineLevel: 5,
    toText (block /*: LineItemBlock */) /*: string */ {
      return '##### ' + linesToText(block.items, false)
    },
  },
  H6: {
    headline: true,
    headlineLevel: 6,
    toText (block /*: LineItemBlock */) /*: string */ {
      return '###### ' + linesToText(block.items, false)
    },
  },
  TOC: {
    mergeToBlock: true,
    toText (block /*: LineItemBlock */) /*: string */ {
      return linesToText(block.items, true)
    },
  },
  FOOTNOTES: {
    mergeToBlock: true,
    mergeFollowingNonTypedItems: true,
    toText (block /*: LineItemBlock */) /*: string */ {
      return linesToText(block.items, false)
    },
  },
  CODE: {
    mergeToBlock: true,
    toText (block /*: LineItemBlock */) /*: string */ {
      return '```\n' + linesToText(block.items, true) + '```'
    },
  },
  LIST: {
    mergeToBlock: false,
    mergeFollowingNonTypedItemsWithSmallDistance: true,
    toText (block /*: LineItemBlock */) /*: string */ {
      return linesToText(block.items, false)
    },
  },
  TABLE: {
    mergeToBlock: true,
    toText (block /*: LineItemBlock */) /*: string */ {
      // Convert table lines to markdown table format
      const lines = block.items.map(item => {
        if (!item.words || item.words.length === 0) {
          return ''
        }
        return item.words.map(w => w.string).join(' ')
      }).filter(line => line.trim().length > 0)
      
      if (lines.length === 0) {
        return ''
      }
      
      // Try to detect if it's already in markdown table format
      const hasPipes = lines.some(line => line.includes('|'))
      if (hasPipes) {
        // Already has pipes, just return as-is with proper formatting
        return lines.join('\n')
      }
      
      // Handle single-line table (common in PDFs)
      if (lines.length === 1) {
        const singleLine = lines[0]
        // Try to split by common patterns
        // Look for patterns like "名称 类型 是否支持 备注 标题 结构 ✅ 多级标题..."
        const words = singleLine.split(/\s+/).filter(w => w.trim().length > 0)
        
        // Try to detect column boundaries by looking for keywords or patterns
        // Common table pattern: header words followed by data
        const potentialColumns = []
        let currentColumn = []
        
        // Simple heuristic: group words that might be columns
        // Look for patterns like "名称", "类型", "是否支持", "备注" as headers
        const headerKeywords = ['名称', '类型', '支持', '备注', '标题', '公式', '表格', '列表', '模块', '覆盖']
        
        words.forEach((word, index) => {
          const isHeader = headerKeywords.some(kw => word.includes(kw))
          const isEmoji = /[✅⚠️❌]/u.test(word)
          const isShort = word.length <= 10
          
          // If we find a header keyword or emoji, it might be a column boundary
          if (isHeader && currentColumn.length > 0) {
            potentialColumns.push(currentColumn.join(' '))
            currentColumn = [word]
          } else if (isEmoji && currentColumn.length > 2) {
            // Emoji often marks end of a column
            currentColumn.push(word)
            potentialColumns.push(currentColumn.join(' '))
            currentColumn = []
          } else {
            currentColumn.push(word)
          }
        })
        
        if (currentColumn.length > 0) {
          potentialColumns.push(currentColumn.join(' '))
        }
        
        // If we found multiple potential columns, treat as table
        if (potentialColumns.length >= 2) {
          const maxCols = potentialColumns.length
          const tableLines = []
          const rowText = '| ' + potentialColumns.map(col => col.trim() || ' ').join(' | ') + ' |'
          tableLines.push(rowText)
          const separator = '| ' + Array(maxCols).fill('---').join(' | ') + ' |'
          tableLines.push(separator)
          return tableLines.join('\n')
        }
        
        // Fallback: try splitting by fixed patterns
        const parts = singleLine.split(/\s{2,}|\t|(名称|类型|支持|备注)/)
        const filteredParts = parts.filter(p => p && p.trim().length > 0 && !['名称', '类型', '支持', '备注'].includes(p.trim()))
        if (filteredParts.length >= 4) {
          const maxCols = Math.min(4, filteredParts.length)
          const tableLines = []
          const rowText = '| ' + filteredParts.slice(0, maxCols).map(col => col.trim() || ' ').join(' | ') + ' |'
          tableLines.push(rowText)
          const separator = '| ' + Array(maxCols).fill('---').join(' | ') + ' |'
          tableLines.push(separator)
          return tableLines.join('\n')
        }
      }
      
      // Convert to markdown table format (multi-line)
      // Split by multiple spaces or tabs to detect columns
      const rows = lines.map(line => {
        const columns = line.split(/\s{2,}|\t/).filter(col => col.trim().length > 0)
        if (columns.length === 0) {
          columns.push(line.trim())
        }
        return columns
      })
      
      if (rows.length === 0) {
        return ''
      }
      
      // Find max column count
      const maxCols = Math.max(...rows.map(row => row.length))
      
      // Normalize rows to have same column count
      const normalizedRows = rows.map(row => {
        while (row.length < maxCols) {
          row.push('')
        }
        return row.slice(0, maxCols)
      })
      
      // Generate markdown table
      const tableLines = []
      normalizedRows.forEach((row, index) => {
        const rowText = '| ' + row.map(col => col.trim() || ' ').join(' | ') + ' |'
        tableLines.push(rowText)
        
        // Add separator after first row
        if (index === 0 && normalizedRows.length > 1) {
          const separator = '| ' + Array(maxCols).fill('---').join(' | ') + ' |'
          tableLines.push(separator)
        }
      })
      
      return tableLines.join('\n')
    },
  },
  PARAGRAPH: {
    toText (block /*: LineItemBlock */) /*: string */ {
      return linesToText(block.items, false)
    },
  },
})

module.exports.isHeadline = function isHeadline (type /*: BlockType */) /*: boolean */ {
  return type && type.name.length === 2 && type.name[0] === 'H'
}

module.exports.blockToText = function blockToText (block /*: LineItemBlock */) /*: string */ {
  if (!block.type) {
    return linesToText(block.items, false)
  }
  return block.type.toText(block)
}

module.exports.headlineByLevel = function headlineByLevel (level) {
  if (level === 1) {
    return BlockType.H1
  } else if (level === 2) {
    return BlockType.H2
  } else if (level === 3) {
    return BlockType.H3
  } else if (level === 4) {
    return BlockType.H4
  } else if (level === 5) {
    return BlockType.H5
  } else if (level === 6) {
    return BlockType.H6
  } else {
    // if level is >= 6, just use BlockType H6
    // eslint-disable-next-line no-console
    console.warn('Unsupported headline level: ' + level + ' (supported are 1-6), defaulting to level 6')
    return BlockType.H6
  }
}
