const PageItem = require('./PageItem')

// An image item within a page
module.exports = class ImageItem extends PageItem {
  constructor (options) {
    super(options)
    this.x = options.x
    this.y = options.y
    this.width = options.width
    this.height = options.height
    this.imageData = options.imageData // Buffer or Uint8Array
    this.imageName = options.imageName // 图片名称，用于引用
    this.imageFormat = options.imageFormat // 'png', 'jpg', etc.
  }
}

