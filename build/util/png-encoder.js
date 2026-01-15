/**
 * 简单的PNG编码器，用于将RGB像素数据编码为PNG格式
 * 这是一个最小化的实现，仅支持RGB格式的像素数据
 */

/**
 * 将RGB像素数据编码为PNG格式
 * @param {Uint8Array} rgbData - RGB格式的像素数据 (width * height * 3)
 * @param {number} width - 图片宽度
 * @param {number} height - 图片高度
 * @returns {Buffer} PNG格式的图片数据
 */
function encodePNG(rgbData, width, height) {
    // PNG文件头
    const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    
    // 创建IHDR块
    const ihdr = createIHDR(width, height)
    
    // 创建IDAT块（包含图片数据）
    const idat = createIDAT(rgbData, width, height)
    
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
 */
function createIHDR(width, height) {
    const data = Buffer.allocUnsafe(13)
    data.writeUInt32BE(width, 0)
    data.writeUInt32BE(height, 4)
    data[8] = 8  // bit depth
    data[9] = 2  // color type (RGB)
    data[10] = 0 // compression method
    data[11] = 0 // filter method
    data[12] = 0 // interlace method
    
    return createChunk('IHDR', data)
}

/**
 * 创建IDAT块（包含压缩的图片数据）
 */
function createIDAT(rgbData, width, height) {
    // 将RGB数据转换为PNG扫描线格式（每行前面加一个filter字节）
    const scanlineLength = width * 3 + 1
    const imageData = Buffer.allocUnsafe(height * scanlineLength)
    
    for (let y = 0; y < height; y++) {
        const scanlineOffset = y * scanlineLength
        imageData[scanlineOffset] = 0 // filter type: None
        
        const rgbOffset = y * width * 3
        for (let x = 0; x < width; x++) {
            const srcOffset = rgbOffset + x * 3
            const dstOffset = scanlineOffset + 1 + x * 3
            imageData[dstOffset] = rgbData[srcOffset]     // R
            imageData[dstOffset + 1] = rgbData[srcOffset + 1] // G
            imageData[dstOffset + 2] = rgbData[srcOffset + 2] // B
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

