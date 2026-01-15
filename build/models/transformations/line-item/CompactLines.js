// @flow

const ToLineItemTransformation = require('../ToLineItemTransformation')
const ParseResult = require('../../ParseResult')
const LineItem = require('../../LineItem')
const ImageItem = require('../../ImageItem')
const TextItemLineGrouper = require('../../TextItemLineGrouper')
const LineConverter = require('../../LineConverter')
const BlockType = require('../../markdown/BlockType')
const { REMOVED_ANNOTATION, ADDED_ANNOTATION } = require('../../Annotation')

// gathers text items on the same y line to one line item
module.exports = class CompactLines extends ToLineItemTransformation {
  constructor () {
    super('Compact To Lines')
  }

  transform (parseResult /*: ParseResult */) /*: ParseResult */ {
    const { mostUsedDistance, fontToFormats } = parseResult.globals
    const foundFootnotes = []
    const foundFootnoteLinks = []
    var linkCount = 0
    var formattedWords = 0

    const lineGrouper = new TextItemLineGrouper({
      mostUsedDistance: mostUsedDistance,
    })
    const lineCompactor = new LineConverter(fontToFormats)

    parseResult.pages.forEach(page => {
      if (page.items.length > 0) {
        const lineItems = []
        // Separate TextItems and ImageItems
        const textItems = page.items.filter(item => 
          !(item instanceof ImageItem || (item.constructor && item.constructor.name === 'ImageItem'))
        )
        const imageItems = page.items.filter(item => 
          item instanceof ImageItem || (item.constructor && item.constructor.name === 'ImageItem')
        )
        
        const textItemsGroupedByLine = lineGrouper.group(textItems)
        textItemsGroupedByLine.forEach(lineTextItems => {
          const lineItem = lineCompactor.compact(lineTextItems)
          if (lineTextItems.length > 1) {
            lineItem.annotation = ADDED_ANNOTATION
            lineTextItems.forEach(item => {
              item.annotation = REMOVED_ANNOTATION
              lineItems.push(new LineItem({
                ...item,
              }))
            })
          }
          if (lineItem.words.length === 0) {
            lineItem.annotation = REMOVED_ANNOTATION
          }
          lineItems.push(lineItem)

          if (lineItem.parsedElements.formattedWords) {
            formattedWords += lineItem.parsedElements.formattedWords
          }
          if (lineItem.parsedElements.containLinks > 0) {
            linkCount++
          }
          if (lineItem.parsedElements.footnoteLinks.length > 0) {
            const footnoteLinks = lineItem.parsedElements.footnoteLinks.map(footnoteLink => ({ footnoteLink, page: page.index + 1 }))
            foundFootnoteLinks.push.apply(foundFootnoteLinks, footnoteLinks)
          }
          if (lineItem.parsedElements.footnotes.length > 0) {
            lineItem.type = BlockType.FOOTNOTES
            const footnotes = lineItem.parsedElements.footnotes.map(footnote => ({ footnote, page: page.index + 1 }))
            foundFootnotes.push.apply(foundFootnotes, footnotes)
          }
        })
        
        // Re-insert image items in their original positions
        // Sort all items (lineItems + imageItems) by Y position with improved accuracy
        const allItems = []
        
        // Create array with position info including height for accurate sorting
        const itemsWithPos = []
        
        // Add line items with height information
        lineItems.forEach(item => {
          const itemY = item.y || 0
          const itemHeight = item.height || 0
          // LineItem Y is typically baseline Y, calculate top and bottom
          const topY = itemY // Text top is near baseline
          const bottomY = itemY - itemHeight // Text bottom is below baseline
          
          itemsWithPos.push({
            item: item,
            y: itemY,
            topY: topY,
            bottomY: bottomY,
            height: itemHeight,
            x: item.x || 0,
            isImage: false
          })
        })
        
        // Add image items with height information
        imageItems.forEach(imageItem => {
          const imgCenterY = imageItem.y || 0 // Already center Y from pdf.js
          const imgHeight = imageItem.height || 0
          // Image Y is center Y, calculate top and bottom
          const topY = imgCenterY + imgHeight / 2
          const bottomY = imgCenterY - imgHeight / 2
          
          itemsWithPos.push({
            item: imageItem,
            y: imgCenterY,
            topY: topY,
            bottomY: bottomY,
            height: imgHeight,
            x: imageItem.x || 0,
            isImage: true
          })
        })
        
        // Improved sorting: consider height ranges and overlaps
        itemsWithPos.sort((a, b) => {
          const aY = (a && typeof a.y === 'number') ? a.y : 0
          const bY = (b && typeof b.y === 'number') ? b.y : 0
          const aX = (a && typeof a.x === 'number') ? a.x : 0
          const bX = (b && typeof b.x === 'number') ? b.x : 0
          
          // Check for vertical overlap
          const overlapTop = Math.min(a.topY, b.topY)
          const overlapBottom = Math.max(a.bottomY, b.bottomY)
          const verticalOverlap = overlapTop - overlapBottom
          
          // Use dynamic threshold based on item heights
          const avgHeight = ((a.height || 0) + (b.height || 0)) / 2
          const overlapThreshold = avgHeight * 0.2
          
          if (verticalOverlap > overlapThreshold) {
            // Items overlap, sort by X
            return aX - bX
          }
          
          // No significant overlap, sort by Y with dynamic threshold
          const heightBasedThreshold = Math.min(a.height || 5, b.height || 5) * 0.1
          const separationThreshold = Math.max(heightBasedThreshold, 1)
          
          if (Math.abs(aY - bY) > separationThreshold) {
            return bY - aY // Higher Y value is higher on page
          }
          return aX - bX
        })
        
        // Extract items in sorted order
        page.items = itemsWithPos.map(i => i.item)
        
        // Debug: verify ImageItems are preserved
        const finalImageCount = page.items.filter(item => 
          item && typeof item === 'object' && (item.imageData || item.constructor?.name === 'ImageItem')
        ).length
        if (imageItems.length > 0 && finalImageCount !== imageItems.length) {
          console.warn(`CompactLines: Page ${page.index + 1} - Lost ImageItems! Had ${imageItems.length}, now have ${finalImageCount}`)
        }
      }
    })

    return new ParseResult({
      ...parseResult,
      messages: [
        'Detected ' + formattedWords + ' formatted words',
        'Found ' + linkCount + ' links',
        'Detected ' + foundFootnoteLinks.length + ' footnotes links',
        'Detected ' + foundFootnotes.length + ' footnotes',
      ],
    })
  }
}
