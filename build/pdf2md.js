/** @format */

const { parse } = require('./util/pdf')
const { makeTransformations, transform } = require('./util/transformations')
if (typeof document === 'undefined') {
    require('./util/dom-stubs').setStubs(global)
}

/**
 * Reads a PDF document and converts it to Markdown
 * @param {string|TypedArray|DocumentInitParameters|PDFDataRangeTransport} pdfBuffer
 * Passed to `pdfjs.getDocument()` to read a PDF document for conversion
 *
 * @param {Object} [options]
 * Optional. Configuration options for the conversion
 * @param {Object} [options.callbacks]
 * Optional. A collection of callbacks to invoke when
 * elements within the PDF document are parsed
 * @param {Function} [options.callbacks.metadataParsed]
 * @param {Function} [options.callbacks.pageParsed]
 * @param {Function} [options.callbacks.fontParsed]
 * @param {Function} [options.callbacks.documentParsed]
 * @param {string} [options.imageMode='none']
 * Image processing mode: 'none' (default), 'base64', 'relative', 'save'
 * @param {string} [options.imageSavePath]
 * Path to save images (required when imageMode is 'save')
 * @param {string} [options.pdfTitle]
 * PDF title prefix for image names (used to prevent naming conflicts)
 *
 * @returns {Promise<Object>} Object containing:
 *   - markdown: string[] - The Markdown text, page array
 *   - images: Map<string, Buffer> - Map of image names to image buffers (only when imageMode is 'relative')
 */
async function pdf2md(pdfBuffer, options = {}) {
    // Support legacy callbacks parameter
    let callbacks = options
    let imageMode = 'none'
    let imageSavePath = null
    let pdfTitle = null
    
    if (options && typeof options === 'object' && !options.callbacks && (options.metadataParsed || options.pageParsed || options.fontParsed || options.documentParsed)) {
        // Legacy format: second parameter is callbacks
        callbacks = options
    } else if (options && typeof options === 'object') {
        // New format: options object
        callbacks = options.callbacks || {}
        imageMode = options.imageMode || 'none'
        imageSavePath = options.imageSavePath || null
        pdfTitle = options.pdfTitle || null
    }
    
    const result = await parse(pdfBuffer, callbacks)
    const { fonts, pages, metadata } = result
    
    // Extract PDF title from metadata if not provided
    if (!pdfTitle && metadata && metadata.info && metadata.info.Title) {
        pdfTitle = metadata.info.Title
            .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')
            .substring(0, 50)
    }
    if (!pdfTitle) {
        pdfTitle = 'pdf'
    }
    
    const transformations = makeTransformations(fonts.map, {
        imageMode,
        imageSavePath,
        pdfTitle
    })
    const parseResult = transform(pages, transformations)
    
    const markdown = parseResult.pages.map(page => page.items.join('\n'))
    const images = parseResult.images || new Map()
    
    if (imageMode === 'relative') {
        return {
            markdown,
            images
        }
    }
    
    return markdown
}

module.exports = pdf2md
