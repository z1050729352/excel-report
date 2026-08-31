<template>
  <div class="home-page">
    <!-- 顶栏 -->
    <div class="top-bar">
      <div class="top-bar-inner">
        <div class="logo">
          <span class="logo-icon">🚬</span>
          <span class="logo-text">烟草订货方案</span>
        </div>
      </div>
    </div>

    <div class="page-body">

      <!-- Step 1：输入许可证号 -->
      <div class="card query-card">
        <div class="card-title">输入许可证号</div>
        <div class="query-row">
          <el-input
            v-model="licenseNo"
            placeholder="请输入您的许可证号"
            size="large"
            clearable
            :disabled="planLoading"
            @keyup.enter="queryMerchant"
          />
          <el-button
            type="primary"
            size="large"
            :loading="queryLoading"
            @click="queryMerchant"
          >
            查询
          </el-button>
        </div>
        <div v-if="queryError" class="error-tip">{{ queryError }}</div>
      </div>

      <!-- Step 2：商户信息 + 预算输入 -->
      <transition name="slide-up">
        <div v-if="merchant" class="card merchant-card">
          <div class="card-title">商户信息</div>
          <div class="merchant-grid">
            <div class="merchant-item">
              <span class="mi-label">客户名称</span>
              <span class="mi-value">{{ merchant.customer_name || '-' }}</span>
            </div>
            <div class="merchant-item">
              <span class="mi-label">许可证号</span>
              <span class="mi-value">{{ merchant.license_no }}</span>
            </div>
            <div class="merchant-item">
              <span class="mi-label">档位</span>
              <span class="mi-value">
                <el-tag type="warning" size="small">{{ merchant.tier || '-' }}</el-tag>
              </span>
            </div>
            <div class="merchant-item">
              <span class="mi-label">诚信等级</span>
              <span class="mi-value">
                <el-tag size="small">{{ merchant.credit_level || '-' }}</el-tag>
              </span>
            </div>
            <div class="merchant-item">
              <span class="mi-label">可选货源</span>
              <span class="mi-value accent">{{ productCount }} 种</span>
            </div>
            <div class="merchant-item">
              <span class="mi-label">默认预算</span>
              <span class="mi-value">¥{{ formatNum(merchant.budget || 50000) }}</span>
            </div>
          </div>

          <!-- 预算输入 -->
          <div class="budget-area">
            <div class="budget-label">本次订货预算（元）</div>
            <div class="budget-row">
              <el-input-number
                v-model="budget"
                :min="3000"
                :max="9999999"
                :step="1000"
                :precision="0"
                size="large"
                controls-position="right"
                style="width: 100%"
              />
            </div>
            <!-- 快捷金额 -->
            <div class="quick-amounts">
              <el-button
                v-for="amt in quickAmounts"
                :key="amt"
                size="small"
                :type="budget === amt ? 'primary' : ''"
                plain
                @click="budget = amt"
              >
                ¥{{ formatNum(amt) }}
              </el-button>
            </div>
            <el-button
              type="primary"
              size="large"
              style="width: 100%; margin-top: 16px"
              :loading="planLoading"
              @click="generatePlan"
            >
              {{ planLoading ? '计算中...' : '生成最优订货方案' }}
            </el-button>
          </div>
        </div>
      </transition>

      <!-- Step 3：订货方案结果 -->
      <transition name="slide-up">
        <div v-if="plan" class="card result-card">
          <div class="card-title">
            订货方案
            <span class="result-badge">{{ plan.items.length }} 种货</span>
          </div>

          <!-- 汇总数据 -->
          <div class="summary-grid">
            <div class="summary-item">
              <div class="summary-val">¥{{ formatNum(plan.totalCost) }}</div>
              <div class="summary-key">实际花费</div>
            </div>
            <div class="summary-item">
              <div class="summary-val accent">¥{{ formatNum(plan.totalProfit) }}</div>
              <div class="summary-key">预计毛利</div>
            </div>
            <div class="summary-item">
              <div class="summary-val">{{ plan.marginRate }}%</div>
              <div class="summary-key">综合利润率</div>
            </div>
            <div class="summary-item">
              <div class="summary-val muted">¥{{ formatNum(plan.remainingBudget) }}</div>
              <div class="summary-key">剩余预算</div>
            </div>
          </div>

          <!-- 货品明细 -->
          <div v-if="plan.items.length > 0" class="items-list">
            <div
              v-for="(item, idx) in plan.items"
              :key="idx"
              class="item-row"
            >
              <div class="item-left">
                <div class="item-name">{{ item.product_name }}</div>
                <div class="item-meta">
                  <span v-if="item.seg" class="seg-tag">{{ item.seg }}</span>
                  <span>进价 ¥{{ item.cost_price }}/条</span>
                  <span>零售 ¥{{ item.sell_price }}/条</span>
                  <span class="profit-hint">毛利 ¥{{ item.profit }}/条</span>
                </div>
              </div>
              <div class="item-right">
                <div class="item-qty">× {{ item.quantity }} 条</div>
                <div class="item-subtotal">¥{{ formatNum(item.subtotal) }}</div>
                <div class="item-profit">+¥{{ formatNum(item.subtotalProfit) }}</div>
              </div>
            </div>
          </div>

          <div v-else class="empty-tip">
            该档位暂无可订货源，请联系客服
          </div>

          <!-- 经营策略建议 -->
          <div v-if="strategy && strategy.suggestions && strategy.suggestions.length" class="strategy-block">
            <div class="strategy-title">
              <span class="strategy-icon">💡</span>
              经营策略建议
            </div>
            <p class="strategy-summary">{{ strategy.summary }}</p>
            <ul class="strategy-list">
              <li v-for="(s, i) in strategy.suggestions" :key="i">{{ s }}</li>
            </ul>
          </div>

          <!-- 操作按钮 -->
          <div class="result-actions">
            <el-button
              type="primary"
              size="large"
              style="flex: 1"
              :loading="capturing"
              @click="generateImage"
            >
              {{ capturing ? '生成中...' : '📷 生成图片' }}
            </el-button>
            <el-button size="large" style="flex: 1" @click="resetAll">
              重新查询
            </el-button>
          </div>
        </div>
      </transition>

    </div>

    <!-- 截图用的离屏卡片（渲染在屏幕外） -->
    <div class="offscreen-wrap">
      <div ref="shareCardRef" class="share-card">
        <div class="sc-header">
          <span class="sc-logo">🚬 烟草订货方案</span>
          <span class="sc-date">{{ today }}</span>
        </div>

        <div v-if="merchant && plan" class="sc-merchant">
          <div class="sc-name">{{ merchant.customer_name }}</div>
          <div class="sc-sub">{{ merchant.license_no }} · {{ merchant.tier }} · 诚信{{ merchant.credit_level }}</div>
        </div>

        <div v-if="plan" class="sc-summary">
          <div class="sc-sum-item">
            <div class="sc-sum-val">¥{{ formatNum(plan.totalCost) }}</div>
            <div class="sc-sum-key">实际花费</div>
          </div>
          <div class="sc-sum-item">
            <div class="sc-sum-val accent">¥{{ formatNum(plan.totalProfit) }}</div>
            <div class="sc-sum-key">预计毛利</div>
          </div>
          <div class="sc-sum-item">
            <div class="sc-sum-val">{{ plan.marginRate }}%</div>
            <div class="sc-sum-key">综合利润率</div>
          </div>
          <div class="sc-sum-item">
            <div class="sc-sum-val muted">¥{{ formatNum(budget) }}</div>
            <div class="sc-sum-key">本次预算</div>
          </div>
        </div>

        <div v-if="plan" class="sc-items">
          <div class="sc-item-header">
            <span>货品名称</span>
            <span>数量</span>
            <span>小计</span>
            <span>毛利</span>
          </div>
          <div
            v-for="(item, i) in plan.items"
            :key="i"
            class="sc-item-row"
            :class="{ odd: i % 2 === 0 }"
          >
            <span class="sc-item-name">{{ item.product_name }}</span>
            <span>{{ item.quantity }}条</span>
            <span>¥{{ formatNum(item.subtotal) }}</span>
            <span class="green">+¥{{ formatNum(item.subtotalProfit) }}</span>
          </div>
        </div>

        <div v-if="strategy && strategy.suggestions && strategy.suggestions.length" class="sc-strategy">
          <div class="sc-strategy-title">💡 经营策略建议</div>
          <div
            v-for="(s, i) in strategy.suggestions"
            :key="i"
            class="sc-strategy-item"
          >{{ s }}</div>
        </div>

        <div class="sc-footer">本方案由系统算法自动生成，仅供参考</div>
      </div>
    </div>

    <!-- 图片预览弹层 -->
    <div v-if="previewImg" class="img-preview-mask" @click.self="previewImg = null">
      <div class="img-preview-box">
        <p class="img-tip">长按图片保存 📥</p>
        <img :src="previewImg" class="preview-img" />
        <el-button style="width: 100%; margin-top: 12px" @click="previewImg = null">关闭</el-button>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import html2canvas from 'html2canvas'
