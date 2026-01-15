#!/usr/bin/env node

/**
 * 批量PDF转Markdown测试脚本
 * 
 * 使用方法:
 *   node test/batch-convert.js [--image-mode base64] [--image-path ./images]
 * 
 * 说明:
 *   - 脚本会自动使用脚本所在目录作为根目录
 *   - 输入文件夹: ./test-pdfs (脚本目录下的test-pdfs文件夹)
 *   - 输出文件夹: ./output (脚本目录下的output文件夹)
 * 
 * 参数:
 *   --image-mode <mode>   图片处理模式: none, base64, relative, save (默认: none)
 *   --image-path <path>   图片保存路径（仅当image-mode为save时使用，相对于脚本目录）
 */

const fs = require('fs')
const path = require('path')
const pdf2md = require('../build/pdf2md')

// 获取脚本所在目录
const scriptDir = __dirname
const rootDir = path.resolve(scriptDir)

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2)
  const config = {
    input: path.join(rootDir, 'test-pdfs'),
    output: path.join(rootDir, 'output'),
    imageMode: 'none',
    imagePath: null
  }
  
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]
    const value = args[i + 1]
    
    if (key === '--image-mode') {
      config.imageMode = value
    } else if (key === '--image-path') {
      // 如果提供的是相对路径，则相对于脚本目录
      config.imagePath = path.isAbsolute(value) ? value : path.join(rootDir, value)
    }
  }
  
  return config
}

// 确保目录存在
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
    console.log(`创建目录: ${dirPath}`)
  }
}

// 验证图片Buffer是否有效
function isValidImageBuffer(buffer) {
  if (!buffer || buffer.length < 4) {
    return false
  }
  
  // Check PNG magic number: 89 50 4E 47
  const isPNG = buffer[0] === 0x89 && 
                 buffer[1] === 0x50 && 
                 buffer[2] === 0x4E && 
                 buffer[3] === 0x47
  
  // Check JPEG magic number: FF D8
  const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8
  
  return isPNG || isJPEG
}

// 验证base64图片是否有效
function isValidBase64Image(base64Data) {
  try {
    const buffer = Buffer.from(base64Data, 'base64')
    return isValidImageBuffer(buffer)
  } catch (e) {
    return false
  }
}

// 从Markdown内容中提取base64图片
function extractBase64Images(mdContent) {
  const base64Images = []
  // 匹配 data:image/png;base64,xxx 或 data:image/jpeg;base64,xxx
  const regex = /data:image\/(?:png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)/g
  let match
  while ((match = regex.exec(mdContent)) !== null) {
    base64Images.push(match[1])
  }
  return base64Images
}

// 获取PDF文件列表
function getPdfFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    console.warn(`警告: 输入目录不存在: ${dirPath}`)
    console.log(`正在创建输入目录...`)
    ensureDir(dirPath)
    console.log(`提示: 请将PDF文件放入 ${dirPath} 目录后重新运行脚本`)
    return []
  }
  
  const files = fs.readdirSync(dirPath)
  return files
    .filter(file => file.toLowerCase().endsWith('.pdf'))
    .map(file => path.join(dirPath, file))
}

