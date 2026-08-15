# 🚀 烟草订货管理系统 - 快速启动指南

## 📋 启动步骤

### Step 1: 启动 MySQL 数据库

```bash
# 进入项目目录
cd /Users/zhubaodong/Documents/fullStackWay2026/excel-report

# 启动 MySQL 容器
docker-compose up -d

# 检查容器状态
docker-compose ps

# 查看日志（可选）
docker-compose logs -f mysql
```

✅ 看到 MySQL 容器状态为 `running` 即成功。

---

### Step 2: 安装后端依赖并启动

```bash
# 进入后端目录
cd backend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

✅ 看到以下输出即成功：

```
🚀 烟草订货管理系统 - 后端服务启动成功
📡 服务地址: http://localhost:3000
🗄️  数据库: MySQL localhost:3307/tobacco_order
```

---

### Step 3: 测试后端 API

打开新终端，测试 API：

```bash
# 1. 健康检查
curl http://localhost:3000/api/health

# 2. 管理员登录（获取 token）
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# 复制返回的 token，替换下面的 YOUR_TOKEN

# 3. 查询统计数据
curl http://localhost:3000/api/admin/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

✅ 所有接口返回 `"success": true` 即成功。

---

## 📊 数据库信息

| 项目 | 值 |
|------|-----|
| 主机 | localhost |
| 端口 | 3307 |
| 数据库 | tobacco_order |
| 用户名 | tobacco |
| 密码 | tobacco123 |
| Root密码 | root123456 |

### 使用 MySQL 客户端连接

```bash
# 方式1: 本地连接
mysql -h 127.0.0.1 -P 3307 -u tobacco -p
# 输入密码: tobacco123

# 方式2: Docker 进入
docker exec -it tobacco-mysql mysql -u tobacco -p tobacco_order
# 输入密码: tobacco123
```

### 查看数据表

```sql
USE tobacco_order;
SHOW TABLES;
```

应该看到以下表：
- users (管理员表)
- merchants (商户表)
- products (货源表)
- seg_caps (段位配额表)
- changes (信息更变表)
- query_logs (查询日志表)

---

## 🧪 Postman 测试集合

### 1. 管理员登录

```
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

### 2. 查询统计数据（需要 token）

```
GET http://localhost:3000/api/admin/stats
Authorization: Bearer YOUR_TOKEN
```

### 3. 导入商户信息表

```
POST http://localhost:3000/api/admin/import/merchants
Authorization: Bearer YOUR_TOKEN
Content-Type: multipart/form-data

file: [选择 Excel 文件]
```

### 4. 导入货源表

```
POST http://localhost:3000/api/admin/import/products
Authorization: Bearer YOUR_TOKEN
Content-Type: multipart/form-data

file: [选择 Excel 文件]
```

### 5. 商户查询（C端，无需登录）

```
GET http://localhost:3000/api/merchant/商户号
```

### 6. 生成订货方案（C端，无需登录）

```
POST http://localhost:3000/api/merchant/plan
Content-Type: application/json

{
  "licenseNo": "商户号",
  "budget": 50000
}
```

---

## 📁 现有数据文件

项目中已有一个毛利表，位置：
```
/Users/zhubaodong/Documents/fullStackWay2026/excel-report/src/烟草进价零售价毛利表.xlsx
```

后续建议整理到：
```
/Users/zhubaodong/Documents/fullStackWay2026/excel-report/data/
```

---

## 🛠️ 常用命令

```bash
# 查看 Docker 容器状态
docker-compose ps

# 查看 MySQL 日志
docker-compose logs mysql

# 重启 MySQL
docker-compose restart

# 停止所有容器
docker-compose down

# 停止并删除数据卷（慎用，会清空数据）
docker-compose down -v

# 后端热重载开发
cd backend && npm run dev

# 后端生产启动
cd backend && npm start
```

---

## ⚠️ 故障排查

### 问题1: MySQL 连接失败

```bash
# 检查容器状态
docker-compose ps

# 如果未启动，重新启动
docker-compose up -d

# 查看日志
docker-compose logs mysql
```

### 问题2: 端口被占用

```bash
# 查看占用端口的进程
lsof -ti:3000  # 后端
lsof -ti:3307  # MySQL

# 杀死进程
lsof -ti:3000 | xargs kill -9
```

### 问题3: 后端报错

```bash
# 检查环境变量
cat backend/.env

# 重新安装依赖
cd backend
rm -rf node_modules package-lock.json
npm install
```

---

## ✅ 后端完成情况

✅ MySQL 数据库配置（Docker）  
✅ 数据库表结构（自动初始化）  
✅ JWT 认证系统  
✅ 管理员登录/登出  
✅ 商户查询接口（C端）  
✅ 订货方案生成（核心算法）  
✅ 商户列表（分页+搜索）  
✅ 数据导入（商户/货源/更变表）  
✅ 信息更变管理  
✅ 统计数据接口  

---

## 🎯 下一步：前端开发

后端已完成，可以开始开发前端了！

前端技术栈：
- Vue 3 + Vite
- Vant 4（商户端 H5）
- Element Plus（管理员端）
- 统一路由（/admin/* 管理端，其他商户端）

你现在可以：
1. 先测试后端 API 是否正常
2. 导入测试数据（商户表、货源表）
3. 测试商户查询和方案生成
4. 确认无误后，我开始开发前端

**告诉我后端测试结果，我马上开始前端开发！** 🚀