import request from '@/shared/api/request'

const licenseNo = ref('')
const queryLoading = ref(false)
const planLoading = ref(false)
const queryError = ref('')

const merchant = ref(null)
const productCount = ref(0)
const budget = ref(50000)
const plan = ref(null)
const strategy = ref(null)

const capturing = ref(false)
const previewImg = ref(null)
const shareCardRef = ref(null)

const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })

const quickAmounts = [10000, 30000, 50000, 100000, 200000]

const formatNum = (n) => {
  return Number(n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const queryMerchant = async () => {
  const no = licenseNo.value.trim()
  if (!no) {
    queryError.value = '请输入许可证号'
    return
  }
  queryError.value = ''
  queryLoading.value = true
  plan.value = null
  merchant.value = null

  try {
    const res = await request.get(`/merchant/${no}`)
    if (res.success) {
      merchant.value = res.merchant
      productCount.value = res.productCount || 0
      // 默认预算使用商户档案里的 budget
      budget.value = Number(res.merchant.budget) || 50000
    } else {
      queryError.value = res.error || '查询失败'
    }
  } catch (err) {
    queryError.value = err.message || '查询失败，请稍后重试'
  } finally {
    queryLoading.value = false
  }
}

const generatePlan = async () => {
  if (!merchant.value) return
  if (!budget.value || budget.value < 3000) {
    ElMessage.warning('预算不能低于 3000 元')
    return
  }

  planLoading.value = true
  plan.value = null
  strategy.value = null

  try {
    const res = await request.post('/merchant/plan', {
      licenseNo: licenseNo.value.trim(),
      budget: budget.value
    })
    if (res.success) {
      plan.value = res.orderPlan
      strategy.value = res.businessStrategy || null
      if (res.orderPlan.items.length === 0) {
        ElMessage.info(res.orderPlan.summary || '该档位暂无可订货源')
      }
    } else {
      ElMessage.error(res.error || '生成方案失败')
    }
  } catch (err) {
    ElMessage.error(err.message || '生成方案失败，请稍后重试')
  } finally {
    planLoading.value = false
  }
}

const resetAll = () => {
  licenseNo.value = ''
  merchant.value = null
  plan.value = null
  strategy.value = null
  queryError.value = ''
  budget.value = 50000
}

const generateImage = async () => {
  if (!shareCardRef.value) return
  capturing.value = true
  try {
    const canvas = await html2canvas(shareCardRef.value, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false
    })
    previewImg.value = canvas.toDataURL('image/png')
  } catch (err) {
    ElMessage.error('生成图片失败，请重试')
    console.error(err)
  } finally {
    capturing.value = false
  }
}
</script>

<style scoped>
.home-page {
  min-height: 100vh;
  background: #F7F4EF;
}

/* 顶栏 */
.top-bar {
  background: #1F2421;
  height: 52px;
  display: flex;
  align-items: center;
  padding: 0 16px;
}

.top-bar-inner {
  max-width: 640px;
  margin: 0 auto;
  width: 100%;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-icon {
  font-size: 20px;
}

.logo-text {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

/* 页面主体 */
.page-body {
  max-width: 640px;
  margin: 0 auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 通用卡片 */
.card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #E7E1D7;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: #1F2421;
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 查询输入 */
.query-row {
  display: flex;
  gap: 10px;
}

.query-row .el-input {
  flex: 1;
}

.error-tip {
  margin-top: 8px;
  font-size: 13px;
  color: #f56c6c;
}

/* 商户信息网格 */
.merchant-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
  margin-bottom: 20px;
}

.merchant-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.mi-label {
  font-size: 12px;
  color: #999;
}

.mi-value {
  font-size: 14px;
  color: #1F2421;
  font-weight: 500;
}

.mi-value.accent {
  color: #C4612F;
  font-size: 16px;
}

/* 预算区 */
.budget-label {
  font-size: 13px;
  color: #5C635D;
  margin-bottom: 8px;
}

.budget-row {
  margin-bottom: 10px;
}

.quick-amounts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* 结果汇总 */
.result-badge {
  font-size: 12px;
  background: #C4612F;
  color: #fff;
  border-radius: 20px;
  padding: 2px 10px;
  font-weight: normal;
}

.summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 8px;
  background: #F7F4EF;
  border-radius: 10px;
  padding: 14px 10px;
  margin-bottom: 16px;
}

.summary-item {
  text-align: center;
}

.summary-val {
  font-size: 15px;
  font-weight: 700;
  color: #1F2421;
  word-break: break-all;
}

.summary-val.accent {
  color: #C4612F;
}

.summary-val.muted {
  color: #999;
}

.summary-key {
  font-size: 11px;
  color: #999;
  margin-top: 3px;
}

/* 货品列表 */
.items-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.item-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 10px 12px;
  background: #F7F4EF;
  border-radius: 8px;
  gap: 8px;
}

.item-left {
  flex: 1;
  min-width: 0;
}

.item-name {
  font-size: 14px;
  font-weight: 500;
  color: #1F2421;
  margin-bottom: 4px;
}

.item-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  color: #888;
}

