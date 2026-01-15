const path = require('path')
const pdfjs = require('pdfjs-dist')
pdfjs.GlobalWorkerOptions.workerSrc = `pdfjs-dist/legacy/build/pdf.worker`

const { findPageNumbers, findFirstPage, removePageNumber } = require('./page-number-functions')
const TextItem = require('../models/TextItem')
const ImageItem = require('../models/ImageItem')
const Page = require('../models/Page')
const { encodePNG } = require('./png-encoder')

const NO_OP = () => {}

/**
 * Normalize Unicode text using NFKC (Normalization Form Compatibility Composition).
 * 
 * This handles compatibility characters that appear in PDFs, such as:
 * - CJK Compatibility Ideographs (⼊ → 入, ⼤ → 大)
 * - Full-width characters → Half-width
 * - Compatibility equivalent characters → Standard characters
 * 
 * ⚠️ CRITICAL: This must be done at the earliest stage (PDF parsing)
 * to prevent contamination of all subsequent statistics (font usage, width, tokenization).
 * 
 * @param {string} str - Raw text from PDF
 * @returns {string} - Normalized text
 */
function normalizeText(str) {
    if (typeof str !== 'string') {
        return str
    }
    // NFKC: Normalization Form Compatibility Composition
    // - Handles compatibility characters (⼊ → 入, ⼤ → 大)
    // - Converts full-width to half-width
    // - Standardizes equivalent characters
    return str.normalize('NFKC')
}

/**
 * Parses the PDF document contained in the provided buffer and invokes callback functions during the parsing process.
 *
 * @param {Buffer} buffer The buffer containing the PDF document to be parsed. This should be a Buffer type, which represents binary data in memory.
 * @param {Object} [callbacks] An object containing callback functions that are called at various stages of the parsing process. Each callback is optional.
 * @param {Function} [callbacks.metadataParsed] Called when the metadata of the PDF has been parsed. The function should accept a single parameter: an object representing the parsed metadata.
 * @param {Function} [callbacks.pageParsed] Called when a page of the PDF has been parsed. The function should accept a single parameter: an array of objects representing the parsed pages.
 * @param {Function} [callbacks.fontParsed] Called when a font used in the PDF has been parsed. The function should accept a single parameter: an object representing the parsed font.
 * @param {Function} [callbacks.documentParsed] Called when the entire document has been parsed. The function should accept two parameters: the first is an object representing the parsed document, and the second is an array of objects representing all parsed pages.
 * @returns {Promise<void>} A promise that resolves when the parsing process is complete.
 */
