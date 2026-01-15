// @flow

const Transformation = require('./Transformation')
const ParseResult = require('../ParseResult')
const ImageItem = require('../ImageItem')
const fs = require('fs')
const path = require('path')

module.exports = class ToMarkdown extends Transformation {
  constructor (imageOptions = {}) {
    super('To Markdown', 'String')
    this.imageMode = imageOptions.imageMode || 'none'
    this.imageSavePath = imageOptions.imageSavePath || null
    this.pdfTitle = imageOptions.pdfTitle || 'pdf'
    this.imageCounter = 0
    this.images = new Map()
  }

  transform (parseResult /*: ParseResult */) /*: ParseResult */ {
    // Reset image counter for each document
    this.imageCounter = 0
    this.images = new Map()
    
    // Ensure image save directory exists if needed
    if (this.imageMode === 'save' && this.imageSavePath) {
      if (!fs.existsSync(this.imageSavePath)) {
        fs.mkdirSync(this.imageSavePath, { recursive: true })
      }
    }
    
    parseResult.pages.forEach(page => {
      var text = ''
      const pageItems = []
      let imageCount = 0
      let detectedImages = 0
      
      // Debug: check what items we have before processing
      const itemsWithImages = page.items.filter(item => {
        if (!item || typeof item !== 'object') return false
        // Check multiple ways
        return item instanceof ImageItem || 
               item.constructor?.name === 'ImageItem' ||
               item.imageData ||
               (item.imageName && typeof item.imageName === 'string')
      })
      if (itemsWithImages.length > 0) {
        detectedImages = itemsWithImages.length
        console.log(`ToMarkdown: Page ${page.index + 1} has ${detectedImages} ImageItems before processing`)
        // Debug: log first image item structure
        if (itemsWithImages.length > 0) {
          const firstImg = itemsWithImages[0]
          console.log(`  First ImageItem: constructor=${firstImg.constructor?.name}, has imageData=${!!firstImg.imageData}, has imageName=${!!firstImg.imageName}`)
        }
      }
      
      // Separate blocks and images
      page.items.forEach(item => {
        // Check if item is ImageItem - try multiple ways to detect it
        // First check by constructor name
        let isImage = item instanceof ImageItem || 
                     (item.constructor && item.constructor.name === 'ImageItem')
        
        // If not detected, check by properties
        if (!isImage && item && typeof item === 'object') {
          // Check for imageData property (most reliable indicator)
          if (item.imageData) {
            isImage = true
          }
          // Also check for imageName
          else if (item.imageName && typeof item.imageName === 'string') {
            isImage = true
          }
        }
        
        if (isImage) {
          imageCount++
          // Handle image item
          try {
            const imageMarkdown = this.processImage(item, page.index)
            if (imageMarkdown) {
              pageItems.push({ type: 'image', content: imageMarkdown })
            }
          } catch (err) {
            // Log error but continue
            // console.warn(`Failed to process image on page ${page.index + 1}:`, err.message)
          }
        } else {
          // Handle text block
          pageItems.push({ type: 'block', content: item })
        }
      })
      
      // Process items in order
      pageItems.forEach(item => {
        if (item.type === 'image') {
          text += item.content + '\n\n'
        } else {
          const block = item.content
          // Concatenate all words in the same block, unless it's a Table of Contents block
          let concatText
          if (block.category === 'TOC') {
            concatText = block.text
          } else {
            concatText = block.text.replace(/(\r\n|\n|\r)/gm, ' ')
          }

          // Concatenate words that were previously broken up by newline
          if (block.category !== 'LIST') {
            concatText = concatText.split('- ').join('')
          }

          // Assume there are no code blocks in our documents
          if (block.category === 'CODE') {
            concatText = concatText.split('`').join('')
          }

          text += concatText + '\n\n'
        }
      })

      page.items = [text]
      
      // Debug output (can be removed later)
      if (detectedImages > 0 && imageCount === 0) {
        // console.warn(`Page ${page.index + 1}: Detected ${detectedImages} ImageItems but processed ${imageCount}`)
      }
    })
    
    return new ParseResult({
      ...parseResult,
      images: this.images
    })
  }
  
  /**
   * Validate if image data is a valid PNG or JPEG format
   * @param {Buffer} imageData - Image data to validate
   * @param {string} expectedFormat - Expected format ('png' or 'jpg')
   * @returns {boolean} - True if valid, false otherwise
   */
  isValidImageFormat (imageData, expectedFormat) {
    if (!imageData || imageData.length < 4) {
      return false
    }
    
    // Check PNG magic number: 89 50 4E 47
    const isPNG = imageData[0] === 0x89 && 
                  imageData[1] === 0x50 && 
                  imageData[2] === 0x4E && 
                  imageData[3] === 0x47
    
    // Check JPEG magic number: FF D8
    const isJPEG = imageData[0] === 0xFF && imageData[1] === 0xD8
    
    if (expectedFormat === 'png') {
      return isPNG
    } else if (expectedFormat === 'jpg' || expectedFormat === 'jpeg') {
      return isJPEG
    }
    
    // If format not specified, accept either
    return isPNG || isJPEG
  }

  processImage (imageItem, pageIndex) {
    if (this.imageMode === 'none') {
      return null // Skip images
    }
    
    // Ensure imageItem has required properties
    if (!imageItem || !imageItem.imageData) {
      return null
    }
    
    this.imageCounter++
    const imageFormat = imageItem.imageFormat || 'png'
    const imageName = `${this.pdfTitle}_image${this.imageCounter}_p${pageIndex + 1}.${imageFormat}`
    
    try {
      // Convert imageData to Buffer and validate
      let imageData = imageItem.imageData
      if (Buffer.isBuffer(imageData)) {
        // Already a Buffer
      } else if (imageData instanceof Uint8Array) {
        imageData = Buffer.from(imageData)
      } else if (typeof imageData === 'string') {
        imageData = Buffer.from(imageData, 'base64')
      } else {
        return null
      }
      
      // Check if image data is valid (PNG or JPEG)
      const isPNG = imageData.length >= 4 && imageData[0] === 0x89 && imageData[1] === 0x50 && imageData[2] === 0x4E && imageData[3] === 0x47
      const isJPEG = imageData.length >= 2 && imageData[0] === 0xFF && imageData[1] === 0xD8
      
      if (!isPNG && !isJPEG) {
        // Invalid image format, skip this image
        return null
      }
      
      // Use detected format
      const detectedFormat = isPNG ? 'png' : 'jpg'
      const finalImageName = `${this.pdfTitle}_image${this.imageCounter}_p${pageIndex + 1}.${detectedFormat}`
      
      // Validate image format (optional check, we already validated above)
      if (!this.isValidImageFormat(imageData, detectedFormat)) {
        // This shouldn't happen, but just in case
        return null
      }
      
      if (this.imageMode === 'base64') {
        // Convert image to base64
        const base64 = imageData.toString('base64')
        const mimeType = detectedFormat === 'jpg' || detectedFormat === 'jpeg' ? 'image/jpeg' : 'image/png'
        return `![${finalImageName}](data:${mimeType};base64,${base64})`
      } else if (this.imageMode === 'relative') {
        // Store image in map and return relative reference
        // Make sure to create a copy of the buffer to avoid issues
        const imageBuffer = Buffer.from(imageData)
        this.images.set(finalImageName, imageBuffer)
        return `![${finalImageName}](./${finalImageName})`
      } else if (this.imageMode === 'save' && this.imageSavePath) {
        // Save image to disk
        const imagePath = path.join(this.imageSavePath, finalImageName)
        fs.writeFileSync(imagePath, imageData)
        // Return reference to saved image (use relative path from imageSavePath)
        const relativePath = finalImageName
        return `![${finalImageName}](${relativePath})`
      }
    } catch (err) {
      // Log error for debugging
      // console.warn(`Failed to process image: ${err.message}`)
      return null
    }
    
    return null
  }
}