.seg-tag {
  background: #fef3c7;
  color: #92400e;
  border-radius: 4px;
  padding: 0 5px;
  font-size: 11px;
}

.profit-hint {
  color: #67c23a;
}

.item-right {
  text-align: right;
  flex-shrink: 0;
}

.item-qty {
  font-size: 13px;
  color: #5C635D;
}

.item-subtotal {
  font-size: 14px;
  font-weight: 600;
  color: #1F2421;
}

.item-profit {
  font-size: 12px;
  color: #67c23a;
}

.empty-tip {
  text-align: center;
  color: #999;
  padding: 30px 0;
  font-size: 14px;
}

/* 经营策略 */
.strategy-block {
  margin-top: 18px;
  background: #FBF6EF;
  border: 1px solid #EADFCB;
  border-radius: 10px;
  padding: 16px;
}

.strategy-title {
  font-size: 15px;
  font-weight: 600;
  color: #C4612F;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}

.strategy-icon {
  font-size: 16px;
}

.strategy-summary {
  font-size: 13px;
  color: #5C635D;
  margin: 0 0 10px 0;
  line-height: 1.6;
}

.strategy-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.strategy-list li {
  font-size: 13px;
  color: #1F2421;
  line-height: 1.7;
}

/* 动画 */
.slide-up-enter-active {
  transition: all 0.3s ease;
}
.slide-up-enter-from {
  opacity: 0;
  transform: translateY(16px);
}

/* 结果操作按钮 */
.result-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

/* 离屏截图卡片 */
.offscreen-wrap {
  position: fixed;
  top: 0;
  left: -9999px;
  width: 375px;
  z-index: -1;
  pointer-events: none;
}

.share-card {
  width: 375px;
  background: #ffffff;
  font-family: -apple-system, 'PingFang SC', 'Helvetica Neue', Arial, sans-serif;
  padding: 20px;
  box-sizing: border-box;
}

.sc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 2px solid #1F2421;
}

