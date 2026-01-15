# PDF转Markdown逻辑原理文档

## 概述

本项目实现了一个将PDF文档转换为Markdown格式的转换器。转换过程采用**管道式转换架构**，通过多个转换步骤逐步将PDF的原始文本数据转换为结构化的Markdown文本。

## 核心架构

### 转换流程概览

```
PDF文件 → PDF解析 → TextItem → LineItem → LineItemBlock → Markdown文本
```

### 数据模型演进

1. **TextItem**: PDF中的单个文本片段（字词级别），包含位置、字体、文本内容
2. **LineItem**: 同一行的文本项合并，包含单词列表
3. **LineItemBlock**: 多个相关行组成的块，具有类型（标题、列表、段落等）
4. **Markdown文本**: 最终的字符串输出

## 详细转换流程

### 阶段一：PDF解析（`build/util/pdf.js`）

**功能**: 使用Mozilla的pdf.js库解析PDF文件，提取文本内容和元数据

**主要步骤**:
1. 加载PDF文档（`pdfjs.getDocument()`）
2. 提取元数据（标题、作者等）
3. 逐页处理：
   - 获取页面文本内容（`page.getTextContent()`）
   - 检测并移除页码
   - 提取字体信息
   - 将文本项转换为`TextItem`对象，包含：
     - 坐标位置（x, y）
     - 尺寸（width, height）
     - 文本内容
     - 字体名称

**输出**: `ParseResult`对象，包含：
- `pages`: Page[] - 每页包含TextItem数组
- `fonts`: 字体映射表
- `metadata`: PDF元数据

### 阶段二：文本项转换（TextItem Transformations）

#### 2.1 计算全局统计信息（`CalculateGlobalStats`）

**功能**: 分析整个文档的字体和布局特征，为后续转换提供基准值

**统计内容**:
- `mostUsedHeight`: 最常用的文本高度（作为正文高度基准）
- `mostUsedFont`: 最常用的字体（作为正文字体基准）
- `mostUsedDistance`: 最常用的行间距
- `maxHeight`: 最大文本高度（用于识别标题）
- `fontToFormats`: 字体到格式的映射（粗体、斜体等）

**算法**:
- 统计所有TextItem的高度、字体出现频率
- 计算相邻文本项之间的垂直距离
- 根据字体名称推断格式（bold、italic等）

#### 2.2 合并为行（`CompactLines`）

**功能**: 将同一水平线上的TextItem合并为LineItem

**实现**:
- 使用`TextItemLineGrouper`按Y坐标分组
- 使用`LineConverter`将同一行的文本项合并
- 处理格式化文本（粗体、斜体）
- 检测脚注和链接

**输出**: Page.items从TextItem[]变为LineItem[]

### 阶段三：行项转换（LineItem Transformations）

#### 3.1 压缩行（`CompactLines`）

已在阶段二完成，将TextItem合并为LineItem。

#### 3.2 移除重复元素（`RemoveRepetitiveElements`）

**功能**: 识别并移除页眉、页脚等重复出现的元素

#### 3.3 垂直转水平（`VerticalToHorizontal`）

**功能**: 处理垂直排列的文本，转换为水平排列

#### 3.4 检测目录（`DetectTOC`）

**功能**: 识别PDF中的目录页，提取标题层级信息

**用途**: 为后续标题检测提供参考

#### 3.5 检测标题（`DetectHeaders`）

**功能**: 识别文档中的各级标题（H1-H6）

**检测策略**:

1. **基于最大高度的标题页检测**:
   - 找到包含最大高度文本的页面（通常是封面）
   - 最大高度 → H1
   - 次大高度 → H2

2. **基于目录的标题检测**（如果存在目录）:
   - 使用目录中提取的标题高度范围
   - 匹配相同高度的文本项

3. **基于高度的标题分类**（无目录时）:
   - 收集所有大于正文高度的文本项
   - 按高度降序排序
   - 分配标题级别（H2-H6）

4. **基于格式的标题检测**:
   - 检测全大写文本
   - 检测不同字体的文本
   - 检测有明显间距的文本

**输出**: LineItem.type被设置为相应的BlockType（H1-H6）

#### 3.6 检测列表项（`DetectListItems`）

**功能**: 识别无序列表和有序列表

**检测规则**:
- 以`-`、`•`等字符开头的行 → 无序列表
- 以数字开头的行（如"1. "、"2. "） → 有序列表
- 统一转换为Markdown列表格式

**输出**: LineItem.type被设置为`BlockType.LIST`

### 阶段四：块级转换（LineItemBlock Transformations）

#### 4.1 收集块（`GatherBlocks`）

**功能**: 将相关的LineItem组合成LineItemBlock

**合并规则**:
- 相同类型的行合并到同一块
- 根据行间距判断是否属于同一块
- 考虑缩进情况（列表项通常有缩进）

**判断逻辑**:
- 如果行间距超过阈值 → 新块
- 如果类型不同 → 新块
- 如果类型相同且允许合并 → 合并到当前块

#### 4.2 检测代码/引用块（`DetectCodeQuoteBlocks`）

**功能**: 识别代码块和引用块

#### 4.3 检测列表层级（`DetectListLevels`）

**功能**: 识别嵌套列表的层级关系

