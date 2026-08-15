<template>
  <el-container class="admin-layout">
    <!-- 移动端遮罩 -->
    <div
      v-if="isMobile && !isCollapse"
      class="mobile-overlay"
      @click="isCollapse = true"
    />

    <!-- 侧边栏 -->
    <el-aside
      :width="isCollapse ? '0px' : '220px'"
      class="admin-aside"
      :class="{ 'aside-mobile': isMobile, 'aside-hidden': isMobile && isCollapse }"
    >
      <div class="logo-container">
        <el-icon class="logo-icon"><Shop /></el-icon>
        <span class="logo-text">烟草订货系统</span>
      </div>

      <el-menu
        :default-active="activeMenu"
        :collapse="false"
        :collapse-transition="false"
        class="admin-menu"
        router
        @select="onMenuSelect"
      >
        <el-menu-item
          v-for="route in menuRoutes"
          :key="route.path"
          :index="route.path"
        >
          <el-icon><component :is="route.meta.icon" /></el-icon>
          <template #title>{{ route.meta.title }}</template>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <!-- 主内容区 -->
    <el-container class="admin-main">
      <!-- 顶部导航 -->
      <el-header class="admin-header">
        <div class="header-left">
          <el-button text @click="toggleCollapse" class="collapse-btn">
            <el-icon size="22">
              <Fold v-if="!isCollapse" />
              <Expand v-else />
            </el-icon>
          </el-button>

          <el-breadcrumb separator="/" class="breadcrumb-hide-mobile">
            <el-breadcrumb-item :to="{ path: '/admin' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item v-if="currentRoute">{{ currentRoute.meta?.title }}</el-breadcrumb-item>
          </el-breadcrumb>

          <!-- 移动端当前页标题 -->
          <span v-if="isMobile && currentRoute" class="mobile-page-title">
            {{ currentRoute.meta?.title }}
          </span>
        </div>

        <div class="header-right">
          <el-dropdown @command="handleCommand">
            <div class="user-info">
              <el-avatar :size="30">
                <el-icon><User /></el-icon>
              </el-avatar>
              <span class="username" v-if="!isMobile">管理员</span>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="logout">
                  <el-icon><SwitchButton /></el-icon>
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <!-- 内容区 -->
      <el-main class="admin-content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessageBox } from 'element-plus'

const router = useRouter()
const route = useRoute()

const windowWidth = ref(window.innerWidth)
const isMobile = computed(() => windowWidth.value < 768)

// 移动端默认收起，PC端默认展开
const isCollapse = ref(window.innerWidth < 768)

const onResize = () => {
  windowWidth.value = window.innerWidth
  // 切换到PC时自动展开
  if (window.innerWidth >= 768) {
    isCollapse.value = false
  } else {
    isCollapse.value = true
  }
}
onMounted(() => window.addEventListener('resize', onResize))
onUnmounted(() => window.removeEventListener('resize', onResize))

const menuRoutes = computed(() => {
  return router.options.routes
    .find(r => r.path === '/admin')
    ?.children.filter(r => r.meta?.title) || []
})

const activeMenu = computed(() => route.path)

const currentRoute = computed(() => {
  return menuRoutes.value.find(r => r.path === route.path)
})

const toggleCollapse = () => {
  isCollapse.value = !isCollapse.value
}

// 移动端点击菜单后自动收起
const onMenuSelect = () => {
  if (isMobile.value) {
    isCollapse.value = true
  }
}

const handleCommand = async (command) => {
  if (command === 'logout') {
    try {
      await ElMessageBox.confirm('确定要退出登录吗？', '提示', { type: 'warning' })
      localStorage.removeItem('admin_token')
      router.push('/login')
    } catch {
      // 取消
    }
  }
}
</script>

<style scoped>
.admin-layout {
  height: 100vh;
  background: #F7F4EF;
  overflow: hidden;
}

/* 移动端遮罩 */
.mobile-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 999;
}

/* 侧边栏 */
.admin-aside {
  background: #1F2421;
  transition: width 0.28s ease;
  overflow-x: hidden;
  overflow-y: auto;
  flex-shrink: 0;
}

/* 移动端侧边栏：绝对定位覆盖内容 */
.aside-mobile {
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  z-index: 1000;
  width: 220px !important;
}

.aside-hidden {
  width: 0 !important;
  overflow: hidden;
}

.logo-container {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  padding: 0 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  white-space: nowrap;
}

.logo-text {
  font-size: 15px;
  font-weight: 600;
  color: #FFFFFF;
}

.logo-icon {
  font-size: 22px;
  color: #FFFFFF;
  flex-shrink: 0;
}

.admin-menu {
  border-right: none;
  background: #1F2421;
}

.admin-menu :deep(.el-menu-item) {
  color: rgba(255, 255, 255, 0.7);
  height: 50px;
}

.admin-menu :deep(.el-menu-item:hover),
.admin-menu :deep(.el-menu-item.is-active) {
  background: #C4612F !important;
  color: #FFFFFF;
}

/* 主区域 */
.admin-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.admin-header {
  background: #FFFFFF;
  border-bottom: 1px solid #E7E1D7;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 56px;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.collapse-btn {
  color: #5C635D;
  flex-shrink: 0;
}

.breadcrumb-hide-mobile {
  display: flex;
}

.mobile-page-title {
  font-size: 15px;
  font-weight: 500;
  color: #1F2421;
}

.header-right {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 8px;
  transition: background 0.2s;
}

.user-info:hover {
  background: #F7F4EF;
}

.username {
  font-size: 14px;
  color: #1F2421;
}

.admin-content {
  background: #F7F4EF;
  padding: 16px;
  overflow-y: auto;
  flex: 1;
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 767px) {
  .breadcrumb-hide-mobile {
    display: none;
  }

  .admin-content {
    padding: 12px;
  }
}
</style>
