<template>
  <div class="data-management">
    <div class="header">
      <h1>📤 数据管理</h1>
      <p>上传商户信息表、货源表、信息更变表</p>
    </div>
    
    <div class="content">
      <!-- 上传卡片 -->
      <div class="upload-section">
        <div class="upload-card">
          <div class="card-header">
            <h2>📋 商户信息表</h2>
            <span class="status" :class="{ uploaded: stats.merchantCount > 0 }">
              {{ stats.merchantCount > 0 ? `✓ 已导入 ${stats.merchantCount} 条` : '未上传' }}
            </span>
          </div>
          <p class="card-desc">包含许可证号、客户名称、档位、诚信等级等信息</p>
          <button class="btn-upload" @click="uploadFile('merchants')">
            {{ files.merchants ? '重新上传' : '选择文件' }}
          </button>
          <div v-if="files.merchants" class="file-info">
            {{ files.merchants }}
          </div>
        </div>
        
        <div class="upload-card">
          <div class="card-header">
            <h2>📦 货源表</h2>
            <span class="status" :class="{ uploaded: stats.productCount > 0 }">
              {{ stats.productCount > 0 ? `✓ 已导入 ${stats.productCount} 条` : '未上传' }}
            </span>
          </div>
          <p class="card-desc">包含货源编号、品牌名称、成本价、售价等信息</p>
          <button class="btn-upload" @click="uploadFile('products')">
            {{ files.products ? '重新上传' : '选择文件' }}
          </button>
          <div v-if="files.products" class="file-info">
            {{ files.products }}
          </div>
        </div>
        
        <div class="upload-card">
          <div class="card-header">
            <h2>🔄 信息更变表</h2>
            <span class="status" :class="{ uploaded: files.changes }">
              {{ files.changes ? '✓ 已上传' : '未上传' }}
            </span>
          </div>
          <p class="card-desc">记录商户信息的变更，自动更新商户表</p>
          <button class="btn-upload" @click="uploadFile('changes')">
            {{ files.changes ? '重新上传' : '选择文件' }}
          </button>
          <div v-if="files.changes" class="file-info">
            {{ files.changes }}
          </div>
        </div>
      </div>
      
      <!-- 操作按钮 -->
      <div class="action-section">
        <button 
          class="btn-primary" 
          @click="applyChanges"
          :disabled="stats.pendingChangeCount === 0 || applying"
        >
          {{ applying ? '应用中...' : `应用更变 (${stats.pendingChangeCount})` }}
        </button>
        
        <button 
          class="btn-danger" 
          @click="clearData"
          :disabled="clearing"
        >
          {{ clearing ? '清空中...' : '清空所有数据' }}
        </button>
      </div>
      
      <!-- 消息提示 -->
      <div v-if="message" class="message" :class="message.type">
        {{ message.text }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const emit = defineEmits(['stats-updated'])

const files = ref({
  merchants: null,
  products: null,
  changes: null
})

const stats = ref({
  merchantCount: 0,
  productCount: 0,
  pendingChangeCount: 0
})

const applying = ref(false)
const clearing = ref(false)
const message = ref(null)

async function loadStats() {
  const result = await window.api.getStats()
  if (result.success) {
    stats.value = result.stats
  }
}

async function uploadFile(type) {
  try {
    const filePath = await window.api.openFileDialog({
      title: `选择${getTypeName(type)}`,
      filters: [{ name: 'Excel 文件', extensions: ['xlsx', 'xls'] }]
    })
    
    if (!filePath) return
    
    showMessage('正在导入...', 'info')
    
    // 如果是更变表，先调试查看解析结果
    if (type === 'changes') {
      const debugResult = await window.api.debugChanges(filePath)
      if (debugResult.success) {
        console.log('=== 更变表解析结果 ===')
        console.log('总数:', debugResult.changes.length)
        console.log('详细数据:', debugResult.changes)
        
        // 统计各类型数量
        const typeCount = {
          删除: debugResult.changes.filter(c => c.change_type === '删除').length,
          新增: debugResult.changes.filter(c => c.change_type === '新增').length,
          更新: debugResult.changes.filter(c => c.change_type === '更新').length
        }
        console.log('类型统计:', typeCount)
        
        // 显示每一条的详细信息
        debugResult.changes.forEach((change, index) => {
          console.log(`第 ${index + 1} 条:`, {
            类型: change.change_type,
            许可证号: change.license_no,
            商户名称: change.merchant_data?.customer_name || '无'
          })
        })
      }
    }
    
    let result
    if (type === 'merchants') {
      result = await window.api.importMerchants(filePath)
    } else if (type === 'products') {
      result = await window.api.importProducts(filePath)
    } else if (type === 'changes') {
      result = await window.api.importChanges(filePath)
    }
    
    if (result.success) {
      files.value[type] = filePath.split(/[\\/]/).pop()
      showMessage(`✓ 成功导入 ${result.count} 条数据`, 'success')
      await loadStats()
      emit('stats-updated')
    } else {
      showMessage(`✗ 导入失败: ${result.error}`, 'error')
    }
  } catch (err) {
    showMessage(`✗ 导入失败: ${err.message}`, 'error')
  }
}

async function applyChanges() {
  if (stats.value.pendingChangeCount === 0) {
    showMessage('没有待应用的更变', 'warning')
    return
  }
  
  applying.value = true
  try {
    const result = await window.api.applyChanges()
    if (result.success) {
      showMessage(`✓ 成功应用 ${result.count} 条更变`, 'success')
      await loadStats()
      emit('stats-updated')
    } else {
      showMessage(`✗ 应用失败: ${result.error}`, 'error')
    }
  } catch (err) {
    showMessage(`✗ 应用失败: ${err.message}`, 'error')
  } finally {
    applying.value = false
  }
}

async function clearData() {
  if (!confirm('确定要清空所有数据吗？此操作不可恢复！')) {
    return
  }
  
  clearing.value = true
  try {
    const result = await window.api.clearAllData()
    if (result.success) {
      files.value = { merchants: null, products: null, changes: null }
      showMessage('✓ 所有数据已清空', 'success')
      await loadStats()
      emit('stats-updated')
    } else {
      showMessage(`✗ 清空失败: ${result.error}`, 'error')
    }
  } catch (err) {
    showMessage(`✗ 清空失败: ${err.message}`, 'error')
  } finally {
    clearing.value = false
  }
}

function getTypeName(type) {
  const names = {
    merchants: '商户信息表',
    products: '货源表',
    changes: '信息更变表'
  }
  return names[type] || ''
}

function showMessage(text, type = 'info') {
  message.value = { text, type }
  setTimeout(() => {
    message.value = null
  }, 3000)
}

onMounted(() => {
  loadStats()
})
</script>

<style scoped>
.data-management {
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
  max-width: 1200px;
}

.upload-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.upload-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: all 0.3s;
  display: flex;
  flex-direction: column;
  min-height: 240px;
}

