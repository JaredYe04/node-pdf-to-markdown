const Transformation = require('./Transformation')
const ParseResult = require('../ParseResult')
const ImageItem = require('../ImageItem')
const { blockToText } = require('../markdown/BlockType')

module.exports = class ToTextBlocks extends Transformation {
  constructor () {
    super('To Text Blocks', 'TextBlock')
  }

  transform (parseResult /*: ParseResult */) /*: ParseResult */ {
    parseResult.pages.forEach(page => {
      const textItems = []
      let imageCount = 0
      
      page.items.forEach(block => {
        // Keep ImageItems as-is - check multiple ways
        let isImage = false
        
        // Method 1: Check by constructor
        if (block instanceof ImageItem || (block.constructor && block.constructor.name === 'ImageItem')) {
          isImage = true
        }
        // Method 2: Check by properties
        else if (block && typeof block === 'object') {
          // imageData is the most reliable indicator
          if (block.imageData) {
            isImage = true
          }
          // Also check for imageName
          else if (block.imageName && typeof block.imageName === 'string') {
            isImage = true
          }
        }
        
        if (isImage) {
          imageCount++
          textItems.push(block)
        } else {
          // TODO category to type (before have no unknowns, have paragraph)
          const category = block.type ? block.type.name : 'Unknown'
          textItems.push({
            category: category,
            text: blockToText(block),
          })
        }
      })
      
      page.items = textItems
      
      // Debug: verify ImageItems are preserved
      const finalImageCount = textItems.filter(item => 
        item && typeof item === 'object' && (item.imageData || item.constructor?.name === 'ImageItem')
      ).length
      if (imageCount > 0 && finalImageCount !== imageCount) {
        console.warn(`ToTextBlocks: Page ${page.index + 1} - Lost ImageItems! Had ${imageCount}, now have ${finalImageCount}`)
      }
    })
    return new ParseResult({
      ...parseResult,
    })
  }
}
