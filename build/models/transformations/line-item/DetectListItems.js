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
      
      // Re-insert image items
      const allItems = [...newItems, ...imageItems].sort((a, b) => {
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
      messages: [
        'Detected ' + foundListItems + ' plain list items.',
        'Detected ' + foundNumberedItems + ' numbered list items.',
      ],
    })
  }
}
