<template>
  <div class="server-management">
    <div class="header">
      <h1>📱 分享服务</h1>
      <p>{{ isElectron ? '启动本地服务器，生成报告链接供手机端访问' : 'Web 服务常驻运行，可直接生成报告链接供手机访问' }}</p>
    </div>
    
    <div class="content">
      <!-- 服务器状态卡片 -->
      <div class="status-card">
        <div class="status-header">
          <h2>服务器状态</h2>
          <div class="status-indicator" :class="{ running: serverStatus.running }">
            <span class="dot"></span>
            <span class="text">
              {{ serverStatus.alwaysOn ? '常驻运行' : (serverStatus.running ? '运行中' : '已停止') }}
            </span>
          </div>
        </div>
        
        <div v-if="serverStatus.running" class="server-info">
          <div class="info-row" v-if="!serverStatus.alwaysOn">
            <span class="label">端口号:</span>
            <span class="value">{{ serverStatus.port }}</span>
          </div>
          <div class="info-row" v-else>
            <span class="label">访问地址:</span>
            <span class="value">{{ currentOrigin }}</span>
          </div>
          <div class="info-row">
            <span class="label">活跃报告:</span>
            <span class="value">{{ serverStatus.reportCount }} 个</span>
          </div>
        </div>
        
        <div class="action-buttons" v-if="!serverStatus.alwaysOn">
          <button 
            v-if="!serverStatus.running" 
            class="btn-start" 
            @click="startServer"
            :disabled="starting"
          >
            {{ starting ? '启动中...' : '🚀 启动服务器' }}
          </button>
          <button 
            v-else 
            class="btn-stop" 
            @click="stopServer"
            :disabled="stopping"
          >
            {{ stopping ? '停止中...' : '⏹ 停止服务器' }}
          </button>
        </div>
        <div v-else class="web-hint">
          Web 模式下服务随页面一起运行，无需手动启停。
        </div>
      </div>
      
      <!-- 使用说明 -->
      <div class="guide-card">
        <h2>📖 使用说明</h2>
        <ol class="guide-list">
          <li v-if="!serverStatus.alwaysOn">点击"启动服务器"按钮</li>
          <li>在"查询报告"页面输入许可证号</li>
          <li>点击"导出链接"生成分享链接</li>
          <li>手机扫码或复制链接即可查看报告</li>
          <li>报告链接有效期为 24 小时</li>
        </ol>
      </div>
      
      <!-- 消息提示 -->
      <div v-if="message" class="message" :class="message.type">
        {{ message.text }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { api, isElectron } from '../api'

const serverStatus = ref({
  running: false,
  alwaysOn: false,
  port: 3000,
  reportCount: 0
})

const starting = ref(false)
const stopping = ref(false)
const message = ref(null)
const currentOrigin = typeof window !== 'undefined' ? window.location.origin : ''

let statusInterval = null

async function loadStatus() {
  try {
    const status = await api.getServerStatus()
    serverStatus.value = status
  } catch (err) {
    console.error('获取服务器状态失败:', err)
  }
}

async function startServer() {
  starting.value = true
  try {
    const result = await api.startServer()
    if (result.success) {
      showMessage('✓ 服务器已启动', 'success')
      await loadStatus()
    } else {
      showMessage(`✗ 启动失败: ${result.error}`, 'error')
    }
  } catch (err) {
    showMessage(`✗ 启动失败: ${err.message}`, 'error')
  } finally {
    starting.value = false
  }
}

async function stopServer() {
  stopping.value = true
  try {
    const result = await api.stopServer()
    if (result.success) {
      showMessage('✓ 服务器已停止', 'success')
      await loadStatus()
    } else {
      showMessage(`✗ 停止失败: ${result.error}`, 'error')
    }
  } catch (err) {
    showMessage(`✗ 停止失败: ${err.message}`, 'error')
  } finally {
    stopping.value = false
  }
}

function showMessage(text, type = 'info') {
  message.value = { text, type }
  setTimeout(() => {
    message.value = null
  }, 3000)
}

onMounted(() => {
  loadStatus()
  statusInterval = setInterval(loadStatus, 2000)
})

onUnmounted(() => {
  if (statusInterval) {
    clearInterval(statusInterval)
  }
})
</script>

<style scoped>
.server-management {
  padding: 30px;
  max-width: 800px;
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
  color: #8C8C8C;
  font-size: 14px;
}

.status-card,
.guide-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.status-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.status-header h2 {
  font-size: 18px;
  color: #262626;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #8C8C8C;
}

.status-indicator.running {
  color: #52C41A;
}

.status-indicator .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #D9D9D9;
}

.status-indicator.running .dot {
  background: #52C41A;
  box-shadow: 0 0 0 3px rgba(82, 196, 26, 0.2);
}

.server-info {
  margin-bottom: 20px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #F0F0F0;
}

.info-row:last-child {
  border-bottom: none;
}

.info-row .label {
  color: #8C8C8C;
}

.info-row .value {
  color: #262626;
  font-weight: 500;
}

.action-buttons {
  display: flex;
  gap: 12px;
}

.btn-start,
.btn-stop {
  flex: 1;
  padding: 12px 20px;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-start {
  background: linear-gradient(135deg, #52C41A, #389E0D);
  color: white;
}

.btn-start:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-stop {
  background: #FFF1F0;
  color: #FF4D4F;
  border: 1px solid #FFCCC7;
}

.btn-stop:hover:not(:disabled) {
  background: #FFCCC7;
}

.btn-start:disabled,
.btn-stop:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.web-hint {
  padding: 12px 16px;
  background: #E6F7FF;
  border-radius: 8px;
  color: #1890FF;
  font-size: 14px;
}

.guide-card h2 {
  font-size: 18px;
  margin-bottom: 16px;
  color: #262626;
}

.guide-list {
  padding-left: 20px;
  color: #595959;
  line-height: 2;
}

.message {
  padding: 12px 16px;
  border-radius: 8px;
  margin-top: 16px;
  font-size: 14px;
}

.message.success {
  background: #F6FFED;
  color: #52C41A;
  border: 1px solid #B7EB8F;
}

.message.error {
  background: #FFF1F0;
  color: #FF4D4F;
  border: 1px solid #FFA39E;
}

.message.info {
  background: #E6F7FF;
  color: #1890FF;
  border: 1px solid #91D5FF;
}
</style>
