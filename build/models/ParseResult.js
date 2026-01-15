// The result of a PDF parse respectively a Transformation
module.exports = class ParseResult {
  constructor (options) {
    this.pages = options.pages // like Page[]
    this.globals = options.globals // properties accasable for all the following transformations in debug mode
    this.messages = options.messages // something to show only for the transformation in debug mode
    this.images = options.images || null // Map<string, Buffer> of images (for relative image mode)
  }
}