exports.parse = async function parse(buffer, callbacks) {
    const { metadataParsed, pageParsed, fontParsed, documentParsed } = {
        metadataParsed: NO_OP,
        pageParsed: NO_OP,
        fontParsed: NO_OP,
        documentParsed: NO_OP,
        ...(callbacks || {})
    }
    const fontDataPath = path.join(path.resolve(require.resolve('pdfjs-dist'), '../../standard_fonts'), '/')
    const pdfDocument = await pdfjs.getDocument({
        data: new Uint8Array(buffer),
        standardFontDataUrl: fontDataPath
    }).promise
    const metadata = await pdfDocument.getMetadata()
    metadataParsed(metadata)

    const pages = [...Array(pdfDocument.numPages).keys()].map(index => new Page({ index }))

    documentParsed(pdfDocument, pages)

    const fonts = {
        ids: new Set(),
        map: new Map()
    }

    let pageIndexNumMap = {}
    let firstPage
    for (let j = 1; j <= pdfDocument.numPages; j++) {
        const page = await pdfDocument.getPage(j)
        const textContent = await page.getTextContent()

        if (Object.keys(pageIndexNumMap).length < 10) {
            pageIndexNumMap = findPageNumbers(pageIndexNumMap, page.pageNumber - 1, textContent.items)
        } else {
            firstPage = findFirstPage(pageIndexNumMap)
            break
        }
    }

    let pageNum = firstPage ? firstPage.pageNum : 0
    let imageCounter = 0
    for (let j = 1; j <= pdfDocument.numPages; j++) {
        const page = await pdfDocument.getPage(j)

        // Trigger the font retrieval for the page
        const operatorList = await page.getOperatorList()

        const scale = 1.0
        const viewport = page.getViewport({ scale })
        let textContent = await page.getTextContent()
        if (firstPage && page.pageIndex >= firstPage.pageIndex) {
            textContent = removePageNumber(textContent, pageNum)
            pageNum++
        }
        const textItems = textContent.items.map(item => {
            const tx = pdfjs.Util.transform(viewport.transform, item.transform)

            const fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3])
            const dividedHeight = item.height / fontHeight
            return new TextItem({
                x: Math.round(item.transform[4]),
                y: Math.round(item.transform[5]),
                width: Math.round(item.width),
                height: Math.round(dividedHeight <= 1 ? item.height : dividedHeight),
                text: normalizeText(item.str), // ★ Unicode normalization at earliest stage
                font: item.fontName
            })
        })

        // Extract images from the page
        const imageItems = []
        const processedImages = new Set()
        
        try {
            // Track transform matrices through the operator list
            let currentTransform = [1, 0, 0, 1, 0, 0]
            const transformStack = [currentTransform]
            let imageOpCount = 0
            
            for (let i = 0; i < operatorList.fnArray.length; i++) {
                const op = operatorList.fnArray[i]
                const args = operatorList.argsArray[i]
                
                // Track transform matrices
                if (op === pdfjs.OPS.transform || op === pdfjs.OPS.concat) {
                    if (args && Array.isArray(args) && args.length === 6) {
                        const [a1, b1, c1, d1, e1, f1] = currentTransform
                        const [a2, b2, c2, d2, e2, f2] = args
                        currentTransform = [
                            a1 * a2 + b1 * c2,
                            a1 * b2 + b1 * d2,
                            c1 * a2 + d1 * c2,
                            c1 * b2 + d1 * d2,
                            e1 + a1 * e2 + b1 * f2,
                            f1 + c1 * e2 + d1 * f2
                        ]
                        transformStack.push([...currentTransform])
                    }
                } else if (op === pdfjs.OPS.restoreState) {
                    if (transformStack.length > 1) {
                        transformStack.pop()
                        currentTransform = transformStack[transformStack.length - 1]
                    }
                } else if (op === pdfjs.OPS.save) {
                    transformStack.push([...currentTransform])
                }
                
                // Check for image operations
                const isImageOp = op === pdfjs.OPS.paintImageXObject || 
                                 op === pdfjs.OPS.paintJpegXObject || 
                                 op === pdfjs.OPS.paintInlineImageXObject
                
                if (isImageOp) {
                    imageOpCount++
                    const imageName = args && (Array.isArray(args) ? args[0] : args)
                    
                    if (imageName && !processedImages.has(imageName)) {
                        processedImages.add(imageName)
                        try {
                            let imageObj = null
                            
                            // For inline images, args[0] is the image object itself
                            if (op === pdfjs.OPS.paintInlineImageXObject) {
                                imageObj = args && (Array.isArray(args) ? args[0] : args)
                            } else {
                                // For XObject images, try multiple methods to get the image object
                                try {
                                    // Method 1: Try page.objs.get with imageName directly
                                    if (page.objs && typeof page.objs.get === 'function') {
                                        try {
                                            imageObj = await new Promise((resolve, reject) => {
                                                const timeout = setTimeout(() => reject(new Error('Timeout')), 10000)
                                                page.objs.get(imageName, (obj) => {
                                                    clearTimeout(timeout)
                                                    if (obj) {
                                                        resolve(obj)
                                                    } else {
                                                        reject(new Error('Failed to get image from objs'))
                                                    }
                                                })
                                            })
                                        } catch (e) {
                                            // Continue to next method
                                        }
                                    }
                                    
                                    // Method 2: Try to get XObject reference from operatorList resources
                                    if (!imageObj && operatorList.resources && operatorList.resources.XObject) {
                                        try {
                                            const xObjectDict = operatorList.resources.XObject
                                            if (xObjectDict && xObjectDict.get) {
                                                const xObjectRef = xObjectDict.get(imageName)
                                                if (xObjectRef && page.objs && typeof page.objs.get === 'function') {
                                                    imageObj = await new Promise((resolve, reject) => {
                                                        const timeout = setTimeout(() => reject(new Error('Timeout')), 10000)
                                                        page.objs.get(xObjectRef, (obj) => {
                                                            clearTimeout(timeout)
                                                            if (obj) {
                                                                resolve(obj)
                                                            } else {
                                                                reject(new Error('Failed to get image from objs with ref'))
                                                            }
                                                        })
                                                    })
                                                }
                                            }
                                        } catch (e) {
                                            // Ignore
                                        }
                                    }
                                    
                                    // Method 3: Try commonObjs as fallback
                                    if (!imageObj) {
                                        const transport = pdfDocument.transport || pdfDocument._transport // eslint-disable-line no-underscore-dangle
                                        if (transport && transport.commonObjs && typeof transport.commonObjs.get === 'function') {
                                            try {
                                                imageObj = await new Promise((resolve, reject) => {
                                                    const timeout = setTimeout(() => reject(new Error('Timeout')), 10000)
                                                    transport.commonObjs.get(imageName, (obj) => {
                                                        clearTimeout(timeout)
                                                        if (obj) {
                                                            resolve(obj)
                                                        } else {
                                                            reject(new Error('Failed to get image from commonObjs'))
                                                        }
                                                    })
                                                })
                                            } catch (e) {
                                                // Ignore
                                            }
                                        }
                                    }
                                } catch (e) {
                                    // Ignore and try next method
                                }
                            }
                            
                            if (imageObj) {
                                // Also try to get the raw XObject stream for JPEG images
                                // This is important for extracting actual JPEG data from PDF
                                let xObjectStream = null
                                if (op === pdfjs.OPS.paintJpegXObject || op === pdfjs.OPS.paintImageXObject) {
                                    try {
                                        // Try to get stream from imageObj first
                                        if (imageObj.stream) {
                                            xObjectStream = imageObj.stream
                                        } else if (imageObj.dict) {
                                            // Try to get stream from dict
                                            try {
                                                const stream = await imageObj.dict.get('Stream')
                                                if (stream) {
                                                    xObjectStream = stream
                                                }
                                            } catch (e) {
                                                // Ignore
                                            }
                                        }
                                        
                                        // If still not found, try to get from resources
                                        if (!xObjectStream) {
                                            const resources = await page.getResources()
                                            if (resources && resources.XObject) {
                                                const xObjectDict = resources.XObject
                                                if (xObjectDict && xObjectDict.get) {
                                                    const xObjectRef = await xObjectDict.get(imageName)
                                                    if (xObjectRef) {
                                                        // Get the XObject object
                                                        const xObject = await new Promise((resolve, reject) => {
                                                            const timeout = setTimeout(() => reject(new Error('Timeout')), 10000)
                                                            page.objs.get(xObjectRef, (obj) => {
                                                                clearTimeout(timeout)
                                                                if (obj) {
                                                                    resolve(obj)
                                                                } else {
                                                                    reject(new Error('Failed to get XObject'))
                                                                }
                                                            })
                                                        })
                                                        
                                                        // Try to get the stream from XObject
                                                        if (xObject && xObject.stream) {
                                                            xObjectStream = xObject.stream
                                                        } else if (xObject && xObject.dict) {
                                                            // Try to get stream from dict
                                                            try {
                                                                const stream = await xObject.dict.get('Stream')
                                                                if (stream) {
                                                                    xObjectStream = stream
                                                                }
                                                            } catch (e) {
                                                                // Ignore
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    } catch (e) {
                                        // Ignore
                                    }
                                }
                                // Try multiple methods to get image data
                                let imageData = null
                                let imageFormat = 'png'
                                
                                try {
                                    // Method 1: Try to get raw JPEG/PNG data from XObject stream
                                    // This is the most reliable method for JPEG images embedded in PDF
                                    if (xObjectStream && typeof xObjectStream.getBytes === 'function') {
                                        try {
                                            const bytes = await xObjectStream.getBytes()
                                            if (bytes && bytes.length > 0) {
                                                const buf = Buffer.from(bytes)
                                                // Check if it's a valid image format
                                                if (buf[0] === 0xFF && buf[1] === 0xD8) {
                                                    // JPEG
                                                    imageData = buf
                                                    imageFormat = 'jpg'
                                                } else if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
                                                    // PNG
                                                    imageData = buf
                                                    imageFormat = 'png'
                                                }
                                            }
                                        } catch (e) {
                                            // Ignore
                                        }
                                    }
                                    
                                    // Method 2: For JPEG XObjects, try to get the raw JPEG stream from imageObj
                                    if (!imageData && op === pdfjs.OPS.paintJpegXObject && imageObj.stream) {
                                        try {
                                            const stream = imageObj.stream
                                            if (typeof stream.getBytes === 'function') {
                                                const bytes = await stream.getBytes()
                                                if (bytes && bytes.length > 0) {
                                                    const buf = Buffer.from(bytes)
                                                    // Verify it's JPEG
                                                    if (buf[0] === 0xFF && buf[1] === 0xD8) {
                                                        imageData = buf
                                                        imageFormat = 'jpg'
                                                    }
                                                }
                                            }
                                        } catch (e) {
                                            // Ignore
                                        }
                                    }
                                    
                                    // Method 3: Try to get from XObject's underlying stream/dict
                                    if (!imageData && imageObj.dict) {
                                        try {
                                            const dict = imageObj.dict
                                            // Try to get the stream from the dictionary
                                            if (dict.get) {
                                                const stream = await dict.get('Stream')
                                                if (stream && typeof stream.getBytes === 'function') {
                                                    const bytes = await stream.getBytes()
                                                    if (bytes && bytes.length > 0) {
                                                        const buf = Buffer.from(bytes)
                                                        if (buf[0] === 0xFF && buf[1] === 0xD8) {
                                                            imageData = buf
                                                            imageFormat = 'jpg'
                                                        } else if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
                                                            imageData = buf
                                                            imageFormat = 'png'
                                                        }
                                                    }
                                                }
                                            }
                                        } catch (e) {
                                            // Ignore
                                        }
                                    }
                                    
                                    // Method 3: Try getBytes method (for images that expose raw bytes)
                                    if (!imageData && typeof imageObj.getBytes === 'function') {
                                        try {
                                            const bytes = await imageObj.getBytes()
                                            if (bytes && bytes.length > 0) {
                                                const buf = Buffer.from(bytes)
                                                // Check if it's a valid image format
                                                if (buf[0] === 0xFF && buf[1] === 0xD8) {
                                                    imageData = buf
                                                    imageFormat = 'jpg'
                                                } else if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
                                                    imageData = buf
                                                    imageFormat = 'png'
                                                }
                                            }
                                        } catch (e) {
                                            // Ignore
                                        }
                                    }
                                    
                                    // Method 4: For inline images, data might be in the args
                                    if (!imageData && op === pdfjs.OPS.paintInlineImageXObject) {
                                        // Inline images have the data directly in the args
                                        if (imageObj.data && imageObj.data.length > 0) {
                                            const buf = Buffer.from(imageObj.data)
                                            if (buf.length > 0) {
                                                if (buf[0] === 0xFF && buf[1] === 0xD8) {
                                                    imageData = buf
                                                    imageFormat = 'jpg'
                                                } else if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
                                                    imageData = buf
                                                    imageFormat = 'png'
                                                }
                                            }
                                        }
                                    }
                                    
                                    // Method 5: Try to get from imageObj.image (nested structure)
                                    if (!imageData && imageObj.image) {
                                        const img = imageObj.image
                                        // Try stream first
                                        if (img.stream && typeof img.stream.getBytes === 'function') {
                                            try {
                                                const bytes = await img.stream.getBytes()
                                                if (bytes && bytes.length > 0) {
                                                    const buf = Buffer.from(bytes)
                                                    if (buf[0] === 0xFF && buf[1] === 0xD8) {
                                                        imageData = buf
                                                        imageFormat = 'jpg'
                                                    } else if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
                                                        imageData = buf
                                                        imageFormat = 'png'
                                                    }
                                                }
                                            } catch (e) {
                                                // Ignore
                                            }
                                        }
                                        // Try getBytes
                                        if (!imageData && typeof img.getBytes === 'function') {
                                            try {
                                                const bytes = await img.getBytes()
                                                if (bytes && bytes.length > 0) {
                                                    const buf = Buffer.from(bytes)
                                                    if (buf[0] === 0xFF && buf[1] === 0xD8) {
                                                        imageData = buf
                                                        imageFormat = 'jpg'
                                                    } else if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
                                                        imageData = buf
                                                        imageFormat = 'png'
                                                    }
                                                }
                                            } catch (e) {
                                                // Ignore
                                            }
                                        }
                                    }
                                    
                                    // Method 6: Last resort - try imageObj.data but verify it's valid
                                    // Only use this if data looks like a valid image format
                                    if (!imageData && imageObj.data) {
                                        const data = imageObj.data
                                        let buf = null
                                        
                                        if (Buffer.isBuffer(data)) {
                                            buf = data
                                        } else if (data instanceof Uint8Array) {
                                            buf = Buffer.from(data)
                                        }
                                        
                                        if (buf && buf.length > 4) {
                                            // Check magic numbers to verify it's a valid image format
                                            if (buf[0] === 0xFF && buf[1] === 0xD8) {
                                                // JPEG
                                                imageData = buf
                                                imageFormat = 'jpg'
                                            } else if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
                                                // PNG
                                                imageData = buf
                                                imageFormat = 'png'
                                            }
                                            // Don't use data if it doesn't have valid magic numbers
                                            // (it's likely raw pixel data, not encoded image)
                                        }
                                    }
                                } catch (e) {
                                    // Continue to next method
                                }
                                
                                // Only proceed if we have valid image data with correct format
                                if (imageData && imageData.length > 0) {
                                    // Verify the format one more time
                                    const isValidFormat = (imageFormat === 'jpg' && imageData[0] === 0xFF && imageData[1] === 0xD8) ||
                                                         (imageFormat === 'png' && imageData[0] === 0x89 && imageData[1] === 0x50 && imageData[2] === 0x4E && imageData[3] === 0x47)
                                    
                                    if (!isValidFormat) {
                                        // Data doesn't match the format, skip this image
                                        imageData = null
                                    }
                                }
                                
                                // If we couldn't get valid encoded image data, try to encode raw pixel data as PNG
                                if (!imageData && imageObj.data && imageObj.width && imageObj.height) {
                                    try {
                                        const rgbData = imageObj.data
                                        const expectedLength = imageObj.width * imageObj.height * 3
                                        
                                        // Check if data length matches RGB format
                                        if (rgbData.length === expectedLength) {
                                            // Encode RGB pixel data as PNG
                                            imageData = encodePNG(rgbData, imageObj.width, imageObj.height)
                                            imageFormat = 'png'
                                            // Verify the encoded PNG is valid
                                            if (imageData && imageData.length > 8) {
                                                const isValidPNG = imageData[0] === 0x89 && 
                                                                   imageData[1] === 0x50 && 
                                                                   imageData[2] === 0x4E && 
                                                                   imageData[3] === 0x47
                                                if (!isValidPNG) {
                                                    // Encoding failed, skip this image
                                                    imageData = null
                                                }
                                            } else {
                                                imageData = null
                                            }
                                        } else {
                                            // Data length doesn't match RGB format, might be RGBA or other format
                                            // Try RGBA format (width * height * 4)
                                            const expectedLengthRGBA = imageObj.width * imageObj.height * 4
                                            if (rgbData.length === expectedLengthRGBA) {
                                                // Convert RGBA to RGB
                                                const rgbDataConverted = new Uint8Array(imageObj.width * imageObj.height * 3)
                                                for (let i = 0; i < imageObj.width * imageObj.height; i++) {
                                                    rgbDataConverted[i * 3] = rgbData[i * 4]
                                                    rgbDataConverted[i * 3 + 1] = rgbData[i * 4 + 1]
                                                    rgbDataConverted[i * 3 + 2] = rgbData[i * 4 + 2]
                                                }
                                                // Encode RGB pixel data as PNG
                                                imageData = encodePNG(rgbDataConverted, imageObj.width, imageObj.height)
                                                imageFormat = 'png'
                                                // Verify the encoded PNG is valid
                                                if (imageData && imageData.length > 8) {
                                                    const isValidPNG = imageData[0] === 0x89 && 
                                                                       imageData[1] === 0x50 && 
                                                                       imageData[2] === 0x4E && 
                                                                       imageData[3] === 0x47
                                                    if (!isValidPNG) {
                                                        // Encoding failed, skip this image
                                                        imageData = null
                                                    }
                                                } else {
                                                    imageData = null
                                                }
                                            }
                                        }
                                    } catch (e) {
                                        // Failed to encode, skip this image
                                        imageData = null
                                    }
                                }
                                
                                if (imageData && imageData.length > 0) {
                                    // Determine format
                                    if (imageObj.mimeType) {
                                        if (imageObj.mimeType.includes('jpeg') || imageObj.mimeType.includes('jpg')) {
                                            imageFormat = 'jpg'
                                        } else if (imageObj.mimeType.includes('png')) {
                                            imageFormat = 'png'
                                        }
                                    } else if (imageObj.subtype) {
                                        const subtype = String(imageObj.subtype).toLowerCase()
                                        if (subtype.includes('jpeg') || subtype.includes('jpg')) {
                                            imageFormat = 'jpg'
                                        } else if (subtype.includes('png')) {
                                            imageFormat = 'png'
                                        }
                                    } else if (imageObj.filter) {
                                        const filter = Array.isArray(imageObj.filter) ? imageObj.filter[0] : imageObj.filter
                                        const filterName = (filter && filter.name) ? filter.name : String(filter)
                                        if (filterName === 'DCTDecode' || filterName === 'DCT') {
                                            imageFormat = 'jpg'
                                        }
                                    } else if (String(imageName).includes('JPX') || String(imageName).includes('jpeg') || String(imageName).includes('JPG')) {
                                        imageFormat = 'jpg'
                                    }
                                    
                                    // Use current transform matrix
                                    const [a, b, c, d, e, f] = currentTransform
                                    const imgWidth = imageObj.width || 100
                                    const imgHeight = imageObj.height || 100
                                    
                                    // Calculate actual dimensions from transform
                                    const width = Math.sqrt(a * a + c * c) * imgWidth
                                    const height = Math.sqrt(b * b + d * d) * imgHeight
                                    const x = e
                                    const y = viewport.height - (f + height)
                                    
                                    imageCounter++
                                    const imageItemName = `image${imageCounter}`
                                    
                                    imageItems.push(new ImageItem({
                                        x: Math.round(x),
                                        y: Math.round(y),
                                        width: Math.round(width || imgWidth),
                                        height: Math.round(height || imgHeight),
                                        imageData: imageData,
                                        imageName: imageItemName,
                                        imageFormat: imageFormat
                                    }))
                                }
                            }
                        } catch (err) {
                            // Ignore image extraction errors for individual images
                            // Uncomment for debugging:
                            // console.warn(`Page ${j}, Failed to extract image ${imageName}:`, err.message)
                        }
                    }
                }
            }
        } catch (err) {
            // Ignore operator list parsing errors
            // Uncomment for debugging:
            // console.warn(`Page ${j}, Failed to parse operator list for images:`, err.message)
        }
        
        // Combine text items and image items, sort by Y position (top to bottom)
        const allItems = [...textItems, ...imageItems].sort((a, b) => {
            // Sort by Y position (top to bottom), then by X (left to right)
            if (Math.abs(a.y - b.y) > 5) {
                return b.y - a.y // Higher Y value is higher on page
            }
            return a.x - b.x
        })
        
        pages[page.pageNumber - 1].items = allItems
        pageParsed(pages)

        const fontIds = new Set(textItems.map(t => t.font))
        for (const fontId of fontIds) {
            if (!fonts.ids.has(fontId) && fontId.startsWith('g_d')) {
                // Depending on which build of pdfjs-dist is used, the
                // WorkerTransport containing the font objects is either transport or _transport
                const transport = pdfDocument.transport || pdfDocument._transport // eslint-disable-line no-underscore-dangle
                const font = await new Promise(resolve => transport.commonObjs.get(fontId, resolve))
                fonts.ids.add(fontId)
                fonts.map.set(fontId, font)
                fontParsed(fonts)
            }
        }
    }
    return {
        fonts,
        metadata,
        pages,
        pdfDocument
    }
}
