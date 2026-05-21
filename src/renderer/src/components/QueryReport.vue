<template>
  <div class="query-report">
    <div class="header">
      <h1>🔍 查询报告</h1>
      <p>输入许可证号查询商户信息并生成订货指导报告</p>
    </div>
    
    <div class="content">
      <!-- 查询框 -->
      <div class="search-box">
        <input 
          v-model="licenseNo" 
          type="text" 
          placeholder="请输入许可证号..."
          @keyup.enter="queryMerchant"
          class="search-input"
        />
        <button class="btn-search" @click="queryMerchant" :disabled="!licenseNo || querying">
          {{ querying ? '查询中...' : '查询' }}
        </button>
      </div>
      
      <!-- 查询结果 -->
      <div v-if="merchant" class="result-section">
        <!-- 商户信息卡片 -->
        <div class="info-card">
          <h2>📋 商户信息</h2>
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">客户名称</div>
              <div class="info-value">{{ merchant.customer_name || '-' }}</div>
            </div>
            <div class="info-item">
              <div class="info-label">许可证号</div>
              <div class="info-value">{{ merchant.license_no || '-' }}</div>
            </div>
            <div class="info-item">
              <div class="info-label">档位</div>
              <div class="info-value tier">{{ merchant.tier || '-' }}</div>
            </div>
            <div class="info-item">
              <div class="info-label">诚信等级</div>
              <div class="info-value">{{ merchant.credit_level || '-' }}</div>
            </div>
            <div class="info-item">
              <div class="info-label">预算</div>
              <div class="info-value budget">¥{{ merchant.budget?.toFixed(2) || '0.00' }}</div>
            </div>
            <div class="info-item">
              <div class="info-label">可用货源</div>
              <div class="info-value">{{ productCount }} 种</div>
            </div>
          </div>
        </div>
        
        <!-- 操作按钮 -->
        <div class="action-buttons">
          <button class="btn-primary" @click="generateReport" :disabled="generating">
            {{ generating ? '生成中...' : '📊 生成报告' }}
          </button>
          <button class="btn-secondary" @click="shareReport" :disabled="sharing">
            {{ sharing ? '分享中...' : '📱 导出链接' }}
          </button>
        </div>
        
        <!-- 报告预览 -->
        <div v-if="orderGuide" class="report-preview">
          <h2>💰 订货方案摘要</h2>
          <div class="summary-grid">
            <div class="summary-item">
              <div class="summary-label">总预算</div>
              <div class="summary-value">¥{{ orderGuide.merchantInfo.budget.toFixed(0) }}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">实际花费</div>
              <div class="summary-value cost">¥{{ orderGuide.orderPlan.totalCost.toFixed(0) }}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">预计利润</div>
              <div class="summary-value profit">¥{{ orderGuide.orderPlan.totalProfit.toFixed(0) }}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">利润率</div>
              <div class="summary-value profit">
                {{ ((orderGuide.orderPlan.totalProfit / orderGuide.orderPlan.totalCost) * 100).toFixed(1) }}%
              </div>
            </div>
          </div>
          
          <!-- 推荐订购 -->
          <div v-if="orderGuide.orderPlan.profitable.length > 0" class="recommendation-section success">
            <h3>🔥 优先订购（赚钱）</h3>
            <div class="product-list">
              <div v-for="item in orderGuide.orderPlan.profitable.slice(0, 5)" :key="item.product_code" class="product-item">
                <div class="product-name">{{ item.product_name }}</div>
                <div class="product-profit positive">+¥{{ item.profit.toFixed(2) }}</div>
              </div>
            </div>
            <div v-if="orderGuide.orderPlan.profitable.length > 5" class="more-hint">
              还有 {{ orderGuide.orderPlan.profitable.length - 5 }} 种货源...
            </div>
          </div>
          
          <!-- 保档必订 -->
          <div v-if="orderGuide.orderPlan.necessary.length > 0" class="recommendation-section warning">
            <h3>⚠️ 保档必订（亏损）</h3>
            <div class="product-list">
              <div v-for="item in orderGuide.orderPlan.necessary" :key="item.product_code" class="product-item">
                <div class="product-name">{{ item.product_name }}</div>
                <div class="product-profit negative">{{ item.profit.toFixed(2) }}</div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 分享链接 -->
        <div v-if="shareLink" class="share-section">
          <h2>📱 分享链接</h2>
          
          <!-- 二维码 -->
          <div class="qrcode-container">
            <canvas ref="qrcodeCanvas" class="qrcode"></canvas>
            <p class="qrcode-hint">手机扫码查看报告</p>
          </div>
          
          <!-- 本地链接 -->
          <div class="link-group">
            <div class="link-label">本地链接（本机访问）</div>
            <div class="link-box">
              <input :value="shareLink.link" readonly class="link-input" />
              <button class="btn-copy" @click="copyLink(shareLink.link)">复制</button>
            </div>
          </div>
          
          <!-- 网络链接 -->
          <div class="link-group">
            <div class="link-label">网络链接（手机访问）</div>
            <div class="link-box">
              <input :value="shareLink.networkLink" readonly class="link-input" />
              <button class="btn-copy" @click="copyLink(shareLink.networkLink)">复制</button>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 消息提示 -->
      <div v-if="message" class="message" :class="message.type">
        {{ message.text }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import QRCode from 'qrcode'

const licenseNo = ref('')
const merchant = ref(null)
const productCount = ref(0)
const orderGuide = ref(null)
const shareLink = ref(null)
const qrcodeCanvas = ref(null)

const querying = ref(false)
const generating = ref(false)
const sharing = ref(false)
const message = ref(null)

async function queryMerchant() {
  if (!licenseNo.value.trim()) {
    showMessage('请输入许可证号', 'warning')
    return
  }
  
  querying.value = true
  orderGuide.value = null
  shareLink.value = null
  
  try {
    const result = await window.api.queryMerchant(licenseNo.value.trim())
    if (result.success) {
      merchant.value = result.merchant
      productCount.value = result.productCount
      showMessage('✓ 查询成功', 'success')
    } else {
      merchant.value = null
      showMessage(`✗ ${result.error}`, 'error')
    }
  } catch (err) {
    showMessage(`✗ 查询失败: ${err.message}`, 'error')
  } finally {
    querying.value = false
  }
}

async function generateReport() {
  generating.value = true
  try {
    const result = await window.api.generateOrderPlan({ licenseNo: licenseNo.value.trim() })
    if (result.success) {
      orderGuide.value = result.orderGuide
      showMessage('✓ 报告生成成功', 'success')
    } else {
      showMessage(`✗ ${result.error}`, 'error')
    }
  } catch (err) {
    showMessage(`✗ 生成失败: ${err.message}`, 'error')
  } finally {
    generating.value = false
  }
}

async function shareReport() {
  sharing.value = true
  try {
    const result = await window.api.shareReport({ licenseNo: licenseNo.value.trim() })
    if (result.success) {
      shareLink.value = result
      showMessage('✓ 链接生成成功', 'success')
      
      // 生成二维码
      await nextTick()
      if (qrcodeCanvas.value) {
        await QRCode.toCanvas(qrcodeCanvas.value, result.networkLink, {
          width: 200,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        })
      }
    } else {
      showMessage(`✗ ${result.error}`, 'error')
    }
  } catch (err) {
    showMessage(`✗ 分享失败: ${err.message}`, 'error')
  } finally {
    sharing.value = false
  }
}

function copyLink(link) {
  navigator.clipboard.writeText(link).then(() => {
    showMessage('✓ 链接已复制', 'success')
  }).catch(() => {
    showMessage('✗ 复制失败', 'error')
  })
}

function showMessage(text, type = 'info') {
  message.value = { text, type }
  setTimeout(() => {
    message.value = null
  }, 3000)
}
</script>

<style scoped>
.query-report {
  padding: 30px;
}

.header {
  margin-bottom: 30px;
}

.header h1 {
  font-size: 28px;
  color: #262626;
  margin-bottom: 8px;
}

.header p {
  font-size: 14px;
  color: #8C8C8C;
}

.content {
  max-width: 1000px;
}

.search-box {
  display: flex;
  gap: 12px;
  margin-bottom: 30px;
}

.search-input {
  flex: 1;
  padding: 12px 20px;
  font-size: 15px;
  border: 2px solid #D9D9D9;
  border-radius: 8px;
  transition: all 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: #1890FF;
}

.btn-search {
  padding: 12px 32px;
  background: #1890FF;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-search:hover:not(:disabled) {
  background: #40A9FF;
}

.btn-search:disabled {
  background: #D9D9D9;
  cursor: not-allowed;
}

.result-section {
  animation: fadeIn 0.3s;
}

.info-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  margin-bottom: 20px;
}