.sc-logo {
  font-size: 15px;
  font-weight: 700;
  color: #1F2421;
}

.sc-date {
  font-size: 12px;
  color: #999;
}

.sc-merchant {
  margin-bottom: 14px;
}

.sc-name {
  font-size: 16px;
  font-weight: 700;
  color: #1F2421;
  margin-bottom: 4px;
}

.sc-sub {
  font-size: 12px;
  color: #888;
}

.sc-summary {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 6px;
  background: #F7F4EF;
  border-radius: 10px;
  padding: 12px 8px;
  margin-bottom: 14px;
}

.sc-sum-item {
  text-align: center;
}

.sc-sum-val {
  font-size: 13px;
  font-weight: 700;
  color: #1F2421;
  word-break: break-all;
}

.sc-sum-val.accent { color: #C4612F; }
.sc-sum-val.muted  { color: #999; }

.sc-sum-key {
  font-size: 10px;
  color: #999;
  margin-top: 2px;
}

.sc-items {
  margin-bottom: 14px;
}

.sc-item-header {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  font-size: 11px;
  color: #999;
  padding: 4px 8px;
  border-bottom: 1px solid #eee;
  margin-bottom: 4px;
}

.sc-item-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  font-size: 12px;
  color: #1F2421;
  padding: 5px 8px;
  border-radius: 4px;
}

.sc-item-row.odd {
  background: #F7F4EF;
}

.sc-item-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  padding-right: 4px;
}

.sc-item-row .green {
  color: #52c41a;
}

.sc-strategy {
  margin-bottom: 14px;
  background: #FBF6EF;
  border: 1px solid #EADFCB;
  border-radius: 8px;
  padding: 12px;
}

.sc-strategy-title {
  font-size: 13px;
  font-weight: 700;
  color: #C4612F;
  margin-bottom: 8px;
}

.sc-strategy-item {
  font-size: 11px;
  color: #1F2421;
  line-height: 1.6;
  margin-bottom: 6px;
  padding-left: 10px;
  position: relative;
}

.sc-strategy-item::before {
  content: '•';
  position: absolute;
  left: 0;
  color: #C4612F;
}

.sc-footer {
  text-align: center;
  font-size: 11px;
  color: #bbb;
  padding-top: 10px;
  border-top: 1px solid #eee;
}

/* 图片预览弹层 */
.img-preview-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  z-index: 9999;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0;
}

.img-preview-box {
  background: #fff;
  border-radius: 16px 16px 0 0;
  padding: 16px;
  width: 100%;
  max-height: 92vh;
  overflow-y: auto;
}

.img-tip {
  text-align: center;
  font-size: 14px;
  color: #5C635D;
  margin-bottom: 12px;
}

.preview-img {
  width: 100%;
  border-radius: 8px;
  display: block;
}

@media (max-width: 480px) {
  .summary-grid {
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .summary-val {
    font-size: 14px;
  }
}
</style>