### 阶段五：文本块转换（`ToTextBlocks`）

**功能**: 将LineItemBlock转换为文本块对象

**转换**:
- 提取块的类别（category）
- 使用`blockToText()`将块转换为文本
- 保留块的类型信息

### 阶段六：Markdown生成（`ToMarkdown`）

**功能**: 将文本块转换为最终的Markdown字符串

**处理逻辑**:
1. 遍历每个页面的所有块
2. 根据块类型应用相应的Markdown格式：
   - **标题块**: 添加`#`前缀（H1-H6）
   - **列表块**: 保持列表格式
   - **代码块**: 添加```包裹
   - **目录块**: 保持原格式
   - **段落块**: 普通文本，添加换行
3. 处理文本中的换行和空格
4. 合并同一块内的文本

**输出**: 每页生成一个Markdown字符串，最终返回`string[]`

## 核心数据结构

### ParseResult
```javascript
{
  pages: Page[],      // 页面数组
  globals: {},        // 全局统计信息
  messages: []        // 转换过程中的消息（用于调试）
}
```

### Page
```javascript
{
  index: number,      // 页面索引
  items: PageItem[]   // 页面项（TextItem/LineItem/LineItemBlock）
}
```

### TextItem
```javascript
{
  x, y, width, height,  // 位置和尺寸
  text: string,         // 文本内容
  font: string,         // 字体名称
  lineFormat,           // 行格式
  annotation            // 标注（用于调试）
}
```

### LineItem
```javascript
{
  x, y, width, height,  // 位置和尺寸
  words: Word[],        // 单词数组
  type: BlockType,      // 块类型（标题、列表等）
  annotation            // 标注
}
```

### LineItemBlock
```javascript
{
  items: LineItem[],    // 行项数组
  type: BlockType,      // 块类型
  parsedElements        // 解析出的元素（链接、脚注等）
}
```

## 转换管道

转换过程通过`transformations.js`中的管道执行：

```javascript
const transformations = [
  CalculateGlobalStats,      // 计算全局统计
  CompactLines,              // 合并为行
  RemoveRepetitiveElements,  // 移除重复元素
  VerticalToHorizontal,      // 垂直转水平
  DetectTOC,                 // 检测目录
  DetectHeaders,             // 检测标题
  DetectListItems,           // 检测列表
  GatherBlocks,              // 收集块
  DetectCodeQuoteBlocks,     // 检测代码块
  DetectListLevels,          // 检测列表层级
  ToTextBlocks,              // 转换为文本块
  ToMarkdown                 // 生成Markdown
]
```

每个转换步骤：
1. 接收`ParseResult`作为输入
2. 修改`pages`中的`items`
3. 可选地更新`globals`和`messages`
4. 返回新的`ParseResult`

## 关键算法

### 标题检测算法

1. **高度分析**: 统计所有文本项的高度，找出异常大的高度值
2. **字体分析**: 识别与正文不同的字体
3. **位置分析**: 检测有明显间距的文本（可能是标题）
4. **格式分析**: 检测全大写文本
5. **目录辅助**: 如果存在目录，使用目录中的标题信息

### 列表检测算法

1. **前缀检测**: 识别以列表标记开头的行（`-`、`•`、数字等）
2. **缩进分析**: 根据缩进判断列表层级
3. **格式统一**: 将各种列表标记统一为Markdown格式

### 块合并算法

1. **距离判断**: 计算相邻行的垂直距离
2. **类型匹配**: 相同类型的行优先合并
3. **缩进考虑**: 考虑水平位置（缩进）的影响
4. **类型规则**: 根据块类型决定是否允许合并

## 优势与特点

1. **渐进式转换**: 通过多个步骤逐步细化，每个步骤专注于特定任务
2. **统计驱动**: 基于文档整体统计信息进行智能判断
3. **类型识别**: 自动识别标题、列表、代码块等Markdown元素
4. **格式保留**: 保留粗体、斜体等文本格式
5. **可扩展性**: 转换步骤易于添加和修改

## 局限性

1. **复杂布局**: 对于复杂的多栏布局可能处理不够准确
2. **表格处理**: 不支持表格的自动识别和转换
3. **图片处理**: 不处理图片内容
4. **字体依赖**: 标题检测依赖字体和高度信息，某些PDF可能不准确

## 使用示例

```javascript
const pdf2md = require('node-pdf-to-markdown')
const fs = require('fs')

const pdfBuffer = fs.readFileSync('document.pdf')
const markdownPages = await pdf2md(pdfBuffer)

// markdownPages 是 string[]，每个元素是一页的Markdown文本
console.log(markdownPages.join('\n\n---\n\n'))
```

## 总结

本项目的PDF转Markdown转换器采用**管道式架构**，通过**数据模型逐步演进**的方式，将PDF的底层文本数据转换为结构化的Markdown文档。核心思想是：

1. **先解析后理解**: 先提取所有文本和位置信息
2. **统计驱动**: 基于文档整体特征进行智能判断
3. **逐步细化**: 从字词→行→块→Markdown，逐步增加结构信息
4. **类型识别**: 自动识别文档中的各种元素类型

这种设计使得转换过程既灵活又可扩展，能够处理大多数常见的PDF文档格式。

