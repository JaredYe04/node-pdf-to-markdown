# 📄 node-pdf-to-markdown

> **Powerful PDF to Markdown Converter with Intelligent Text Recognition and Image Processing**

[![npm version](https://img.shields.io/npm/v/node-pdf-to-markdown)](https://www.npmjs.com/package/node-pdf-to-markdown)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D12-green.svg)](https://nodejs.org/)

A powerful PDF to Markdown converter with intelligent text recognition and flexible image processing. This project is a fork and enhancement of [@opendocsg/pdf2md](https://www.npmjs.com/package/@opendocsg/pdf2md), with added TypeScript support, image processing capabilities, and batch conversion tools.

<div align="center">

**[English](#english) | [中文](#中文)**

</div>

---

<a name="english"></a>

## ✨ Core Features

- 🚀 **Intelligent Text Recognition** - Automatically identifies headings, lists, paragraphs, and other Markdown elements
- 🖼️ **Flexible Image Processing** - Supports four image processing modes: none, base64, relative path, and auto-save
- 📝 **Format Preservation** - Preserves bold, italic, and other text formatting
- 📦 **TypeScript Support** - Complete type definitions included
- 🔄 **Batch Processing** - Built-in batch conversion tool for multiple PDF files
- 🏗️ **Pipeline Architecture** - Extensible transformation pipeline for easy customization

---

## 📦 Installation

```bash
npm install node-pdf-to-markdown
# or
yarn add node-pdf-to-markdown
```

---

## 🚀 Quick Start

### Basic Usage

**ES5 (CommonJS)**

```javascript
const fs = require('fs')
const pdf2md = require('node-pdf-to-markdown')

const pdfBuffer = fs.readFileSync('document.pdf')
pdf2md(pdfBuffer)
  .then(markdown => {
    console.log(markdown.join('\n'))
  })
  .catch(err => {
    console.error(err)
  })
```

**ES6 & TypeScript**

```typescript
import pdf2md from 'node-pdf-to-markdown'
import { readFileSync } from 'fs'

const buffer = readFileSync('document.pdf')
const res = await pdf2md(buffer)
console.log(res) // string[]
```

---

## 🖼️ Image Processing

This tool supports four image processing modes to suit different use cases:

### 1. No Image Processing (Default)

Skip all images in the PDF:

```javascript
const markdown = await pdf2md(pdfBuffer)
// or explicitly
const markdown = await pdf2md(pdfBuffer, { imageMode: 'none' })
```

### 2. Base64 Embedding

Embed images as Base64 directly in the Markdown file:

```javascript
const markdown = await pdf2md(pdfBuffer, {
  imageMode: 'base64',
  pdfTitle: 'document' // Optional, used for image naming
})
```

The generated Markdown will contain images like:

```markdown
![document_image1_p1.png](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...)
```

### 3. Relative Path Reference (Returns Image Map)

Use relative paths in Markdown and return an image map for custom handling:

```javascript
const result = await pdf2md(pdfBuffer, {
  imageMode: 'relative',
  pdfTitle: 'document'
})

// result.markdown: string[] - Markdown text
// result.images: Map<string, Buffer> - Map of image names to image buffers

// Save images yourself
for (const [imageName, imageBuffer] of result.images.entries()) {
  fs.writeFileSync(`./images/${imageName}`, imageBuffer)
}
```

The generated Markdown will contain:

```markdown
![document_image1_p1.png](./document_image1_p1.png)
```

### 4. Auto-Save to Disk

Automatically save images to a specified directory:

```javascript
const markdown = await pdf2md(pdfBuffer, {
  imageMode: 'save',
  imageSavePath: './output/images',
  pdfTitle: 'document' // Optional, used as image name prefix
})
```

Images will be automatically saved to the specified directory with proper path references in Markdown.

---

## 📚 API Documentation

### `pdf2md(pdfBuffer, options?)`

Converts a PDF file to Markdown format.

**Parameters:**

- `pdfBuffer`: `string | Buffer | TypedArray | ArrayBuffer | DocumentInitParameters` - PDF file to convert
- `options`: `ConversionOptions` (optional)
  - `callbacks`: `object` - Optional callbacks for conversion events
    - `metadataParsed?: (metadata: Metadata) => void`
    - `pageParsed?: (pages: Page[]) => void`
    - `fontParsed?: (font: Font) => void`
    - `documentParsed?: (document: PDFDocumentProxy, pages: Page[]) => void`
  - `imageMode?: 'none' | 'base64' | 'relative' | 'save'` - Image processing mode (default: `'none'`)
  - `imageSavePath?: string` - Path to save images (required when `imageMode` is `'save'`)
  - `pdfTitle?: string` - PDF title prefix for image naming (prevents naming conflicts)

**Returns:**

- `Promise<string[]>` - When `imageMode` is `'none'`, `'base64'`, or `'save'`
- `Promise<ConversionResult>` - When `imageMode` is `'relative'`
  - `markdown: string[]` - Markdown text array (one per page)
  - `images: Map<string, Buffer>` - Map of image names to image buffers

**TypeScript Types:**

```typescript
interface ConversionOptions {
  callbacks?: {
    metadataParsed?: (metadata: Metadata) => void
    pageParsed?: (pages: Page[]) => void
    fontParsed?: (font: Font) => void
    documentParsed?: (document: PDFDocumentProxy, pages: Page[]) => void
  }
  imageMode?: 'none' | 'base64' | 'relative' | 'save'
  imageSavePath?: string
  pdfTitle?: string
}

interface ConversionResult {
  markdown: string[]
  images: Map<string, Buffer>
}
```

---

## 🔧 Batch Conversion Tool

The project includes a batch conversion script for processing multiple PDF files automatically.

### Usage

```bash
# Using npm script (recommended)
npm run batch-convert

# Or run directly
node test/batch-convert.js

# Specify image processing mode
node test/batch-convert.js --image-mode base64
```

### Directory Structure

The script uses the following directory structure (relative to `test` directory):

```
test/
├── batch-convert.js    # Script file
├── test-pdfs/          # Input directory (place PDF files here, auto-created if missing)
└── output/             # Output directory (saves Markdown files, auto-created)
    └── images/         # Image directory (only when using relative or save mode)
```

### Parameters

- `--image-mode <mode>`: Image processing mode (optional)
  - `none`: Skip images (default)
  - `base64`: Embed as Base64
  - `relative`: Return image map and save to `output/images/` directory
  - `save`: Save to specified path
- `--image-path <path>`: Image save path (only when `--image-mode` is `save`, relative to test directory)

### Examples

```bash
# Skip images (default)
node test/batch-convert.js

# Base64 embedding
node test/batch-convert.js --image-mode base64

# Return image map
node test/batch-convert.js --image-mode relative

# Save images to specified directory
node test/batch-convert.js --image-mode save --image-path ./images
```

### Output Structure

When using batch conversion, the `test/output` directory structure:

```
test/output/
├── document1.md
├── document2.md
└── images/          # Only when using relative or save mode
    ├── document1/
    │   ├── document1_image1_p1.png
    │   └── document1_image2_p2.png
    └── document2/
        └── document2_image1_p1.png
```

---

## 🏗️ How It Works

This tool uses a **pipeline transformation architecture** to convert PDF raw data into structured Markdown through multiple transformation steps:

1. **PDF Parsing** - Uses pdf.js to extract text, images, fonts, and metadata
2. **Text Analysis** - Calculates global statistics (fonts, heights, spacing)
3. **Line Merging** - Merges text items on the same line
4. **Element Detection** - Automatically identifies headings, lists, code blocks, etc.
5. **Block Collection** - Groups related lines into blocks
6. **Markdown Generation** - Converts to final Markdown format

For detailed information, see [PDF转Markdown逻辑原理.md](./PDF转Markdown逻辑原理.md)

---

## 🧪 Testing

```bash
npm test
```

---

## 📝 Changelog

### [Latest Version]

1. ✅ **Image Processing** - Four image processing modes
2. ✅ **Batch Conversion Tool** - Automated batch processing script
3. ✅ **Image Naming Optimization** - PDF title prefix prevents naming conflicts
4. ✅ **TypeScript Definitions** - Complete type definitions for image processing

### [2024-3-2]

1. ✅ Added TypeScript type definitions
2. ✅ Changed return value to page-separated Markdown array (`string[]`)
3. ✅ Removed CLI script

---

## 🔮 Future Plans

- 🔄 **Table Recognition** - Automatic table detection and conversion to Markdown tables
- 🔄 **Better Layout Handling** - Improved handling of complex multi-column layouts
- 🔄 **OCR Support** - OCR text recognition for scanned PDFs
- 🔄 **More Format Support** - Support for more Markdown extended syntax
- 🔄 **Performance Optimization** - Optimize performance for large files
- 🔄 **Error Handling** - Improved error handling and logging
- 🔄 **Configuration Options** - More customization options

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

---

## 📄 License

MIT License

---

## 🙏 Acknowledgments

- [@opendocsg/pdf2md](https://www.npmjs.com/package/@opendocsg/pdf2md) - Original project this was forked from
- [pdf-to-markdown](https://github.com/jzillmann/pdf-to-markdown) - Original project by Johannes Zillmann
- [pdf.js](https://mozilla.github.io/pdf.js/) - Mozilla's PDF parsing and rendering platform

---

**Made with ❤️ for developers who need to convert PDFs to Markdown**

---

<a name="中文"></a>

<div align="center">

**[English](#english) | [中文](#中文)**

</div>

---

一个强大的 PDF 转 Markdown 转换工具，支持智能文本识别和灵活的图片处理。本项目基于 [@opendocsg/pdf2md](https://www.npmjs.com/package/@opendocsg/pdf2md) Fork 并增强，添加了 TypeScript 支持、图片处理功能和批量转换工具。

## ✨ 核心特性

- 🚀 **智能文本识别** - 自动识别标题、列表、段落等 Markdown 元素
- 🖼️ **灵活的图片处理** - 支持四种图片处理模式：不处理、Base64 嵌入、相对路径引用、自动保存
- 📝 **格式保留** - 保留粗体、斜体等文本格式
- 📦 **TypeScript 支持** - 提供完整的类型定义
- 🔄 **批量处理** - 内置批量转换工具，支持处理多个 PDF 文件
- 🏗️ **管道式架构** - 可扩展的转换管道，易于定制

---

## 📦 安装

```bash
npm install node-pdf-to-markdown
# 或
yarn add node-pdf-to-markdown
```

---

## 🚀 快速开始

### 基础用法

**ES5 (CommonJS)**

```javascript
const fs = require('fs')
const pdf2md = require('node-pdf-to-markdown')

const pdfBuffer = fs.readFileSync('document.pdf')
pdf2md(pdfBuffer)
  .then(markdown => {
    console.log(markdown.join('\n'))
  })
  .catch(err => {
    console.error(err)
  })
```

**ES6 & TypeScript**

```typescript
import pdf2md from 'node-pdf-to-markdown'
import { readFileSync } from 'fs'

const buffer = readFileSync('document.pdf')
const res = await pdf2md(buffer)
console.log(res) // string[]
```

---

## 🖼️ 图片处理

本工具支持四种图片处理模式，以适应不同的使用场景：

### 1. 不处理图片（默认）

跳过 PDF 中的所有图片：

```javascript
const markdown = await pdf2md(pdfBuffer)
// 或显式指定
const markdown = await pdf2md(pdfBuffer, { imageMode: 'none' })
```

### 2. Base64 嵌入

将图片转换为 Base64 编码，直接嵌入 Markdown 文件中：

```javascript
const markdown = await pdf2md(pdfBuffer, {
  imageMode: 'base64',
  pdfTitle: 'document' // 可选，用于图片命名
})
```

生成的 Markdown 中会包含类似这样的图片引用：

```markdown
![document_image1_p1.png](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...)
```

### 3. 相对路径引用（返回图片映射表）

在 Markdown 中使用相对路径引用图片，并返回一个包含图片数据的映射表，由调用者自行处理图片保存：

```javascript
const result = await pdf2md(pdfBuffer, {
  imageMode: 'relative',
  pdfTitle: 'document'
})

// result.markdown: string[] - Markdown 文本
// result.images: Map<string, Buffer> - 图片名称到图片 Buffer 的映射

// 自行保存图片
for (const [imageName, imageBuffer] of result.images.entries()) {
  fs.writeFileSync(`./images/${imageName}`, imageBuffer)
}
```

生成的 Markdown 中会包含类似这样的图片引用：

```markdown
![document_image1_p1.png](./document_image1_p1.png)
```

### 4. 自动保存到指定路径

自动将图片保存到指定目录，并在 Markdown 中引用该路径：

```javascript
const markdown = await pdf2md(pdfBuffer, {
  imageMode: 'save',
  imageSavePath: './output/images',
  pdfTitle: 'document' // 可选，用于图片命名前缀
})
```

图片会自动保存到指定目录，Markdown 中会包含图片的路径引用。

---

## 📚 API 文档

### `pdf2md(pdfBuffer, options?)`

将 PDF 文件转换为 Markdown 格式。

**参数：**

- `pdfBuffer`: `string | Buffer | TypedArray | ArrayBuffer | DocumentInitParameters` - 要转换的 PDF 文件
- `options`: `ConversionOptions` (可选)
  - `callbacks`: `object` - 转换过程中的可选回调函数
    - `metadataParsed?: (metadata: Metadata) => void`
    - `pageParsed?: (pages: Page[]) => void`
    - `fontParsed?: (font: Font) => void`
    - `documentParsed?: (document: PDFDocumentProxy, pages: Page[]) => void`
  - `imageMode?: 'none' | 'base64' | 'relative' | 'save'` - 图片处理模式（默认：`'none'`）
  - `imageSavePath?: string` - 图片保存路径（当 `imageMode` 为 `'save'` 时必需）
  - `pdfTitle?: string` - PDF 标题前缀，用于图片命名（防止命名冲突）

**返回值：**

- `Promise<string[]>` - 当 `imageMode` 为 `'none'`、`'base64'` 或 `'save'` 时
- `Promise<ConversionResult>` - 当 `imageMode` 为 `'relative'` 时
  - `markdown: string[]` - Markdown 文本数组（每页一个）
  - `images: Map<string, Buffer>` - 图片名称到图片 Buffer 的映射

**TypeScript 类型：**

```typescript
interface ConversionOptions {
  callbacks?: {
    metadataParsed?: (metadata: Metadata) => void
    pageParsed?: (pages: Page[]) => void
    fontParsed?: (font: Font) => void
    documentParsed?: (document: PDFDocumentProxy, pages: Page[]) => void
  }
  imageMode?: 'none' | 'base64' | 'relative' | 'save'
  imageSavePath?: string
  pdfTitle?: string
}

interface ConversionResult {
  markdown: string[]
  images: Map<string, Buffer>
}
```

---

## 🔧 批量转换工具

项目提供了一个批量转换脚本，可以自动处理文件夹中的所有 PDF 文件。

### 使用方法

```bash
# 使用 npm 脚本（推荐）
npm run batch-convert

# 或直接运行
node test/batch-convert.js

# 指定图片处理模式
node test/batch-convert.js --image-mode base64
```

### 目录结构

脚本使用以下目录结构（相对于 `test` 目录）：

```
test/
├── batch-convert.js    # 脚本文件
├── test-pdfs/          # 输入目录（放置 PDF 文件，不存在会自动创建）
└── output/             # 输出目录（保存 Markdown 文件，自动创建）
    └── images/         # 图片目录（仅当使用 relative 或 save 模式时）
```

### 参数说明

- `--image-mode <mode>`: 图片处理模式（可选）
  - `none`: 不处理图片（默认）
  - `base64`: 嵌入 Base64 编码
  - `relative`: 返回图片映射表，并保存到 `output/images/` 目录
  - `save`: 保存到指定路径
- `--image-path <path>`: 图片保存路径（仅当 `--image-mode` 为 `save` 时使用，相对于 test 目录）

### 示例

```bash
# 不处理图片（默认）
node test/batch-convert.js

# Base64 嵌入
node test/batch-convert.js --image-mode base64

# 返回图片映射表
node test/batch-convert.js --image-mode relative

# 保存图片到指定目录
node test/batch-convert.js --image-mode save --image-path ./images
```

### 输出结构

使用批量转换工具时，`test/output` 目录结构如下：

```
test/output/
├── document1.md
├── document2.md
└── images/          # 仅当使用 relative 或 save 模式时
    ├── document1/
    │   ├── document1_image1_p1.png
    │   └── document1_image2_p2.png
    └── document2/
        └── document2_image1_p1.png
```

---

## 🏗️ 工作原理

本工具采用**管道式转换架构**，通过多个转换步骤逐步将 PDF 的原始数据转换为结构化的 Markdown 文档：

1. **PDF 解析** - 使用 pdf.js 提取文本、图片、字体等信息
2. **文本分析** - 统计字体、高度、间距等全局特征
3. **行合并** - 将同一行的文本项合并
4. **元素识别** - 自动识别标题、列表、代码块等
5. **块收集** - 将相关行组合成块
6. **Markdown 生成** - 转换为最终的 Markdown 格式

详细的工作原理请参考 [PDF转Markdown逻辑原理.md](./PDF转Markdown逻辑原理.md)

---

## 🧪 测试

```bash
npm test
```

---

## 📝 更新日志

### [最新版本]

1. ✅ **图片处理功能** - 支持四种图片处理方式
2. ✅ **批量转换工具** - 提供自动化批量处理脚本
3. ✅ **图片命名优化** - 使用 PDF 标题前缀防止图片重名
4. ✅ **类型定义完善** - 更新 TypeScript 类型定义以支持图片处理

### [2024-3-2]

1. ✅ 添加 TypeScript 类型定义
2. ✅ 修改返回值为按页分割的 Markdown 数组（`string[]`）
3. ✅ 移除 CLI 脚本

---

## 🔮 未来计划

我们计划继续扩展和优化本工具，未来可能的功能包括：

- 🔄 **表格识别** - 自动识别和转换 PDF 中的表格为 Markdown 表格
- 🔄 **更好的布局处理** - 改进复杂多栏布局的处理能力
- 🔄 **OCR 支持** - 对于扫描版 PDF，支持 OCR 文字识别
- 🔄 **更多格式支持** - 支持更多 Markdown 扩展语法
- 🔄 **性能优化** - 优化大文件处理性能
- 🔄 **错误处理** - 改进错误处理和日志记录
- 🔄 **配置选项** - 提供更多自定义配置选项

欢迎提交 Issue 和 Pull Request！

---

## 📄 许可证

MIT License

---

## 🙏 致谢

本项目基于以下项目修改：

- [@opendocsg/pdf2md](https://www.npmjs.com/package/@opendocsg/pdf2md) - 本项目 Fork 的源项目
- [pdf-to-markdown](https://github.com/jzillmann/pdf-to-markdown) - 原始项目，由 Johannes Zillmann 创建
- [pdf.js](https://mozilla.github.io/pdf.js/) - Mozilla 的 PDF 解析和渲染平台，用作底层解析器

---

**Made with ❤️ for developers who need to convert PDFs to Markdown**
