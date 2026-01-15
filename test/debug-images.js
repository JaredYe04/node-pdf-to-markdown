#!/usr/bin/env node

/**
 * 调试脚本：检查PDF中的图片提取情况
 */

const fs = require('fs')
const path = require('path')
const pdfjs = require('pdfjs-dist')

const scriptDir = __dirname
const testPdfsDir = path.join(scriptDir, 'test-pdfs')

// 获取PDF文件列表
function getPdfFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    console.error(`错误: 目录不存在: ${dirPath}`)
    return []
  }
  
  const files = fs.readdirSync(dirPath)
  return files
    .filter(file => file.toLowerCase().endsWith('.pdf'))
    .map(file => path.join(dirPath, file))
}

// 检查PDF中的图片
async function checkImages(pdfPath) {
  const pdfName = path.basename(pdfPath)
  console.log(`\n检查文件: ${pdfName}`)
  console.log('='.repeat(60))
  
  try {
    const pdfBuffer = fs.readFileSync(pdfPath)
    const pdfDocument = await pdfjs.getDocument({
      data: new Uint8Array(pdfBuffer)
    }).promise
    
    console.log(`总页数: ${pdfDocument.numPages}`)
    
    let totalImageOps = 0
    let totalImagesExtracted = 0
    
    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum)
      const operatorList = await page.getOperatorList()
      
      let pageImageOps = 0
      const imageNames = new Set()
      
      // 检查操作符列表中的图片操作
      for (let i = 0; i < operatorList.fnArray.length; i++) {
        const op = operatorList.fnArray[i]
        const args = operatorList.argsArray[i]
        
        if (op === pdfjs.OPS.paintImageXObject || 
            op === pdfjs.OPS.paintJpegXObject || 
            op === pdfjs.OPS.paintInlineImageXObject) {
          pageImageOps++
          totalImageOps++
          
          const imageName = args && (Array.isArray(args) ? args[0] : args)
          if (imageName) {
            imageNames.add(String(imageName))
          }
        }
      }
      
      if (pageImageOps > 0) {
        console.log(`\n页面 ${pageNum}:`)
        console.log(`  发现 ${pageImageOps} 个图片操作`)
        console.log(`  图片名称: ${Array.from(imageNames).join(', ')}`)
        
        // 尝试提取图片
        for (const imageName of imageNames) {
          try {
            let imageObj = null
            
            // Method 1: Try page.objs.get directly (most reliable)
            if (page.objs && typeof page.objs.get === 'function') {
              try {
                imageObj = await new Promise((resolve, reject) => {
                  const timeout = setTimeout(() => reject(new Error('Timeout')), 5000)
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
                      const timeout = setTimeout(() => reject(new Error('Timeout')), 5000)
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
              const transport = pdfDocument.transport || pdfDocument._transport
              if (transport && transport.commonObjs && typeof transport.commonObjs.get === 'function') {
                try {
                  imageObj = await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error('Timeout')), 5000)
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
            
            if (imageObj) {
              console.log(`  ✓ 成功获取图片对象: ${imageName}`)
              console.log(`    类型: ${imageObj.constructor.name}`)
              console.log(`    属性: ${Object.keys(imageObj).join(', ')}`)
              
              if (imageObj.width && imageObj.height) {
                console.log(`    尺寸: ${imageObj.width} x ${imageObj.height}`)
              }
              
              if (imageObj.data) {
                console.log(`    数据长度: ${imageObj.data.length || 'N/A'}`)
                totalImagesExtracted++
              } else if (imageObj.getBytes) {
                try {
                  const bytes = await imageObj.getBytes()
                  console.log(`    数据长度: ${bytes.length}`)
                  totalImagesExtracted++
                } catch (e) {
                  console.log(`    ✗ 无法获取字节数据: ${e.message}`)
                }
              } else {
                console.log(`    ✗ 未找到数据属性或getBytes方法`)
              }
            } else {
              console.log(`  ✗ 无法获取图片对象: ${imageName}`)
            }
          } catch (err) {
            console.log(`  ✗ 无法获取图片对象 ${imageName}: ${err.message}`)
          }
        }
      }
    }
    
    console.log(`\n总结:`)
    console.log(`  总图片操作数: ${totalImageOps}`)
    console.log(`  成功提取的图片数: ${totalImagesExtracted}`)
    
  } catch (error) {
    console.error(`错误: ${error.message}`)
    console.error(error.stack)
  }
}

// 主函数
async function main() {
  const pdfFiles = getPdfFiles(testPdfsDir)
  
  if (pdfFiles.length === 0) {
    console.log('未找到PDF文件')
    console.log(`请将PDF文件放入: ${testPdfsDir}`)
    return
  }
  
  console.log(`找到 ${pdfFiles.length} 个PDF文件`)
  
  for (const pdfPath of pdfFiles) {
    await checkImages(pdfPath)
  }
}

main().catch(error => {
  console.error('致命错误:', error)
  process.exit(1)
})

