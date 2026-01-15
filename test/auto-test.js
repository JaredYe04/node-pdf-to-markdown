#!/usr/bin/env node

/**
 * 自动化测试脚本：PDF转Markdown并与原始Markdown比较
 * 
 * 使用方法:
 *   node test/auto-test.js
 * 
 * 功能:
 *   1. 将PDF转换为Markdown
 *   2. 与原始Markdown文件进行比较
 *   3. 生成差异报告
 *   4. 显示相似度统计
 */

const fs = require('fs')
const path = require('path')
const pdf2md = require('../build/pdf2md')

// 测试文件配置
const TEST_CONFIG = {
  pdfPath: path.join(__dirname, 'test-pdfs', 'PDF → Markdown 综合测试文档.pdf'),
  originalMdPath: path.join(__dirname, 'PDF → Markdown 综合测试文档.md'),
  outputMdPath: path.join(__dirname, 'output', 'PDF → Markdown 综合测试文档.md'),
  imageMode: 'save',
  imagePath: path.join(__dirname, 'output', 'images', 'PDF → Markdown 综合测试文档')
}

// 确保目录存在
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

// 标准化文本（用于比较）
function normalizeText(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
}

// 提取Markdown结构特征
function extractFeatures(text) {
  const features = {
    boldCount: (text.match(/\*\*[^*]+\*\*/g) || []).length,
    italicCount: (text.match(/\*[^*]+\*/g) || []).length,
    strikethroughCount: (text.match(/~~[^~]+~~/g) || []).length,
    inlineCodeCount: (text.match(/`[^`]+`/g) || []).length,
    codeBlockCount: (text.match(/```[\s\S]*?```/g) || []).length,
    tableCount: (text.match(/\|.*\|/g) || []).length,
    headerCount: (text.match(/^#+\s/gm) || []).length,
    listCount: (text.match(/^[\s]*[-*+]\s/gm) || []).length,
    quoteCount: (text.match(/^>\s/gm) || []).length,
  }
  return features
}

// 计算相似度
function calculateSimilarity(original, converted) {
  const origFeatures = extractFeatures(original)
  const convFeatures = extractFeatures(converted)
  
  const scores = {
    bold: origFeatures.boldCount > 0 
      ? Math.min(convFeatures.boldCount / origFeatures.boldCount, 1) 
      : (convFeatures.boldCount === 0 ? 1 : 0),
    italic: origFeatures.italicCount > 0 
      ? Math.min(convFeatures.italicCount / origFeatures.italicCount, 1) 
      : (convFeatures.italicCount === 0 ? 1 : 0),
    strikethrough: origFeatures.strikethroughCount > 0 
      ? Math.min(convFeatures.strikethroughCount / origFeatures.strikethroughCount, 1) 
      : (convFeatures.strikethroughCount === 0 ? 1 : 0),
    inlineCode: origFeatures.inlineCodeCount > 0 
      ? Math.min(convFeatures.inlineCodeCount / origFeatures.inlineCodeCount, 1) 
      : (convFeatures.inlineCodeCount === 0 ? 1 : 0),
    codeBlock: origFeatures.codeBlockCount > 0 
      ? Math.min(convFeatures.codeBlockCount / origFeatures.codeBlockCount, 1) 
      : (convFeatures.codeBlockCount === 0 ? 1 : 0),
    table: origFeatures.tableCount > 0 
      ? Math.min(convFeatures.tableCount / origFeatures.tableCount, 1) 
      : (convFeatures.tableCount === 0 ? 1 : 0),
  }
  
  const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0) / Object.keys(scores).length
  
  return { scores, totalScore, origFeatures, convFeatures }
}

// 生成差异报告
function generateDiffReport(original, converted) {
  const origLines = original.split('\n')
  const convLines = converted.split('\n')
  
  const report = {
    added: [],
    removed: [],
    modified: [],
    stats: {
      originalLines: origLines.length,
      convertedLines: convLines.length,
      lineDiff: Math.abs(origLines.length - convLines.length)
    }
  }
  
  // 简单的行级比较
  const maxLines = Math.max(origLines.length, convLines.length)
  for (let i = 0; i < maxLines; i++) {
    const origLine = origLines[i] || ''
    const convLine = convLines[i] || ''
    
    if (i >= origLines.length) {
      report.added.push({ line: i + 1, content: convLine })
    } else if (i >= convLines.length) {
      report.removed.push({ line: i + 1, content: origLine })
    } else if (normalizeText(origLine) !== normalizeText(convLine)) {
      report.modified.push({
        line: i + 1,
        original: origLine,
        converted: convLine
      })
    }
  }
  
  return report
}

// 主函数
async function main() {
  console.log('='.repeat(80))
  console.log('PDF转Markdown自动化测试')
  console.log('='.repeat(80))
  console.log(`PDF文件: ${TEST_CONFIG.pdfPath}`)
  console.log(`原始MD: ${TEST_CONFIG.originalMdPath}`)
  console.log(`输出MD: ${TEST_CONFIG.outputMdPath}`)
  console.log('='.repeat(80))
  
  // 检查文件是否存在
  if (!fs.existsSync(TEST_CONFIG.pdfPath)) {
    console.error(`错误: PDF文件不存在: ${TEST_CONFIG.pdfPath}`)
    process.exit(1)
  }
  
  if (!fs.existsSync(TEST_CONFIG.originalMdPath)) {
    console.error(`错误: 原始Markdown文件不存在: ${TEST_CONFIG.originalMdPath}`)
    process.exit(1)
  }
  
  // 读取原始Markdown
  const originalMd = fs.readFileSync(TEST_CONFIG.originalMdPath, 'utf8')
  
  // 确保输出目录存在
  ensureDir(path.dirname(TEST_CONFIG.outputMdPath))
  if (TEST_CONFIG.imageMode === 'save') {
    ensureDir(TEST_CONFIG.imagePath)
  }
  
  // 转换PDF
  console.log('\n正在转换PDF...')
  try {
    const pdfBuffer = fs.readFileSync(TEST_CONFIG.pdfPath)
    const options = {
      imageMode: TEST_CONFIG.imageMode,
      imageSavePath: TEST_CONFIG.imagePath,
      pdfTitle: 'PDF → Markdown 综合测试文档'
    }
    
    const result = await pdf2md(pdfBuffer, options)
    const markdown = Array.isArray(result) ? result : result.markdown
    const convertedMd = markdown.join('\n\n---\n\n')
    
    // 保存转换后的Markdown
    fs.writeFileSync(TEST_CONFIG.outputMdPath, convertedMd, 'utf8')
    console.log(`✓ 已保存转换结果: ${TEST_CONFIG.outputMdPath}`)
    
    // 计算相似度
    console.log('\n正在分析差异...')
    const similarity = calculateSimilarity(originalMd, convertedMd)
    
    // 生成差异报告
    const diffReport = generateDiffReport(originalMd, convertedMd)
    
    // 输出结果
    console.log('\n' + '='.repeat(80))
    console.log('相似度分析')
    console.log('='.repeat(80))
    console.log(`总体相似度: ${(similarity.totalScore * 100).toFixed(1)}%`)
    console.log('\n各功能模块相似度:')
    console.log(`  粗体: ${(similarity.scores.bold * 100).toFixed(1)}% (原始: ${similarity.origFeatures.boldCount}, 转换: ${similarity.convFeatures.boldCount})`)
    console.log(`  斜体: ${(similarity.scores.italic * 100).toFixed(1)}% (原始: ${similarity.origFeatures.italicCount}, 转换: ${similarity.convFeatures.italicCount})`)
    console.log(`  删除线: ${(similarity.scores.strikethrough * 100).toFixed(1)}% (原始: ${similarity.origFeatures.strikethroughCount}, 转换: ${similarity.convFeatures.strikethroughCount})`)
    console.log(`  行内代码: ${(similarity.scores.inlineCode * 100).toFixed(1)}% (原始: ${similarity.origFeatures.inlineCodeCount}, 转换: ${similarity.convFeatures.inlineCodeCount})`)
    console.log(`  代码块: ${(similarity.scores.codeBlock * 100).toFixed(1)}% (原始: ${similarity.origFeatures.codeBlockCount}, 转换: ${similarity.convFeatures.codeBlockCount})`)
    console.log(`  表格: ${(similarity.scores.table * 100).toFixed(1)}% (原始: ${similarity.origFeatures.tableCount}, 转换: ${similarity.convFeatures.tableCount})`)
    
    console.log('\n' + '='.repeat(80))
    console.log('差异统计')
    console.log('='.repeat(80))
    console.log(`原始行数: ${diffReport.stats.originalLines}`)
    console.log(`转换行数: ${diffReport.stats.convertedLines}`)
    console.log(`行数差异: ${diffReport.stats.lineDiff}`)
    console.log(`修改的行数: ${diffReport.modified.length}`)
    console.log(`新增的行数: ${diffReport.added.length}`)
    console.log(`删除的行数: ${diffReport.removed.length}`)
    
    // 显示前10个差异示例
    if (diffReport.modified.length > 0) {
      console.log('\n' + '='.repeat(80))
      console.log('差异示例（前10个）')
      console.log('='.repeat(80))
      diffReport.modified.slice(0, 10).forEach((diff, index) => {
        console.log(`\n差异 #${index + 1} (行 ${diff.line}):`)
        console.log(`  原始: ${diff.original.substring(0, 100)}${diff.original.length > 100 ? '...' : ''}`)
        console.log(`  转换: ${diff.converted.substring(0, 100)}${diff.converted.length > 100 ? '...' : ''}`)
      })
    }
    
    // 保存详细报告
    const reportPath = path.join(__dirname, 'output', 'test-report.json')
    const report = {
      timestamp: new Date().toISOString(),
      similarity,
      diffReport: {
        ...diffReport,
        modified: diffReport.modified.slice(0, 50), // 只保存前50个差异
        added: diffReport.added.slice(0, 20),
        removed: diffReport.removed.slice(0, 20)
      }
    }
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
    console.log(`\n✓ 详细报告已保存: ${reportPath}`)
    
    console.log('\n' + '='.repeat(80))
    console.log('测试完成')
    console.log('='.repeat(80))
    
  } catch (error) {
    console.error('\n错误:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// 运行主函数
main().catch(error => {
  console.error('致命错误:', error)
  process.exit(1)
})

