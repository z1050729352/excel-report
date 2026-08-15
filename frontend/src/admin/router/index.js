import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/login'
  },
  {
    path: '/login',
    name: 'AdminLogin',
    component: () => import('../views/Login.vue'),
    meta: { title: '管理员登录' }
  },
  {
    path: '/admin',
    component: () => import('../layouts/AdminLayout.vue'),
    redirect: '/admin/dashboard',
    meta: { requiresAuth: true },
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('../views/Dashboard.vue'),
        meta: { title: '数据概览', icon: 'DataLine' }
      },
      {
        path: 'merchants',
        name: 'Merchants',
        component: () => import('../views/Merchants.vue'),
        meta: { title: '商户管理', icon: 'Shop' }
      },
      {
        path: 'products',
        name: 'Products',
        component: () => import('../views/Products.vue'),
        meta: { title: '货源管理', icon: 'Goods' }
      },
      {
        path: 'changes',
        name: 'Changes',
        component: () => import('../views/Changes.vue'),
        meta: { title: '更变管理', icon: 'EditPen' }
      },
      {
        path: 'import',
        name: 'Import',
        component: () => import('../views/Import.vue'),
        meta: { title: '数据导入', icon: 'Upload' }
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('../views/Settings.vue'),
        meta: { title: '系统设置', icon: 'Setting' }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

// 路由守卫
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('admin_token')
  
  if (to.meta.requiresAuth && !token) {
    next('/login')
  } else if (to.path === '/login' && token) {
    next('/admin')
  } else {
    next()
  }
})

export default router
