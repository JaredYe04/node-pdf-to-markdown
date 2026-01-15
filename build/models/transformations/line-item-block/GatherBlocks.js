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
      // Sort all items (blocks + imageItems) by Y position with improved accuracy
      const allItems = []
      
      // Create a combined array with position info including height for accurate sorting
      const itemsWithPos = []
      
      // Add blocks with their position and height range
      blocks.forEach(block => {
        if (block.items && block.items.length > 0) {
          // Calculate block's Y range (top to bottom in PDF coordinates)
          // In PDF: Y increases upward, so higher Y = higher on page
          // Text items typically use baseline Y, so:
          // - topY (highest point) = baseline Y + some offset
          // - bottomY (lowest point) = baseline Y - height
          let topY = block.items[0].y // Start with first item's Y (baseline)
          let bottomY = block.items[0].y
          let maxHeight = 0
          
          block.items.forEach(item => {
            const itemBaselineY = item.y
            const itemHeight = item.height || 0
            // In PDF coordinates: baseline Y is the reference
            // Top of text is approximately at baseline (or slightly above for some fonts)
            // Bottom of text is at baseline - height
            const itemTopY = itemBaselineY // Text top is near baseline
            const itemBottomY = itemBaselineY - itemHeight // Text bottom is below baseline
            
            topY = Math.max(topY, itemTopY) // Higher Y is higher on page
            bottomY = Math.min(bottomY, itemBottomY) // Lower Y is lower on page
            maxHeight = Math.max(maxHeight, itemHeight)
          })
          
          // Use center Y for sorting
          const centerY = (topY + bottomY) / 2
          itemsWithPos.push({
            item: block,
            y: centerY,
            topY: topY,
            bottomY: bottomY,
            height: maxHeight,
            x: block.items[0].x,
            isBlock: true
          })
        }
      })
      
      // Add image items with their position and height
      imageItems.forEach(imageItem => {
        // Ensure imageItem has required properties
        if (imageItem && (imageItem.imageData || imageItem.constructor?.name === 'ImageItem')) {
          const imgCenterY = imageItem.y || 0 // Already center Y from pdf.js
          const imgHeight = imageItem.height || 0
          // In PDF coordinates: center Y is reference
          // Top of image = center Y + height/2
          // Bottom of image = center Y - height/2
          const topY = imgCenterY + imgHeight / 2
          const bottomY = imgCenterY - imgHeight / 2
          
          itemsWithPos.push({
            item: imageItem,
            y: imgCenterY, // Center Y from pdf.js
            topY: topY,
            bottomY: bottomY,
            height: imgHeight,
            x: imageItem.x || 0,
            isBlock: false
          })
        }
      })
      
      // Improved sorting: consider height ranges and overlaps for accurate positioning
      itemsWithPos.sort((a, b) => {
        // Check if items overlap vertically (considering their heights)
        // In PDF coordinates: higher Y = higher on page
        const aTop = a.topY
        const aBottom = a.bottomY
        const bTop = b.topY
        const bBottom = b.bottomY
        
        // Calculate vertical overlap
        // Overlap exists if: min(top) > max(bottom)
        const overlapTop = Math.min(aTop, bTop)
        const overlapBottom = Math.max(aBottom, bBottom)
        const verticalOverlap = overlapTop - overlapBottom // Positive if overlapping
        
        // If items overlap significantly, maintain relative X order
        // Use 20% of average height as overlap threshold
        const avgHeight = ((a.height || 0) + (b.height || 0)) / 2
        const overlapThreshold = avgHeight * 0.2
        
        if (verticalOverlap > overlapThreshold) {
          // Items overlap vertically, sort by X position to maintain left-to-right order
          return a.x - b.x
        }
        
        // No significant overlap, sort by center Y position
        // Use dynamic threshold based on item heights for better accuracy
        const heightBasedThreshold = Math.min(a.height || 5, b.height || 5) * 0.1
        const separationThreshold = Math.max(heightBasedThreshold, 1) // At least 1 pixel
        
        if (Math.abs(a.y - b.y) > separationThreshold) {
          return b.y - a.y // Higher Y is higher on page (PDF coordinates)
        }
        
        // Very close Y positions (within threshold), sort by X
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
