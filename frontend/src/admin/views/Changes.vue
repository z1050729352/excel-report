<template>
  <div class="changes-page">
    <div class="page-header">
      <h2 class="page-title">更变管理</h2>
      <div class="header-actions">
        <el-button type="danger" :disabled="changes.length === 0" @click="handleClearChanges">
          <el-icon><Delete /></el-icon>
          清空更变
        </el-button>
        <el-button type="primary" :disabled="changes.length === 0" @click="handleApplyChanges" :loading="applying">
          <el-icon><Check /></el-icon>
          应用更变
        </el-button>
      </div>
    </div>

    <el-alert
      v-if="changes.length > 0"
      title="提示"
      type="warning"
      :closable="false"
      style="margin-bottom: 20px"
    >
      当前有 <strong>{{ changes.length }}</strong> 条待应用的更变，点击"应用更变"后将批量更新商户信息
    </el-alert>

    <!-- 更变列表 -->
    <div class="table-container">
      <el-table
        :data="changes"
        v-loading="loading"
        style="width: 100%"
      >
        <el-table-column type="index" label="序号" width="60" />
        <el-table-column prop="license_no" label="许可证号" width="180" />
        <el-table-column prop="change_type" label="更变类型" width="100">
          <template #default="{ row }">
            <el-tag :type="getChangeTypeTag(row.change_type)" size="small">
              {{ row.change_type }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="商户信息" min-width="300">
          <template #default="{ row }">
            <div v-if="row.change_type === '删除'" class="change-info">
              <span class="delete-info">删除许可证号为 {{ row.license_no }} 的商户</span>
            </div>
            <div v-else-if="row.merchant_data" class="change-info">
              <div v-if="row.merchant_data.customer_name">
                <strong>名称：</strong>{{ row.merchant_data.customer_name }}
              </div>
              <div v-if="row.merchant_data.tier">
                <strong>档位：</strong>{{ row.merchant_data.tier }}
              </div>
              <div v-if="row.merchant_data.credit_level">
                <strong>信用等级：</strong>{{ row.merchant_data.credit_level }}
              </div>
              <div v-if="row.merchant_data.address">
                <strong>地址：</strong>{{ row.merchant_data.address }}
              </div>
            </div>
            <span v-else class="no-data">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!loading && changes.length === 0" description="暂无待应用的更变" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '@/shared/api/request'

const loading = ref(false)
const applying = ref(false)
const changes = ref([])

onMounted(() => {
  fetchChanges()
})

const fetchChanges = async () => {
  loading.value = true
  try {
    const res = await request.get('/admin/changes')
    if (res.success) {
      changes.value = res.changes || []
    } else {
      changes.value = []
    }
  } catch (error) {
    changes.value = []
    console.error('获取更变列表失败:', error)
  } finally {
    loading.value = false
  }
}

const getChangeTypeTag = (type) => {
  const map = {
    '新增': 'success',
    '更新': 'warning',
    '删除': 'danger'
  }
  return map[type] || 'info'
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const handleApplyChanges = async () => {
  try {
    await ElMessageBox.confirm(
      `确定要应用这 ${changes.value.length} 条更变吗？应用后将更新商户信息。`,
      '确认应用',
      {
        type: 'warning',
        confirmButtonText: '确定应用',
        cancelButtonText: '取消'
      }
    )

    applying.value = true
    const res = await request.post('/admin/changes/apply')

    if (res.success) {
      ElMessage.success(res.message || `成功应用 ${res.count} 条更变`)
      fetchChanges()
    } else {
      ElMessage.error('应用更变失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('应用更变失败')
    }
  } finally {
    applying.value = false
  }
}

const handleClearChanges = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要清空所有待应用的更变吗？此操作不可恢复。',
      '确认清空',
      {
        type: 'error',
        confirmButtonText: '确定清空',
        cancelButtonText: '取消'
      }
    )

    const res = await request.delete('/admin/changes')

    if (res.success) {
      ElMessage.success(res.message || '已清空更变')
      fetchChanges()
    } else {
      ElMessage.error('清空失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('清空失败')
    }
  }
}
</script>

<style scoped>
.changes-page {
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-title {
  font-size: 24px;
  font-weight: 500;
  color: #1F2421;
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.table-container {
  background: #FFFFFF;
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #E7E1D7;
  min-height: 400px;
}

.change-info {
  font-size: 13px;
  line-height: 1.6;
  color: #5C635D;
}

.change-info strong {
  color: #1F2421;
  margin-right: 4px;
}

.delete-info {
  color: #f56c6c;
}

.no-data {
  color: #9ca3af;
}
</style>
