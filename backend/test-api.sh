#!/bin/bash

# 烟草订货系统 - API 测试脚本

echo "=================================="
echo "🧪 开始测试后端 API"
echo "=================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

API_BASE="http://localhost:3000"

# 1. 健康检查
echo "1️⃣  测试健康检查..."
response=$(curl -s "$API_BASE/api/health")
if echo "$response" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ 健康检查通过${NC}"
else
  echo -e "${RED}❌ 健康检查失败${NC}"
  echo "$response"
  exit 1
fi
echo ""

# 2. 管理员登录
echo "2️⃣  测试管理员登录..."
login_response=$(curl -s -X POST "$API_BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')

if echo "$login_response" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ 登录成功${NC}"
  TOKEN=$(echo "$login_response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
  echo -e "${YELLOW}🔑 Token: ${TOKEN:0:50}...${NC}"
else
  echo -e "${RED}❌ 登录失败${NC}"
  echo "$login_response"
  exit 1
fi
echo ""

# 3. 查询统计数据
echo "3️⃣  测试查询统计数据..."
stats_response=$(curl -s "$API_BASE/api/admin/stats" \
  -H "Authorization: Bearer $TOKEN")

if echo "$stats_response" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ 查询统计数据成功${NC}"
  echo "$stats_response" | python3 -m json.tool 2>/dev/null || echo "$stats_response"
else
  echo -e "${RED}❌ 查询统计数据失败${NC}"
  echo "$stats_response"
fi
echo ""

# 4. 查询商户列表
echo "4️⃣  测试查询商户列表（分页）..."
merchants_response=$(curl -s "$API_BASE/api/admin/merchants?page=1&pageSize=10" \
  -H "Authorization: Bearer $TOKEN")

if echo "$merchants_response" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ 查询商户列表成功${NC}"
  echo "$merchants_response" | python3 -m json.tool 2>/dev/null || echo "$merchants_response"
else
  echo -e "${RED}❌ 查询商户列表失败${NC}"
  echo "$merchants_response"
fi
echo ""

# 5. 测试商户查询（无需登录）
echo "5️⃣  测试商户查询接口（C端，输入一个不存在的商户号）..."
merchant_response=$(curl -s "$API_BASE/api/merchant/TEST123456")

if echo "$merchant_response" | grep -q '"success":false'; then
  echo -e "${GREEN}✅ 商户查询接口正常（符合预期：商户不存在）${NC}"
else
  echo -e "${YELLOW}⚠️  意外结果${NC}"
  echo "$merchant_response"
fi
echo ""

echo "=================================="
echo -e "${GREEN}🎉 后端 API 测试完成！${NC}"
echo "=================================="
echo ""
echo "📝 下一步："
echo "  1. 导入测试数据（商户信息表、货源表）"
echo "  2. 测试商户查询和订货方案生成"
echo "  3. 开始前端开发"
echo ""
