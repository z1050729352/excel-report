<template>
  <div class="dashboard">
    <h2 class="page-title">数据概览</h2>
    
    <!-- 统计卡片 -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)">
          <el-icon><Shop /></el-icon>
        </div>
        <div class="stat-content">
          <div class="stat-value">{{ stats.merchantCount }}</div>
          <div class="stat-label">商户总数</div>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%)">
          <el-icon><Goods /></el-icon>
        </div>
        <div class="stat-content">
          <div class="stat-value">{{ stats.productCount }}</div>
          <div class="stat-label">货源总数</div>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)">
          <el-icon><EditPen /></el-icon>
        </div>
        <div class="stat-content">
          <div class="stat-value">{{ stats.pendingChangeCount }}</div>
          <div class="stat-label">待应用更变</div>
        </div>
      </div>
      
      <div class="stat-card" style="cursor: pointer" @click="$router.push('/admin/import')">
        <div class="stat-icon" style="background: linear-gradient(135deg, #fa709a 0%, #fee140 100%)">
          <el-icon><Upload /></el-icon>
        </div>
        <div class="stat-content">
          <div class="stat-value" style="font-size: 18px">导入数据</div>
          <div class="stat-label">点击上传Excel表格</div>
        </div>
      </div>
    </div>
    
    <!-- 快捷操作 -->
    <div class="quick-actions">
      <h3 class="section-title">快捷操作</h3>
      <div class="action-cards">
        <div class="action-card" @click="$router.push('/admin/import')">
          <el-icon class="action-icon"><Upload /></el-icon>
          <div class="action-title">数据导入</div>
          <div class="action-desc">导入商户表、货源表、更变表</div>
        </div>
        
        <div class="action-card" @click="$router.push('/admin/merchants')">
          <el-icon class="action-icon"><Shop /></el-icon>
          <div class="action-title">商户管理</div>
          <div class="action-desc">查看商户信息和档位</div>
        </div>
        
        <div class="action-card" @click="$router.push('/admin/products')">
          <el-icon class="action-icon"><Goods /></el-icon>
          <div class="action-title">货源管理</div>
          <div class="action-desc">查看货源投放和配额</div>
        </div>
        
        <div class="action-card" @click="$router.push('/admin/changes')">
          <el-icon class="action-icon"><EditPen /></el-icon>
          <div class="action-title">更变管理</div>
          <div class="action-desc">应用商户信息更变</div>
        </div>
      </div>
    </div>
    
    <!-- 系统说明 -->
    <div class="system-info">
      <h3 class="section-title">系统说明</h3>
      <div class="info-card">
        <el-alert
          title="烟草订货优化系统"
          type="info"
          :closable="false"
        >
          <p>本系统为商户提供基于预算的最优订货组合建议，通过智能算法计算在预算范围内可获得最大利润的烟草产品组合。</p>
          <ul style="margin: 12px 0 0 0; padding-left: 20px; line-height: 1.8">
            <li><strong>商户管理：</strong>通过Excel导入商户基础信息，包括许可证号、档位、信用等级等</li>
            <li><strong>货源管理：</strong>通过Excel导入货源投放表，包括商品信息、价格、各档位配额等</li>
            <li><strong>更变管理：</strong>通过Excel导入信息更变表，支持新增、修改、删除商户信息</li>
            <li><strong>数据导入：</strong>所有数据操作均通过Excel表格导入，系统自动解析并更新数据库</li>
          </ul>
        </el-alert>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { formatMoney } from '@/shared/utils/format'
import request from '@/shared/api/request'

const loading = ref(false)

const stats = ref({
  merchantCount: 0,
  productCount: 0,
  pendingChangeCount: 0
})

onMounted(() => {
  loadDashboard()
})

const loadDashboard = async () => {
  loading.value = true
  try {
    // 获取统计数据
    const statsRes = await request.get('/admin/stats')
    if (statsRes.success && statsRes.stats) {
      stats.value = {
        merchantCount: statsRes.stats.merchantCount || 0,
        productCount: statsRes.stats.productCount || 0,
        pendingChangeCount: statsRes.stats.pendingChangeCount || 0
      }
    }
  } catch (error) {
    // 静默处理错误，不显示错误提示（首次使用没有数据是正常的）
    console.error('加载数据失败:', error)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.dashboard {
  max-width: 1400px;
  margin: 0 auto;
}

.page-title {
  font-size: 24px;
  font-weight: 500;
  color: #1F2421;
  margin: 0 0 24px 0;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 20px;
  margin-bottom: 24px;
}

.stat-card {
  background: #FFFFFF;
  border: 1px solid #E7E1D7;
  border-radius: 12px;
  padding: 24px;
  display: flex;
  align-items: center;
  gap: 20px;
  transition: transform 0.2s, box-shadow 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(31, 36, 33, 0.08);
}

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-icon .el-icon {
  font-size: 28px;
  color: #FFFFFF;
}

.stat-content {
  flex: 1;
}

.stat-value {
  font-size: 28px;
  font-weight: 600;
  color: #1F2421;
  margin-bottom: 4px;
  line-height: 1;
}

.stat-label {
  font-size: 14px;
  color: #5C635D;
}

.quick-actions {
  margin-bottom: 24px;
}

.section-title {
  font-size: 18px;
  font-weight: 500;
  color: #1F2421;
  margin: 0 0 16px 0;
}

.action-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}

.action-card {
  background: #FFFFFF;
  border: 1px solid #E7E1D7;
  border-radius: 12px;
  padding: 24px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}

.action-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(31, 36, 33, 0.08);
  border-color: #C4612F;
}

.action-icon {
  font-size: 40px;
  color: #C4612F;
  margin-bottom: 12px;
}

.action-title {
  font-size: 16px;
  font-weight: 500;
  color: #1F2421;
  margin-bottom: 8px;
}

.action-desc {
  font-size: 13px;
  color: #5C635D;
}

.system-info {
  margin-bottom: 24px;
}

.info-card {
  background: #FFFFFF;
  border: 1px solid #E7E1D7;
  border-radius: 12px;
  padding: 24px;
}

.info-card p {
  margin: 0 0 8px 0;
  line-height: 1.6;
  color: #5C635D;
}

@media (max-width: 1024px) {
  .charts-grid {
    grid-template-columns: 1fr;
  }
}
</style>
