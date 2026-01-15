/**
 * 简单的PNG编码器，用于将RGB或RGBA像素数据编码为PNG格式
 * 这是一个最小化的实现，支持RGB和RGBA格式的像素数据
 */

/**
 * 将RGB或RGBA像素数据编码为PNG格式
 * @param {Uint8Array} pixelData - RGB或RGBA格式的像素数据
 * @param {number} width - 图片宽度
 * @param {number} height - 图片高度
 * @param {boolean} hasAlpha - 是否有alpha通道，如果为true则使用RGBA格式，否则使用RGB格式
 * @returns {Buffer} PNG格式的图片数据
 */
function encodePNG(pixelData, width, height, hasAlpha = false) {
    // PNG文件头
    const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    
    // 创建IHDR块
    const ihdr = createIHDR(width, height, hasAlpha)
    
    // 创建IDAT块（包含图片数据）
    const idat = createIDAT(pixelData, width, height, hasAlpha)
    
    // 创建IEND块
    const iend = createIEND()
    
    // 组合所有块
    const png = Buffer.concat([
        PNG_SIGNATURE,
        ihdr,
        idat,
        iend
    ])
    
    return png
}

/**
 * 创建IHDR块
 * @param {number} width - 图片宽度
 * @param {number} height - 图片高度
 * @param {boolean} hasAlpha - 是否有alpha通道
 */
function createIHDR(width, height, hasAlpha = false) {
    const data = Buffer.allocUnsafe(13)
    data.writeUInt32BE(width, 0)
    data.writeUInt32BE(height, 4)
    data[8] = 8  // bit depth
    data[9] = hasAlpha ? 6 : 2  // color type: 2=RGB, 6=RGBA
    data[10] = 0 // compression method
    data[11] = 0 // filter method
    data[12] = 0 // interlace method
    
    return createChunk('IHDR', data)
}

/**
 * 创建IDAT块（包含压缩的图片数据）
 * @param {Uint8Array} pixelData - RGB或RGBA格式的像素数据
 * @param {number} width - 图片宽度
 * @param {number} height - 图片高度
 * @param {boolean} hasAlpha - 是否有alpha通道
 */
function createIDAT(pixelData, width, height, hasAlpha = false) {
    // 将RGB或RGBA数据转换为PNG扫描线格式（每行前面加一个filter字节）
    const channelsPerPixel = hasAlpha ? 4 : 3
    const scanlineLength = width * channelsPerPixel + 1
    const imageData = Buffer.allocUnsafe(height * scanlineLength)
    
    for (let y = 0; y < height; y++) {
        const scanlineOffset = y * scanlineLength
        imageData[scanlineOffset] = 0 // filter type: None
        
        const pixelOffset = y * width * channelsPerPixel
        for (let x = 0; x < width; x++) {
            const srcOffset = pixelOffset + x * channelsPerPixel
            const dstOffset = scanlineOffset + 1 + x * channelsPerPixel
            imageData[dstOffset] = pixelData[srcOffset]     // R
            imageData[dstOffset + 1] = pixelData[srcOffset + 1] // G
            imageData[dstOffset + 2] = pixelData[srcOffset + 2] // B
            if (hasAlpha) {
                imageData[dstOffset + 3] = pixelData[srcOffset + 3] // A
            }
        }
    }
    
    // 使用zlib压缩（这里使用Node.js内置的zlib）
    const zlib = require('zlib')
    const compressed = zlib.deflateSync(imageData)
    
    return createChunk('IDAT', compressed)
}

/**
 * 创建IEND块
 */
function createIEND() {
    return createChunk('IEND', Buffer.alloc(0))
}

/**
 * 创建PNG块
 */
function createChunk(type, data) {
    const typeBuffer = Buffer.from(type, 'ascii')
    const length = data.length
    const lengthBuffer = Buffer.allocUnsafe(4)
    lengthBuffer.writeUInt32BE(length, 0)
    
    // 计算CRC32
    const crc = crc32(Buffer.concat([typeBuffer, data]))
    const crcBuffer = Buffer.allocUnsafe(4)
    crcBuffer.writeUInt32BE(crc, 0)
    
    return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer])
}

/**
 * 计算CRC32校验和
 */
function crc32(buffer) {
    const crcTable = []
    for (let i = 0; i < 256; i++) {
        let crc = i
        for (let j = 0; j < 8; j++) {
            crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : (crc >>> 1)
        }
        crcTable[i] = crc
    }
    
    let crc = 0xFFFFFFFF
    for (let i = 0; i < buffer.length; i++) {
        crc = crcTable[(crc ^ buffer[i]) & 0xFF] ^ (crc >>> 8)
    }
    return (crc ^ 0xFFFFFFFF) >>> 0
}

module.exports = {
    encodePNG
}

