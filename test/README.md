# 测试说明

## 批量转换工具

`batch-convert.js` 是一个自动化批量转换脚本，可以处理文件夹中的所有PDF文件。

### 使用方法

脚本会自动使用脚本所在目录（`test` 目录）作为工作目录，无需指定输入输出路径。

1. **准备测试文件**
   - 在 `test` 目录下创建 `test-pdfs` 文件夹（如果不存在，脚本会自动创建）
   - 将需要转换的PDF文件放入 `test/test-pdfs` 文件夹

2. **运行转换脚本**

```bash
# 不处理图片（默认）
node test/batch-convert.js

# 或使用 npm 脚本
npm run batch-convert

# Base64嵌入图片
node test/batch-convert.js --image-mode base64

# 返回图片映射表
node test/batch-convert.js --image-mode relative

# 保存图片到指定目录
node test/batch-convert.js --image-mode save --image-path ./images
```

### 目录结构

脚本使用以下目录结构（相对于 `test` 目录）：

```
test/
├── batch-convert.js    # 脚本文件
├── test-pdfs/          # 输入目录（放置PDF文件）
└── output/             # 输出目录（保存Markdown文件）
    └── images/         # 图片目录（仅当使用relative或save模式时）
```

### 参数说明

- `--image-mode <mode>`: 图片处理模式（可选）
  - `none`: 不处理图片（默认）
  - `base64`: 嵌入Base64编码
  - `relative`: 返回图片映射表，并保存到 `output/images/` 目录
  - `save`: 保存到指定路径
- `--image-path <path>`: 图片保存路径（仅当`--image-mode`为`save`时使用，相对于test目录）

### 输出结构

转换完成后，`test/output` 目录结构如下：

```
test/output/
├── document1.md
├── document2.md
└── images/          # 仅当使用relative或save模式时
    ├── document1/
    │   ├── document1_image1_p1.png
    │   └── document1_image2_p2.png
    └── document2/
        └── document2_image1_p1.png
```

### 注意事项

1. 图片命名规则：`{pdfTitle}_image{序号}_p{页码}.{格式}`
   - 使用PDF标题作为前缀，防止不同PDF的图片重名
   - 包含页码信息，便于定位

2. 如果PDF没有标题，会使用文件名作为前缀

3. 图片提取依赖于PDF的结构，某些PDF可能无法正确提取图片

4. 对于复杂的PDF布局，转换结果可能需要手动调整