.info-card h2 {
  font-size: 20px;
  color: #262626;
  margin-bottom: 20px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
}

.info-item {
  display: flex;
  flex-direction: column;
}

.info-label {
  font-size: 12px;
  color: #8C8C8C;
  margin-bottom: 6px;
}

.info-value {
  font-size: 16px;
  color: #262626;
  font-weight: 500;
}

.info-value.tier {
  color: #1890FF;
  font-weight: 600;
}

.info-value.budget {
  color: #52C41A;
  font-weight: 600;
}

.action-buttons {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.btn-primary,
.btn-secondary {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: #52C41A;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #73D13D;
}

.btn-secondary {
  background: #1890FF;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #40A9FF;
}

.btn-primary:disabled,
.btn-secondary:disabled {
  background: #D9D9D9;
  cursor: not-allowed;
}

.report-preview {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  margin-bottom: 20px;
}

.report-preview h2 {
  font-size: 20px;
  color: #262626;
  margin-bottom: 20px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
  margin-bottom: 30px;
}

.summary-item {
  background: #FAFAFA;
  padding: 16px;
  border-radius: 8px;
  text-align: center;
}

.summary-label {
  font-size: 12px;
  color: #8C8C8C;
  margin-bottom: 8px;
}

.summary-value {
  font-size: 24px;
  font-weight: 600;
  color: #262626;
}

.summary-value.cost {
  color: #1890FF;
}

.summary-value.profit {
  color: #52C41A;
}

.recommendation-section {
  margin-bottom: 20px;
  padding: 20px;
  border-radius: 8px;
}

.recommendation-section.success {
  background: #F6FFED;
  border: 1px solid #B7EB8F;
}

.recommendation-section.warning {
  background: #FFF7E6;
  border: 1px solid #FFD591;
}

.recommendation-section h3 {
  font-size: 16px;
  margin-bottom: 12px;
}

.recommendation-section.success h3 {
  color: #52C41A;
}

.recommendation-section.warning h3 {
  color: #FA8C16;
}

.product-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.product-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: white;
  border-radius: 6px;
}

