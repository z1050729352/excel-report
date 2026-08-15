# 烟草订货管理系统

一款基于 Vue 3 + Node.js 的烟草订货管理系统，采用前后端分离架构，支持 PC 端和移动端 H5 访问。系统包含管理后台和商户端两个应用，实现商户信息管理、货源投放策略管理、智能订货方案推荐等功能。

## 功能特性

### 管理后台
- **商户信息管理**：支持上传商户信息表，查询、查看商户详情
- **货源投放策略管理**：上传投放策略，自动应用到订货推荐
- **数据更变管理**：支持上传更变表，批量更新商户数据
- **报表管理**：查看和导出订货报表

### 商户端
- **商户信息查询**：输入商户号查看自己的基本信息
- **预算订货**：输入预算金额，智能推荐最优订货方案
- **订单管理**：查看历史订单记录
- **方案导出**：一键生成订货方案图片并保存

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端框架 | Node.js + Express |
| 数据库 | MySQL 8.0 |
| 前端框架 | Vue 3 (Composition API) + Vite |
| UI 组件库 | Element Plus |
| 状态管理 | Pinia |
| Excel 解析 | SheetJS (xlsx) |
| 容器化 | Docker Compose |

## 快速开始

### 环境要求

- Node.js >= 22.0.0
- Docker (用于运行 MySQL)
- npm >= 10

### 1. 安装依赖

```bash
# 在项目根目录
npm run install:all
```

### 2. 启动数据库

```bash
npm run docker:up
```

### 3. 启动服务

```bash
# 同时启动前后端（推荐）
npm run dev

# 或分别启动
npm run dev:backend  # 后端：http://localhost:3001
npm run dev:frontend # 前端：http://localhost:3000
```

### 4. 访问应用

- **商户端**：http://localhost:3000/
- **管理后台**：http://localhost:3000/admin.html
- **管理员账号**：admin / admin123

## 项目结构

```
tobacco-order-system/
├── backend/                 # 后端服务
│   ├── src/
│   │   ├── app.js          # Express 应用入口
│   │   ├── config/         # 配置文件
│   │   ├── middleware/     # 中间件（认证、文件上传等）
│   │   ├── models/         # 数据库模型
│   │   ├── routes/         # 路由（admin, auth, merchant）
│   │   └── services/       # 业务逻辑（Excel解析、算法优化等）
│   └── package.json
├── frontend/               # 前端应用
│   ├── src/
│   │   ├── admin/         # 管理后台
│   │   │   ├── views/     # 页面组件
│   │   │   ├── router/    # 路由配置
│   │   │   └── layouts/   # 布局组件
│   │   ├── client/        # 商户端
│   │   │   ├── views/     # 页面组件
│   │   │   ├── router/    # 路由配置
│   │   │   ├── stores/    # Pinia 状态
│   │   │   └── layouts/   # 布局组件
│   │   └── shared/        # 共享模块
│   │       ├── api/       # API 请求封装
│   │       └── utils/     # 工具函数
│   ├── admin.html         # 管理后台入口
│   ├── index.html         # 商户端入口
│   └── package.json
├── data/                   # 数据目录
│   ├── 货源投放策略7.23.xls
│   ├── 烟草进价零售价毛利表.xlsx
│   └── reports/           # 报表存储
├── database/              # 数据库脚本
│   └── init.sql          # 初始化 SQL
├── docker-compose.yml    # Docker 配置
└── package.json         # 根配置（workspaces）
```

## 开发指南

### 数据库管理

```bash
# 启动数据库
npm run docker:up

# 停止数据库
npm run docker:down

# 查看日志
npm run docker:logs
```

### 构建部署

```bash
# 构建前后端
npm run build

# 启动生产环境
npm run start:backend
npm run start:frontend
```

## 核心算法

系统内置智能订货算法，基于商户预算和货源投放策略，自动计算：
- 档位优化（Class A/B/C 分层推荐）
- 毛利最大化
- 销售金额与预算匹配
- 品牌多样性平衡

详见 `backend/src/services/optimizer.js`

## 环境变量

### 后端 (backend/.env)
```env
PORT=3001
DB_HOST=localhost
DB_PORT=3307
DB_USER=root
DB_PASSWORD=tobacco123
DB_NAME=tobacco_order
JWT_SECRET=your-secret-key
```

### 前端 (frontend/.env.development)
```env
VITE_API_BASE_URL=http://localhost:3001
```

## License

MIT
