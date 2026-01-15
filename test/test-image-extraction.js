#!/usr/bin/env node

/**
 * 测试图片提取功能
 */

const fs = require('fs')
const path = require('path')
const pdf2md = require('../build/pdf2md')

const testPdf = path.join(__dirname, 'test-pdfs', 'MetaDoc商业计划书.pdf')

async function test() {
  console.log('测试图片提取...')
  console.log(`PDF文件: ${testPdf}`)
  
  try {
    const pdfBuffer = fs.readFileSync(testPdf)
    
    // 添加回调来追踪ImageItem
    let imageItemCount = 0
    let parseCount = 0
    const callbacks = {
      pageParsed: (pages) => {
        parseCount++
        if (parseCount === 1) {
          // Only count on first parse (before transformations)
          pages.forEach((page, idx) => {
            const images = page.items.filter(item => 
              item && typeof item === 'object' && (item.imageData || item.constructor?.name === 'ImageItem')
            )
            if (images.length > 0) {
              console.log(`页面 ${idx + 1}: 发现 ${images.length} 个ImageItem`)
              imageItemCount += images.length
            }
          })
        }
      }
    }
    
    const result = await pdf2md(pdfBuffer, {
      callbacks,
      imageMode: 'base64',
      pdfTitle: 'MetaDoc'
    })
    
    console.log(`\n总共发现 ${imageItemCount} 个ImageItem`)
    
    const markdown = Array.isArray(result) ? result : result.markdown
    const fullText = markdown.join('\n\n---\n\n')
    
    console.log(`生成的Markdown长度: ${fullText.length} 字符`)
    console.log(`包含 'data:image': ${fullText.includes('data:image')}`)
    console.log(`包含 '![': ${fullText.includes('![')}`)
    
    // 统计图片数量
    const imageMatches = fullText.match(/!\[.*?\]\(data:image/g)
    console.log(`找到的图片引用数量: ${imageMatches ? imageMatches.length : 0}`)
    
    // 保存测试结果
    const outputPath = path.join(__dirname, 'output', 'test-image-extraction.md')
    fs.writeFileSync(outputPath, fullText)
    console.log(`\n测试结果已保存到: ${outputPath}`)
    
  } catch (error) {
    console.error('错误:', error.message)
    console.error(error.stack)
  }
}

test()