.product-name {
  font-size: 14px;
  color: #262626;
}

.product-profit {
  font-size: 14px;
  font-weight: 600;
}

.product-profit.positive {
  color: #52C41A;
}

.product-profit.negative {
  color: #FF4D4F;
}

.more-hint {
  margin-top: 8px;
  font-size: 12px;
  color: #8C8C8C;
  text-align: center;
}

.share-section {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.share-section h2 {
  font-size: 20px;
  color: #262626;
  margin-bottom: 20px;
}

.qrcode-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  background: #FAFAFA;
  border-radius: 8px;
  margin-bottom: 24px;
}

.qrcode {
  border: 4px solid white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.qrcode-hint {
  margin-top: 12px;
  font-size: 14px;
  color: #595959;
  font-weight: 500;
}

.link-group {
  margin-bottom: 16px;
}

.link-group:last-child {
  margin-bottom: 0;
}

.link-label {
  font-size: 13px;
  color: #595959;
  margin-bottom: 8px;
  font-weight: 500;
}

.link-box {
  display: flex;
  gap: 12px;
}

.link-input {
  flex: 1;
  padding: 10px 16px;
  font-size: 14px;
  border: 1px solid #D9D9D9;
  border-radius: 6px;
  background: #FAFAFA;
  font-family: 'Monaco', 'Menlo', monospace;
}

.btn-copy {
  padding: 10px 20px;
  background: #1890FF;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-copy:hover {
  background: #40A9FF;
}

.message {
  padding: 12px 20px;
  border-radius: 6px;
  font-size: 14px;
  margin-top: 20px;
  animation: slideIn 0.3s;
}

.message.success {
  background: #F6FFED;
  color: #52C41A;
  border: 1px solid #B7EB8F;
}

.message.error {
  background: #FFF2F0;
  color: #FF4D4F;
  border: 1px solid #FFCCC7;
}

.message.warning {
  background: #FFFBE6;
  color: #FAAD14;
  border: 1px solid #FFE58F;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
