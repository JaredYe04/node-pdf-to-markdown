// @flow

const ToLineItemTransformation = require('../ToLineItemTransformation')
const ParseResult = require('../../ParseResult')
const LineItem = require('../../LineItem')
const ImageItem = require('../../ImageItem')
const StashingStream = require('../../StashingStream')
const { REMOVED_ANNOTATION, ADDED_ANNOTATION } = require('../../Annotation')

// Converts vertical text to horizontal
module.exports = class VerticalToHorizontal extends ToLineItemTransformation {
  constructor () {
    super('Vertical to Horizontal Text')
  }

  transform (parseResult /*: ParseResult */) /*: ParseResult */ {
    var foundVerticals = 0
    parseResult.pages.forEach(page => {
      // Separate ImageItems and LineItems
      const imageItems = page.items.filter(item => 
        item instanceof ImageItem || (item.constructor && item.constructor.name === 'ImageItem') ||
        (item && typeof item === 'object' && item.imageData)
      )
      const lineItems = page.items.filter(item => 
        !(item instanceof ImageItem || (item.constructor && item.constructor.name === 'ImageItem') ||
          (item && typeof item === 'object' && item.imageData))
      )
      
      const stream = new VerticalsStream()
      stream.consumeAll(lineItems)
      const processedLineItems = stream.complete()
      foundVerticals += stream.foundVerticals
      
      // Re-insert image items with improved sorting
      const allItemsWithPos = []
      
      // Add processed line items with height info
      processedLineItems.forEach(item => {
        const itemY = item.y || 0
        const itemHeight = item.height || 0
        allItemsWithPos.push({
          item: item,
          y: itemY,
          topY: itemY,
          bottomY: itemY - itemHeight,
          height: itemHeight,
          x: item.x || 0
        })
      })
      
      // Add image items with height info
      imageItems.forEach(imageItem => {
        const imgCenterY = imageItem.y || 0
        const imgHeight = imageItem.height || 0
        allItemsWithPos.push({
          item: imageItem,
          y: imgCenterY,
          topY: imgCenterY + imgHeight / 2,
          bottomY: imgCenterY - imgHeight / 2,
          height: imgHeight,
          x: imageItem.x || 0
        })
      })
      
      // Improved sorting with overlap detection
      const allItems = allItemsWithPos.sort((a, b) => {
        const aY = a.y || 0
        const bY = b.y || 0
        const aX = a.x || 0
        const bX = b.x || 0
        
        // Check for vertical overlap
        const overlapTop = Math.min(a.topY, b.topY)
        const overlapBottom = Math.max(a.bottomY, b.bottomY)
        const verticalOverlap = overlapTop - overlapBottom
        
        const avgHeight = ((a.height || 0) + (b.height || 0)) / 2
        const overlapThreshold = avgHeight * 0.2
        
        if (verticalOverlap > overlapThreshold) {
          return aX - bX
        }
        
        const heightBasedThreshold = Math.min(a.height || 5, b.height || 5) * 0.1
        const separationThreshold = Math.max(heightBasedThreshold, 1)
        
        if (Math.abs(aY - bY) > separationThreshold) {
          return bY - aY
        }
        return aX - bX
      }).map(i => i.item)
      
      page.items = allItems
    })

    return new ParseResult({
      ...parseResult,
      messages: ['Converted ' + foundVerticals + ' verticals'],
    })
  }
}

class VerticalsStream extends StashingStream {
  constructor () {
    super()
    this.foundVerticals = 0
  }

  shouldStash (item) {
    return item.words.length === 1 && item.words[0].string.length === 1
  }

  doMatchesStash (lastItem, item) {
    return lastItem.y - item.y > 5 && lastItem.words[0].type === item.words[0].type
  }

  doFlushStash (stash, results) {
    if (stash.length > 5) { // unite
      var combinedWords = []
      var minX = 999
      var maxY = 0
      var sumWidth = 0
      var maxHeight = 0
      stash.forEach(oneCharacterLine => {
        oneCharacterLine.annotation = REMOVED_ANNOTATION
        results.push(oneCharacterLine)
        combinedWords.push(oneCharacterLine.words[0])
        minX = Math.min(minX, oneCharacterLine.x)
        maxY = Math.max(maxY, oneCharacterLine.y)
        sumWidth += oneCharacterLine.width
        maxHeight = Math.max(maxHeight, oneCharacterLine.height)
      })
      results.push(new LineItem({
        ...stash[0],
        x: minX,
        y: maxY,
        width: sumWidth,
        height: maxHeight,
        words: combinedWords,
        annotation: ADDED_ANNOTATION,
      }))
      this.foundVerticals++
    } else { // add as singles
      results.push(...stash)
    }
  }
}
