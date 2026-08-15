# 烟草订货管理系统 - 后端服务

## 快速启动

### 1. 启动 MySQL 数据库（Docker）

```bash
# 在项目根目录执行
cd /Users/zhubaodong/Documents/fullStackWay2026/excel-report
docker-compose up -d
```

查看数据库是否启动成功：
```bash
docker-compose ps
```

### 2. 安装依赖

```bash
cd backend
npm install
```

### 3. 启动后端服务

```bash
npm run dev
```

服务将在 `http://localhost:3000` 启动

---

## 数据库连接信息

- **Host**: localhost
- **Port**: 3307 (映射到容器的3306)
- **Database**: tobacco_order
- **Username**: tobacco
- **Password**: tobacco123
- **Root Password**: root123456

### 使用 MySQL 客户端连接

```bash
mysql -h 127.0.0.1 -P 3307 -u tobacco -p
# 输入密码: tobacco123
```

或使用 Docker 直接进入：
```bash
docker exec -it tobacco-mysql mysql -u tobacco -p tobacco_order
# 输入密码: tobacco123
```

---

## 默认管理员账号

- **用户名**: admin
- **密码**: admin123

---

## API 测试

### 1. 测试健康检查
```bash
curl http://localhost:3000/api/health
```

### 2. 测试登录
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

成功后会返回 token，复制 token 用于后续请求。

### 3. 测试查询统计（需要 token）
```bash
curl http://localhost:3000/api/admin/stats \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## 常用命令

```bash
# 启动开发服务器（热重载）
npm run dev

# 启动生产服务器
npm start

# 停止 MySQL 容器
docker-compose down

# 重启 MySQL 容器
docker-compose restart

# 查看 MySQL 日志
docker-compose logs mysql
```

---

## 目录结构

```
backend/
├── src/
│   ├── routes/          # 路由
│   │   ├── auth.js      # 认证路由
│   │   ├── merchant.js  # 商户路由（C端）
│   │   └── admin.js     # 管理员路由（B端）
│   ├── middleware/      # 中间件
│   │   ├── auth.js      # JWT 验证
│   │   └── upload.js    # 文件上传
│   ├── services/        # 业务逻辑
│   │   ├── optimizer.js    # 订货优化算法
│   │   ├── excelParser.js  # Excel 解析
│   │   └── tierUtils.js    # 档位工具
│   ├── models/
│   │   └── db.js        # 数据库连接
│   ├── config/
│   │   └── index.js     # 配置文件
│   └── app.js           # Express 入口
├── .env                 # 环境变量
├── package.json
└── README.md
```

---

## 环境变量说明

编辑 `.env` 文件修改配置：

```env
# 服务器端口
PORT=3000

# 数据库配置
DB_HOST=localhost
DB_PORT=3307
DB_USER=tobacco
DB_PASSWORD=tobacco123
DB_NAME=tobacco_order

# JWT 密钥（生产环境必须修改）
JWT_SECRET=tobacco-jwt-secret-key-2024
JWT_EXPIRES_IN=7d

# 文件上传限制（20MB）
MAX_FILE_SIZE=20971520
```

---

## 故障排查

### 问题1: 数据库连接失败

检查 MySQL 容器是否启动：
```bash
docker-compose ps
```

如果未启动，执行：
```bash
docker-compose up -d
```

### 问题2: 端口被占用

修改 `.env` 中的 PORT 或停止占用端口的程序：
```bash
lsof -ti:3000 | xargs kill -9
```

### 问题3: npm install 失败

尝试清除缓存：
```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```