.upload-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  transform: translateY(-2px);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  gap: 12px;
}

.card-header h2 {
  font-size: 18px;
  color: #262626;
  flex: 1;
  line-height: 1.4;
}

.status {
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 12px;
  background: #F0F0F0;
  color: #8C8C8C;
  white-space: nowrap;
  flex-shrink: 0;
}

.status.uploaded {
  background: #F6FFED;
  color: #52C41A;
}

.card-desc {
  font-size: 14px;
  color: #595959;
  margin-bottom: 20px;
  line-height: 1.6;
  flex: 1;
}

.btn-upload {
  width: 100%;
  padding: 10px;
  background: #1890FF;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: auto;
}

.btn-upload:hover {
  background: #40A9FF;
}

.file-info {
  margin-top: 12px;
  font-size: 12px;
  color: #8C8C8C;
  padding: 8px 12px;
  background: #FAFAFA;
  border-radius: 4px;
  word-break: break-all;
}

.action-section {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
}

.btn-primary,
.btn-danger {
  padding: 12px 32px;
  border: none;
  border-radius: 6px;
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

.btn-primary:disabled {
  background: #D9D9D9;
  cursor: not-allowed;
}

.btn-danger {
  background: #FF4D4F;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #FF7875;
}

.btn-danger:disabled {
  background: #D9D9D9;
  cursor: not-allowed;
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

.message.warning {
  background: #FFFBE6;
  color: #FAAD14;
  border: 1px solid #FFE58F;
}

.message.info {
  background: #E6F7FF;
  color: #1890FF;
  border: 1px solid #91D5FF;
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
