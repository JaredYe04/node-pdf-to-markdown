// @flow

const ToLineItemTransformation = require('../ToLineItemTransformation')
const ParseResult = require('../../ParseResult')
const ImageItem = require('../../ImageItem')
const LineItem = require('../../LineItem')
const Word = require('../../Word')
const { REMOVED_ANNOTATION, ADDED_ANNOTATION, DETECTED_ANNOTATION } = require('../../Annotation')
const BlockType = require('../../markdown/BlockType')
const { isListItemCharacter, isNumberedListItem } = require('../../../util/string-functions')

// Detect items starting with -, •, etc...
module.exports = class DetectListItems extends ToLineItemTransformation {
  constructor () {
    super('Detect List Items')
  }

  transform (parseResult /*: ParseResult */) /*: ParseResult */ {
    var foundListItems = 0
    var foundNumberedItems = 0
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
      
      const newItems = []
      lineItems.forEach(item => {
        newItems.push(item)
        if (!item.type) {
          var text = item.text()
          if (item.words && item.words.length > 0 && isListItemCharacter(item.words[0].string)) {
            foundListItems++
            if (item.words[0].string === '-') {
              item.annotation = DETECTED_ANNOTATION
              item.type = BlockType.LIST
            } else {
              item.annotation = REMOVED_ANNOTATION
              const newWords = item.words.map(word => new Word({
                ...word,
              }))
              newWords[0].string = '-'
              newItems.push(new LineItem({
                ...item,
                words: newWords,
                annotation: ADDED_ANNOTATION,
                type: BlockType.LIST,
              }))
            }
          } else if (isNumberedListItem(text)) { // TODO check that starts with 1 (kala chakra)
            foundNumberedItems++
            item.annotation = DETECTED_ANNOTATION
            item.type = BlockType.LIST
          }
        }
      })
      
      // Re-insert image items with improved sorting
      const allItemsWithPos = []
      
      // Add new line items with height info
      newItems.forEach(item => {
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
      messages: [
        'Detected ' + foundListItems + ' plain list items.',
        'Detected ' + foundNumberedItems + ' numbered list items.',
      ],
    })
  }
}
