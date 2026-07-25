<template>
  <div class="app" :class="{ 'is-desktop': isElectron, 'is-web': !isElectron }">
    <!-- 左侧导航栏 -->
    <aside class="sidebar">
      <div class="logo">
        <div class="logo-icon">📊</div>
        <div class="logo-text">
          <div class="logo-title">烟草订货</div>
          <div class="logo-subtitle">管理系统</div>
        </div>
      </div>
      
      <nav class="nav">
        <div 
          class="nav-item" 
          :class="{ active: currentView === 'data' }"
          @click="currentView = 'data'"
        >
          <span class="nav-icon">📤</span>
          <span class="nav-label">数据管理</span>
        </div>
        
        <div 
          class="nav-item" 
          :class="{ active: currentView === 'query' }"
          @click="currentView = 'query'"
        >
          <span class="nav-icon">🔍</span>
          <span class="nav-label">查询报告</span>
        </div>
        
        <div 
          class="nav-item" 
          :class="{ active: currentView === 'server' }"
          @click="currentView = 'server'"
        >
          <span class="nav-icon">📱</span>
          <span class="nav-label">分享服务</span>
        </div>
      </nav>
      
      <!-- 统计信息 -->
      <div class="stats">
        <div class="stat-item">
          <div class="stat-label">商户数量</div>
          <div class="stat-value">{{ stats.merchantCount }}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">货源数量</div>
          <div class="stat-value">{{ stats.productCount }}</div>
        </div>
        <div class="stat-item" v-if="stats.pendingChangeCount > 0">
          <div class="stat-label">待应用更变</div>
          <div class="stat-value warning">{{ stats.pendingChangeCount }}</div>
        </div>
      </div>
    </aside>
    
    <!-- 主内容区 -->
    <main class="main-content">
      <!-- 数据管理视图 -->
      <DataManagement v-show="currentView === 'data'" @stats-updated="loadStats" />
      
      <!-- 查询报告视图 -->
      <QueryReport v-show="currentView === 'query'" />
      
      <!-- 分享服务视图 -->
      <ServerManagement v-show="currentView === 'server'" />
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import DataManagement from './components/DataManagement.vue'
import QueryReport from './components/QueryReport.vue'
import ServerManagement from './components/ServerManagement.vue'
import { api, isElectron } from './api'

const currentView = ref('data')
const stats = ref({
  merchantCount: 0,
  productCount: 0,
  pendingChangeCount: 0
})

async function loadStats() {
  try {
    const result = await api.getStats()
    if (result.success) {
      stats.value = result.stats
    }
  } catch (err) {
    console.error('加载统计失败:', err)
  }
}

onMounted(() => {
  document.documentElement.classList.toggle('is-desktop', isElectron)
  document.documentElement.classList.toggle('is-web', !isElectron)
  loadStats()
  setInterval(loadStats, 5000)
})
</script>

<style scoped>
.app {
  display: flex;
  height: 100vh;
  background: #F0F2F5;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

/* 左侧导航栏 */
.sidebar {
  width: 240px;
  background: linear-gradient(180deg, #0050B3 0%, #003A8C 100%);
  color: white;
  display: flex;
  flex-direction: column;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.15);
}

.logo {
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.app.is-desktop .logo {
  padding: 50px 20px 20px 20px;
  margin-top: 10px;
  -webkit-app-region: drag;
}

.logo-icon {
  font-size: 32px;
}

.logo-text {
  flex: 1;
}

.logo-title {
  font-size: 18px;
  font-weight: 600;
  line-height: 1.2;
}

.logo-subtitle {
  font-size: 14px;
  opacity: 0.8;
  margin-top: 2px;
}

.nav {
  flex: 1;
  padding: 20px 0;
}

.nav-item {
  padding: 14px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: all 0.2s;
  border-left: 3px solid transparent;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.nav-item.active {
  background: rgba(255, 255, 255, 0.15);
  border-left-color: #52C41A;
}

.nav-icon {
  font-size: 20px;
}

.nav-label {
  font-size: 15px;
  font-weight: 500;
}

.stats {
  padding: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.stat-item {
  margin-bottom: 15px;
}

.stat-item:last-child {
  margin-bottom: 0;
}

.stat-label {
  font-size: 12px;
  opacity: 0.7;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
}

.stat-value.warning {
  color: #FA8C16;
}

/* 主内容区 */
.main-content {
  flex: 1;
  overflow-y: auto;
  background: #F0F2F5;
}

@media (max-width: 768px) {
  .app {
    flex-direction: column;
  }

  .sidebar {
    width: 100%;
    order: 2;
    flex-direction: row;
    align-items: stretch;
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.15);
  }

  .logo,
  .stats {
    display: none;
  }

  .nav {
    display: flex;
    flex: 1;
    padding: 0;
  }

  .nav-item {
    flex: 1;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    padding: 10px 8px;
    border-left: none;
    border-top: 3px solid transparent;
    text-align: center;
  }

  .nav-item.active {
    border-left-color: transparent;
    border-top-color: #52C41A;
  }

  .nav-label {
    font-size: 12px;
  }

  .main-content {
    order: 1;
    min-height: 0;
  }
}
</style>
