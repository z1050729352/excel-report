# 部署指南

## 目录结构（服务器上）

```
/var/www/
  game/          ← H5 小游戏静态文件
  smoking/       ← 本系统前端静态文件

/opt/tobacco/    ← Node.js 后端
  src/
  .env
  package.json
  node_modules/

/var/data/tobacco/
  tobacco.db     ← SQLite（如果用 SQLite）
  reports/
```

---

## 第一步：服务器环境

```bash
# 安装 Node.js 22
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
yum install -y nodejs

# 安装 PM2（进程守护）
npm install -g pm2

# 安装 Nginx
yum install -y nginx

# 安装 MySQL（如果后端用 MySQL）
# 或者用 docker-compose 直接起 MySQL 容器（推荐）
yum install -y docker docker-compose
```

---

## 第二步：本地构建前端

```bash
cd frontend
npm install
npm run build
```

构建产物在 `frontend/dist/`：
```
dist/
  index.html        ← 商户端入口（/smoking/）
  admin.html        ← 管理端入口（/smoking/admin.html）
  assets/           ← JS/CSS
```

---

## 第三步：上传文件

```bash
# 上传前端（替换 user@你的服务器IP）
scp -r frontend/dist/* user@服务器IP:/var/www/smoking/

# 上传小游戏（你自己原来的文件）
scp -r 你的游戏目录/* user@服务器IP:/var/www/game/

# 上传后端
scp -r backend/ user@服务器IP:/opt/tobacco/
```

---

## 第四步：服务器上启动后端

```bash
cd /opt/tobacco

# 安装依赖
npm install --production

# 配置环境变量
cp .env.example .env
vim .env   # 填写 DB 连接、JWT_SECRET 等

# 用 PM2 启动
pm2 start src/app.js --name tobacco-backend --interpreter node

# 开机自启
pm2 save
pm2 startup
```

---

## 第五步：配置 Nginx

```bash
# 上传 nginx 配置
scp deploy/nginx.conf user@服务器IP:/etc/nginx/conf.d/tobacco.conf

# 编辑配置，填入你的域名
vim /etc/nginx/conf.d/tobacco.conf

# 测试配置
nginx -t

# 重载
nginx -s reload
```

---

## 第六步：访问地址

| 页面 | 地址 |
|------|------|
| 商户端（H5） | `https://你的域名.com/smoking/` |
| 管理后台 | `https://你的域名.com/smoking/admin.html` |
| H5 小游戏 | `https://你的域名.com/game/` |

---

## Docker 启动 MySQL（推荐）

服务器上直接用 docker-compose：

```bash
cd /opt/tobacco
docker-compose up -d
```

确保 `docker-compose.yml` 里 MySQL 数据卷挂载到持久化目录，避免重启丢数据。

---

## 后续更新部署（前端）

```bash
# 本地重新构建
cd frontend && npm run build

# 上传覆盖
scp -r frontend/dist/* user@服务器IP:/var/www/smoking/
```

后端更新：

```bash
scp -r backend/src/ user@服务器IP:/opt/tobacco/src/
ssh user@服务器IP "pm2 restart tobacco-backend"
```
