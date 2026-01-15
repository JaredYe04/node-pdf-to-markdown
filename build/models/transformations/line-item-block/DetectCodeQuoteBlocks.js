// @flow

const ToLineItemBlockTransformation = require('../ToLineItemBlockTransformation')
const ParseResult = require('../../ParseResult')
const ImageItem = require('../../ImageItem')
const { DETECTED_ANNOTATION } = require('../../Annotation')
const BlockType = require('../../markdown/BlockType')
const { minXFromBlocks } = require('../../../util/page-item-functions')

// Detect items which are code/quote blocks
module.exports = class DetectCodeQuoteBlocks extends ToLineItemBlockTransformation {
  constructor () {
    super('$1')
  }

  transform (parseResult /*: ParseResult */) /*: ParseResult */ {
    const { mostUsedHeight } = parseResult.globals
    var foundCodeItems = 0
    parseResult.pages.forEach(page => {
      // Filter out ImageItems - only process LineItemBlocks
      const blocks = page.items.filter(item => 
        !(item instanceof ImageItem || (item.constructor && item.constructor.name === 'ImageItem') ||
          (item && typeof item === 'object' && item.imageData))
      )
      
      var minX = minXFromBlocks(blocks)
      blocks.forEach(block => {
        if (!block.type && block.items && looksLikeCodeBlock(minX, block.items, mostUsedHeight)) {
          block.annotation = DETECTED_ANNOTATION
          block.type = BlockType.CODE
          foundCodeItems++
        }
      })
    })

    return new ParseResult({
      ...parseResult,
      messages: [
        'Detected ' + foundCodeItems + ' code/quote items.',
      ],
    })
  }
}

function looksLikeCodeBlock (minX, items, mostUsedHeight) {
  if (items.length === 0) {
    return false
  }
  if (items.length === 1) {
    return items[0].x > minX && items[0].height <= mostUsedHeight + 1
  }
  for (var item of items) {
    if (item.x === minX) {
      return false
    }
  }
  return true
}