// 处理单个PDF文件
async function processPdf(pdfPath, config) {
  const pdfName = path.basename(pdfPath, '.pdf')
  console.log(`\n处理文件: ${pdfName}.pdf`)
  
  try {
    // 读取PDF文件
    const pdfBuffer = fs.readFileSync(pdfPath)
    
    // 准备选项
    const options = {
      imageMode: config.imageMode
    }
    
    // 如果使用save模式，创建图片目录
    if (config.imageMode === 'save') {

        
      const imageDir = config.imagePath || path.join(config.output, 'images', pdfName)
      ensureDir(imageDir)
      options.imageSavePath = imageDir
      options.pdfTitle = pdfName
    } else if (config.imageMode === 'relative') {
      options.pdfTitle = pdfName
    } else if (config.imageMode === 'base64') {
      options.pdfTitle = pdfName
    }
    
    // 转换PDF
    const result = await pdf2md(pdfBuffer, options)
    
    // 处理结果
    let markdown
    let images = null
    
    if (Array.isArray(result)) {
      markdown = result
    } else {
      markdown = result.markdown
      images = result.images
    }
    
    // 保存Markdown文件
    const mdPath = path.join(config.output, `${pdfName}.md`)
    let mdContent = markdown.join('\n\n---\n\n')
    
    // 如果使用save模式，更新图片路径为相对于Markdown文件的路径
    if (config.imageMode === 'save' && options.imageSavePath) {
      const imageDir = path.relative(path.dirname(mdPath), options.imageSavePath)
      const imageDirNormalized = imageDir.replace(/\\/g, '/')
      // 替换图片路径
      mdContent = mdContent.replace(/!\[([^\]]+)\]\(([^)]+)\)/g, (match, alt, imgPath) => {
        if (imgPath && !imgPath.startsWith('data:') && !imgPath.startsWith('http')) {
          const imageName = path.basename(imgPath)
          return `![${alt}](${imageDirNormalized}/${imageName})`
        }
        return match
      })
    }
    
    fs.writeFileSync(mdPath, mdContent, 'utf8')
    console.log(`  ✓ 已保存: ${mdPath}`)
    
    // 如果使用relative模式，保存图片并验证
    if (config.imageMode === 'relative' && images && images.size > 0) {
      const imageDir = path.join(config.output, 'images', pdfName)
      ensureDir(imageDir)
      
      console.log(`  ✓ 发现 ${images.size} 张图片`)
      let validImageCount = 0
      let invalidImageCount = 0
      
      for (const [imageName, imageBuffer] of images.entries()) {
        // 验证图片格式
        const isValid = isValidImageBuffer(imageBuffer)
        if (!isValid) {
          console.log(`  ✗ 图片格式无效: ${imageName}`)
          invalidImageCount++
          continue
        }
        
        const imagePath = path.join(imageDir, imageName)
        fs.writeFileSync(imagePath, imageBuffer)
        console.log(`  ✓ 已保存图片: ${imagePath}`)
        validImageCount++
      }
      
      if (invalidImageCount > 0) {
        console.log(`  ⚠ 警告: ${invalidImageCount} 张图片格式无效`)
      }
    }
    
    // 如果使用base64模式，验证base64图片
    if (config.imageMode === 'base64') {
      const base64Images = extractBase64Images(mdContent)
      if (base64Images.length > 0) {
        console.log(`  ✓ 发现 ${base64Images.length} 个base64图片`)
        let validCount = 0
        let invalidCount = 0
        
        for (const base64Data of base64Images) {
          const isValid = isValidBase64Image(base64Data)
          if (isValid) {
            validCount++
          } else {
            invalidCount++
          }
        }
        
        if (invalidCount > 0) {
          console.log(`  ✗ 警告: ${invalidCount} 个base64图片格式无效`)
        } else {
          console.log(`  ✓ 所有base64图片格式有效`)
        }
      }
    }
    
    console.log(`  ✓ 完成`)
    return { success: true, pdfName, imageCount: images ? images.size : 0 }
  } catch (error) {
    console.error(`  ✗ 错误: ${error.message}`)
    console.error(error.stack)
    return { success: false, pdfName, error: error.message }
  }
}

// 主函数
async function main() {
  const config = parseArgs()
  
  console.log('='.repeat(60))
  console.log('PDF批量转换工具')
  console.log('='.repeat(60))
  console.log(`工作目录: ${rootDir}`)
  console.log(`输入目录: ${config.input}`)
  console.log(`输出目录: ${config.output}`)
  console.log(`图片模式: ${config.imageMode}`)
  if (config.imageMode === 'save' && config.imagePath) {
    console.log(`图片路径: ${config.imagePath}`)
  }
  console.log('='.repeat(60))
  
  // 确保输出目录存在
  ensureDir(config.output)
  
  // 获取PDF文件列表
  const pdfFiles = getPdfFiles(config.input)
  
  if (pdfFiles.length === 0) {
    console.log('\n未找到PDF文件')
    console.log(`请将PDF文件放入以下目录: ${config.input}`)
    return
  }
  
  console.log(`\n找到 ${pdfFiles.length} 个PDF文件`)
  
  // 处理每个PDF文件
  const results = []
  for (const pdfPath of pdfFiles) {
    const result = await processPdf(pdfPath, config)
    results.push(result)
  }
  
  // 输出统计信息
  console.log('\n' + '='.repeat(60))
  console.log('处理完成')
  console.log('='.repeat(60))
  const successCount = results.filter(r => r.success).length
  const failCount = results.length - successCount
  const totalImages = results.reduce((sum, r) => sum + (r.imageCount || 0), 0)
  
  console.log(`成功: ${successCount}`)
  console.log(`失败: ${failCount}`)
  if (totalImages > 0) {
    console.log(`图片总数: ${totalImages}`)
  }
  
  if (failCount > 0) {
    console.log('\n失败的文件:')
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.pdfName}: ${r.error}`)
    })
  }
}

// 运行主函数
main().catch(error => {
  console.error('致命错误:', error)
  process.exit(1)
})

