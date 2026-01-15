# Unicode 规范化修复说明

## 🐛 问题描述

PDF解析时，某些中文字符会变成异体字（兼容字符），导致：
- `⼊` (U+2F0A, CJK兼容汉字) ≠ `入` (U+5165, 标准汉字)
- `⼤` (U+2F0A) ≠ `大` (U+5927)
- 影响后续所有统计（字体使用、字宽、分词等）

## ✅ 解决方案

### 实现位置
**文件**: `build/util/pdf.js`

**关键代码**:
```javascript
/**
 * Normalize Unicode text using NFKC (Normalization Form Compatibility Composition).
 */
function normalizeText(str) {
    if (typeof str !== 'string') {
        return str
    }
    return str.normalize('NFKC')
}

// 在创建 TextItem 时使用
text: normalizeText(item.str) // ★ 最早阶段规范化
```

### 为什么选择 NFKC？

| 规范化形式 | 处理兼容字符 | 推荐场景 |
|-----------|------------|---------|
| NFC | ❌ 不处理 | 一般文本 |
| NFD | ❌ 不处理 | 字符分解 |
| **NFKC** | ✅ **会处理** | **PDF文本（推荐）** |
| NFKD | ✅ 会处理 | 字符分解+兼容处理 |

**NFKC 的优势**:
- ✅ 处理兼容字符（⼊ → 入）
- ✅ 全角转半角
- ✅ 标准化等价字符
- ✅ 保持组合形式（Composition）

### 为什么必须在最早阶段做？

```
PDF解析 → TextItem.text (★ 在这里规范化)
    ↓
后续所有处理：
    - 字体统计 (CalculateGlobalStats)
    - 字宽计算 (fontToWidthStats)
    - 标题检测 (DetectHeaders)
    - 文本合并 (CompactLines)
    - Markdown生成 (ToMarkdown)
```

**如果在后续阶段做**:
- ❌ 字体统计会被污染（同一字的不同变体被统计为不同字体）
- ❌ 字宽计算不准确（兼容字符宽度可能不同）
- ❌ 标题检测受影响（文本匹配失败）

## 📊 处理效果

### 修复前
```
"如何为你的程序接⼊⼤模型"  // ⼊ (U+2F0A), ⼤ (U+2F0A)
```

### 修复后
```
"如何为你的程序接入大模型"  // 入 (U+5165), 大 (U+5927)
```

## 🧪 测试验证

可以测试以下兼容字符：

| 兼容字符 | 标准字符 | Unicode码点 |
|---------|---------|------------|
| ⼊ | 入 | U+2F0A → U+5165 |
| ⼤ | 大 | U+2F0A → U+5927 |
| Ａ | A | U+FF21 → U+0041 |
| １ | 1 | U+FF11 → U+0031 |

## 📝 相关文档

- Unicode Normalization: https://unicode.org/reports/tr15/
- NFKC 规范: https://unicode.org/reports/tr15/#Norm_Forms
- CJK 兼容字符: https://unicode.org/charts/PDF/U2F00.pdf

---

**修复时间**: 2024
**修复位置**: `build/util/pdf.js` (PDF解析阶段)
**规范化形式**: NFKC (Normalization Form Compatibility Composition)

