<template>
  <div class="server-management">
    <div class="header">
      <h1>📱 分享服务</h1>
      <p>启动本地服务器，生成报告链接供手机端访问</p>
    </div>
    
    <div class="content">
      <!-- 服务器状态卡片 -->
      <div class="status-card">
        <div class="status-header">
          <h2>服务器状态</h2>
          <div class="status-indicator" :class="{ running: serverStatus.running }">
            <span class="dot"></span>
            <span class="text">{{ serverStatus.running ? '运行中' : '已停止' }}</span>
          </div>
        </div>
        
        <div v-if="serverStatus.running" class="server-info">
          <div class="info-row">
            <span class="label">端口号:</span>
            <span class="value">{{ serverStatus.port }}</span>
          </div>
          <div class="info-row">
            <span class="label">活跃报告:</span>
            <span class="value">{{ serverStatus.reportCount }} 个</span>
          </div>
        </div>
        
        <div class="action-buttons">
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
      </div>
      
      <!-- 使用说明 -->
      <div class="guide-card">
        <h2>📖 使用说明</h2>
        <ol class="guide-list">
          <li>点击"启动服务器"按钮</li>
          <li>在"查询报告"页面输入许可证号</li>
          <li>点击"导出链接"生成分享链接</li>
          <li>手机扫码或复制链接即可查看报告</li>
          <li>报告链接有效期为 5 分钟</li>
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

const serverStatus = ref({
  running: false,
  port: 3000,
  reportCount: 0
})

const starting = ref(false)
const stopping = ref(false)
const message = ref(null)

let statusInterval = null

async function loadStatus() {
  try {
    const status = await window.api.getServerStatus()
    serverStatus.value = status
  } catch (err) {
    console.error('获取服务器状态失败:', err)
  }
}

async function startServer() {
  starting.value = true
  try {
    const result = await window.api.startServer()
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
    const result = await window.api.stopServer()
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
  // 每 2 秒刷新状态
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
}

.header {
  margin-bottom: 30px;
  -webkit-app-region: drag;
  cursor: move;
}

.header h1 {
  font-size: 28px;
  color: #262626;
  margin-bottom: 8px;
  -webkit-user-select: none;
}

.header p {
  font-size: 14px;
  color: #8C8C8C;
  -webkit-user-select: none;
}

.content {
  max-width: 800px;
}

.status-card,
.guide-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  margin-bottom: 20px;
}

.status-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.status-header h2 {
  font-size: 20px;
  color: #262626;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  border-radius: 16px;
  background: #F0F0F0;
  color: #8C8C8C;
  font-size: 14px;
}

.status-indicator.running {
  background: #F6FFED;
  color: #52C41A;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #8C8C8C;
}

.status-indicator.running .dot {
  background: #52C41A;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.server-info {
  background: #FAFAFA;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 14px;
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
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-start {
  background: #52C41A;
  color: white;
}

.btn-start:hover:not(:disabled) {
  background: #73D13D;
}

.btn-stop {
  background: #FF4D4F;
  color: white;
}

.btn-stop:hover:not(:disabled) {
  background: #FF7875;
}

.btn-start:disabled,
.btn-stop:disabled {
  background: #D9D9D9;
  cursor: not-allowed;
}

.guide-card h2 {
  font-size: 20px;
  color: #262626;
  margin-bottom: 16px;
}

.guide-list {
  padding-left: 20px;
  line-height: 2;
  color: #595959;
}

.guide-list li {
  font-size: 14px;
}

.message {
  padding: 12px 20px;
  border-radius: 6px;
  font-size: 14px;
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
