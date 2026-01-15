// @flow

const ToLineItemBlockTransformation = require('../ToLineItemBlockTransformation')
const ParseResult = require('../../ParseResult')
const LineItemBlock = require('../../LineItemBlock')
const ImageItem = require('../../ImageItem')
const { DETECTED_ANNOTATION } = require('../../Annotation')
const { minXFromPageItems } = require('../../../util/page-item-functions')

// Gathers lines to blocks
module.exports = class GatherBlocks extends ToLineItemBlockTransformation {
  constructor () {
    super('Gather Blocks')
  }

  transform (parseResult /*: ParseResult */) /*: ParseResult */ {
    const { mostUsedDistance } = parseResult.globals
    var createdBlocks = 0
    var lineItemCount = 0
    parseResult.pages.map(page => {
      // Separate LineItems and ImageItems
      const lineItems = page.items.filter(item => 
        !(item instanceof ImageItem || (item.constructor && item.constructor.name === 'ImageItem'))
      )
      const imageItems = page.items.filter(item => 
        item instanceof ImageItem || (item.constructor && item.constructor.name === 'ImageItem')
      )
      
      lineItemCount += lineItems.length
      const blocks = []
      var stashedBlock = new LineItemBlock({})
      const flushStashedItems = () => {
        if (stashedBlock.items.length > 1) {
          stashedBlock.annotation = DETECTED_ANNOTATION
        }

        blocks.push(stashedBlock)
        stashedBlock = new LineItemBlock({})
        createdBlocks++
      }

      var minX = minXFromPageItems(lineItems)
      lineItems.forEach(item => {
        if (stashedBlock.items.length > 0 && shouldFlushBlock(stashedBlock, item, minX, mostUsedDistance)) {
          flushStashedItems()
        }
        stashedBlock.addItem(item)
      })
      if (stashedBlock.items.length > 0) {
        flushStashedItems()
      }
      
      // Re-insert image items in their original positions
      // Sort all items (blocks + imageItems) by Y position
      const allItems = []
      
      // Create a combined array with position info
      const itemsWithPos = []
      
      // Add blocks with their position
      blocks.forEach(block => {
        if (block.items && block.items.length > 0) {
          itemsWithPos.push({
            item: block,
            y: block.items[0].y,
            x: block.items[0].x
          })
        }
      })
      
      // Add image items with their position
      imageItems.forEach(imageItem => {
        // Ensure imageItem has required properties
        if (imageItem && (imageItem.imageData || imageItem.constructor?.name === 'ImageItem')) {
          itemsWithPos.push({
            item: imageItem,
            y: imageItem.y || 0,
            x: imageItem.x || 0
          })
        }
      })
      
      // Sort by Y position (top to bottom), then by X (left to right)
      itemsWithPos.sort((a, b) => {
        if (Math.abs(a.y - b.y) > 5) {
          return b.y - a.y // Higher Y is higher on page
        }
        return a.x - b.x
      })
      
      // Extract items in sorted order
      page.items = itemsWithPos.map(i => i.item)
      
      // Debug: verify ImageItems are preserved
      const finalImageCount = page.items.filter(item => 
        item && typeof item === 'object' && (item.imageData || item.constructor?.name === 'ImageItem')
      ).length
      if (imageItems.length > 0 && finalImageCount !== imageItems.length) {
        console.warn(`GatherBlocks: Page ${page.index + 1} - Lost ImageItems! Had ${imageItems.length}, now have ${finalImageCount}`)
      }
    })

    return new ParseResult({
      ...parseResult,
      messages: ['Gathered ' + createdBlocks + ' blocks out of ' + lineItemCount + ' line items'],
    })
  }
}

function shouldFlushBlock (stashedBlock, item, minX, mostUsedDistance) {
  if (stashedBlock.type && stashedBlock.type.mergeFollowingNonTypedItems && !item.type) {
    return false
  }
  const lastItem = stashedBlock.items[stashedBlock.items.length - 1]
  const hasBigDistance = bigDistance(lastItem, item, minX, mostUsedDistance)
  if (stashedBlock.type && stashedBlock.type.mergeFollowingNonTypedItemsWithSmallDistance && !item.type && !hasBigDistance) {
    return false
  }
  if (item.type !== stashedBlock.type) {
    return true
  }
  if (item.type) {
    return !item.type.mergeToBlock
  } else {
    return hasBigDistance
  }
}

function bigDistance (lastItem, item, minX, mostUsedDistance) {
  const distance = lastItem.y - item.y
  if (distance < 0 - mostUsedDistance / 2) {
    // distance is negative - and not only a bit
    return true
  }
  var allowedDisctance = mostUsedDistance + 1
  if (lastItem.x > minX && item.x > minX) {
    // intended elements like lists often have greater spacing
    allowedDisctance = mostUsedDistance + mostUsedDistance / 2
  }
  if (distance > allowedDisctance) {
    return true
  }
  return false
}
