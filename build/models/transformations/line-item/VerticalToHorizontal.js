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
      
      // Re-insert image items
      const allItems = [...processedLineItems, ...imageItems].sort((a, b) => {
        const aY = (a && typeof a.y === 'number') ? a.y : 0
        const bY = (b && typeof b.y === 'number') ? b.y : 0
        const aX = (a && typeof a.x === 'number') ? a.x : 0
        const bX = (b && typeof b.x === 'number') ? b.x : 0
        
        if (Math.abs(aY - bY) > 5) {
          return bY - aY
        }
        return aX - bX
      })
      
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
