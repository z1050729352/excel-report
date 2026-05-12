# Excel 报告生成器

一款基于 Electron + Vue 3 的桌面应用，用于快速分析 Excel 数据并生成可视化 PDF 报告。内置 AI 智能分析能力（智谱 GLM-4-Flash），支持自动生成执行摘要、深度洞察和数据问答。

## 功能特性

- **Excel 解析**：支持 `.xlsx`、`.xls`、`.csv` 格式，拖拽或点击上传
- **多维度统计分析**：自动识别数值列、分类列、时间列，计算均值/中位数/标准差/变异系数等
- **时间趋势**：按月/季度聚合，自动计算环比、同比增长率
- **分类分析**：按分类维度分组聚合，支持多维交叉分析
- **相关性分析**：皮尔逊相关系数矩阵
- **数据质量评估**：填充率、重复行检测、百分制评分
- **异常值检测**：基于 ±3σ 规则自动标记
- **AI 智能分析**：一键生成执行摘要、深度洞察，支持自然语言提问
- **PDF 报告导出**：基于 ECharts 图表渲染，导出 A4 格式 PDF

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Electron 33 + electron-vite |
| 前端 | Vue 3 (Composition API) |
| 图表 | ECharts 5 |
| Excel 解析 | SheetJS (xlsx) |
| AI | 智谱 GLM-4-Flash |
| 构建 | Vite 5 + electron-builder |

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建打包

```bash
# macOS
npm run build:mac

# Windows
npm run build:win
```

## 项目结构

```
src/
├── main/                # Electron 主进程
│   ├── index.js         # 主进程入口，IPC 通信，窗口管理
│   ├── analyzer.js      # 数据分析引擎（统计、趋势、分类、相关性等）
│   ├── aiAnalyzer.js    # AI 分析模块（调用智谱 GLM API）
│   └── aiConfig.js      # AI 配置（API Key、模型、端点）
├── preload/
│   └── index.js         # 预加载脚本，暴露 electronAPI 给渲染进程
└── renderer/
    ├── index.html       # 渲染进程入口 HTML
    └── src/
        ├── App.vue      # 主界面组件
        ├── main.js      # Vue 应用入口
        ├── report-template.html  # PDF 报告 HTML 模板
        └── assets/
            └── main.css # 全局样式
```

## 使用流程

1. 启动应用，拖入或选择 Excel 文件
2. 自动解析并展示数据概览、质量评分、统计指标
3. 切换 Tab 查看趋势、分类、洞察等维度
4. 点击「AI 智能分析」生成执行摘要或深度洞察
5. 点击「导出 PDF」生成完整分析报告

## AI 配置

默认使用智谱 GLM-4-Flash 模型。如需自定义 API Key，可设置环境变量：

```bash
export GLM_API_KEY=your_api_key_here
```

## License

MIT
