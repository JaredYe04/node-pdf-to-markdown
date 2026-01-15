const TextItem = require('./TextItem')
const Word = require('./Word')
const WordType = require('./markdown/WordType')
const WordFormat = require('./markdown/WordFormat')
const LineItem = require('./LineItem')
const StashingStream = require('./StashingStream')
const ParsedElements = require('./ParsedElements')
const { isNumber, isListItemCharacter } = require('../util/string-functions')
const { sortByX } = require('../util/page-item-functions')

// Converts text items which have been grouped to a line (through TextItemLineGrouper) to a single LineItem doing inline transformations like
// 'whitespace removal', bold/emphasis annotation, link-detection, etc..
module.exports = class LineConverter {
  constructor (fontToFormats) {
    this.fontToFormats = fontToFormats
  }

  // returns a CombineResult
  compact (textItems /*: TextItem[] */) /*: LineItem */ {
    // Filter out invalid items
    const validItems = textItems.filter(item => item && typeof item === 'object' && typeof item.x === 'number')
    
    if (validItems.length === 0) {
      // Return a minimal LineItem if no valid items
      return new LineItem({
        x: 0,
        y: 0,
        height: 0,
        width: 0,
        words: [],
        parsedElements: new ParsedElements({
          footnoteLinks: [],
          footnotes: [],
          containLinks: false,
          formattedWords: 0,
        }),
      })
    }
    
    // we can't trust order of occurence, esp. footnoteLinks like to come last
    sortByX(validItems)

    const wordStream = new WordDetectionStream(this.fontToFormats)
    wordStream.consumeAll(validItems.map(item => new TextItem({ ...item })))
    const words = wordStream.complete()

    var maxHeight = 0
    var widthSum = 0
    validItems.forEach(item => {
      maxHeight = Math.max(maxHeight, item.height || 0)
      widthSum += (item.width || 0)
    })
    return new LineItem({
      x: validItems[0].x,
      y: validItems[0].y,
      height: maxHeight,
      width: widthSum,
      words: words,
      parsedElements: new ParsedElements({
        footnoteLinks: wordStream.footnoteLinks,
        footnotes: wordStream.footnotes,
        containLinks: wordStream.containLinks,
        formattedWords: wordStream.formattedWords,
      }),
    })
  }
}

class WordDetectionStream extends StashingStream {
  constructor (fontToFormats) {
    super()
    this.fontToFormats = fontToFormats
    this.footnoteLinks = []
    this.footnotes = []
    this.formattedWords = 0
    this.containLinks = false
    this.stashedNumber = false
  }

  shouldStash (item) { // eslint-disable-line no-unused-vars
    if (!this.firstY) {
      this.firstY = item.y
    }
    this.currentItem = item
    return true
  }

  onPushOnStash (item) { // eslint-disable-line no-unused-vars
    // Only process TextItems, skip ImageItems
    if (item && item.text && typeof item.text === 'string') {
      this.stashedNumber = isNumber(item.text.trim())
    } else {
      this.stashedNumber = false
    }
  }

  doMatchesStash (lastItem, item) {
    // Only process TextItems, skip ImageItems
    if (!item || !item.text || typeof item.text !== 'string') {
      return false
    }
    if (!lastItem || !lastItem.text || typeof lastItem.text !== 'string') {
      return false
    }
    const lastItemFormat = this.fontToFormats.get(lastItem.font)
    const itemFormat = this.fontToFormats.get(item.font)
    if (lastItemFormat !== itemFormat) {
      return false
    }
    const itemIsANumber = isNumber(item.text.trim())
    return this.stashedNumber === itemIsANumber
  }

  doFlushStash (stash, results) {
    // Filter out non-TextItems
    const textItems = stash.filter(item => item && item.text && typeof item.text === 'string')
    if (textItems.length === 0) {
      return
    }
    
    if (this.stashedNumber) {
      const joinedNumber = textItems.map(item => item.text)
        .join('')
        .trim()
      if (textItems[0].y > this.firstY) { // footnote link
        results.push(new Word({
          string: `${joinedNumber}`,
          type: WordType.FOOTNOTE_LINK,
        }))
        this.footnoteLinks.push(parseInt(joinedNumber))
      } else if (this.currentItem && this.currentItem.y < textItems[0].y) { // footnote
        results.push(new Word({
          string: `${joinedNumber}`,
          type: WordType.FOOTNOTE,
        }))
        this.footnotes.push(joinedNumber)
      } else {
        this.copyStashItemsAsText(textItems, results)
      }
    } else {
      this.copyStashItemsAsText(textItems, results)
    }
  }

  copyStashItemsAsText (stash, results) {
    // Filter out non-TextItems
    const textItems = stash.filter(item => item && item.text && typeof item.text === 'string')
    if (textItems.length === 0) {
      return
    }
    const format = this.fontToFormats.get(textItems[0].font)
    results.push(...this.itemsToWords(textItems, format))
  }

  itemsToWords (items, formatName) {
    const combinedText = combineText(items)
    const words = combinedText.split(' ')
    const format = formatName ? WordFormat.enumValueOf(formatName) : null
    return words.filter(w => w.trim().length > 0).map(word => {
      var type = null
      if (word.startsWith('http:')) {
        this.containLinks = true
        type = WordType.LINK
      } else if (word.startsWith('www.')) {
        this.containLinks = true
        word = `http://${word}`
        type = WordType.LINK
      }

      if (format) {
        this.formattedWords++
      }
      return new Word({ string: word, type, format })
    })
  }
}

function combineText (textItems) {
  var text = ''
  var lastItem
  textItems.forEach(textItem => {
    var textToAdd = textItem.text
    if (!text.endsWith(' ') && !textToAdd.startsWith(' ')) {
      if (lastItem) {
        const xDistance = textItem.x - lastItem.x - lastItem.width
        if (xDistance > 5) {
          text += ' '
        }
      } else {
        if (isListItemCharacter(textItem.text)) {
          textToAdd += ' '
        }
      }
    }
    text += textToAdd
    lastItem = textItem
  })
  return text
}
