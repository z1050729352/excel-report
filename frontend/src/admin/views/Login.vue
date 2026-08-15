<template>
  <div class="login-page">
    <div class="login-container">
      <div class="login-header">
        <h1>烟草订货系统</h1>
        <p class="subtitle">管理后台</p>
      </div>
      
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        class="login-form"
        @keyup.enter="handleLogin"
      >
        <el-form-item prop="username">
          <el-input
            v-model="form.username"
            placeholder="请输入用户名"
            size="large"
            clearable
          >
            <template #prefix>
              <el-icon><User /></el-icon>
            </template>
          </el-input>
        </el-form-item>
        
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            size="large"
            show-password
          >
            <template #prefix>
              <el-icon><Lock /></el-icon>
            </template>
          </el-input>
        </el-form-item>
        
        <el-form-item>
          <el-button
            type="primary"
            size="large"
            :loading="loading"
            @click="handleLogin"
            class="login-btn"
          >
            登录
          </el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import request from '@/shared/api/request'

const router = useRouter()
const formRef = ref(null)
const loading = ref(false)

const form = reactive({
  username: '',
  password: ''
})

const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' }
  ]
}

const handleLogin = async () => {
  if (!formRef.value) return
  
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    
    loading.value = true
    try {
      const res = await request.post('/auth/login', form)
      
      localStorage.setItem('admin_token', res.token)
      ElMessage.success('登录成功')
      
      // 使用 replace 而不是 push，避免可以返回到登录页
      router.replace('/admin')
    } catch (error) {
      ElMessage.error(error.message || '登录失败')
    } finally {
      loading.value = false
    }
  })
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #F7F4EF 0%, #F2E3D6 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.login-container {
  width: 100%;
  max-width: 420px;
  background: #FFFFFF;
  border-radius: 16px;
  padding: 48px 40px;
  box-shadow: 0 8px 24px rgba(31, 36, 33, 0.08);
}

.login-header {
  text-align: center;
  margin-bottom: 40px;
}

.login-header h1 {
  font-family: 'Playfair Display', serif;
  font-size: 28px;
  font-weight: 400;
  color: #1F2421;
  margin: 0 0 8px 0;
  letter-spacing: -0.02em;
}

.subtitle {
  font-size: 14px;
  color: #5C635D;
  margin: 0;
}

.login-form {
  margin-top: 32px;
}

.login-btn {
  width: 100%;
  background: #C4612F;
  border-color: #C4612F;
  border-radius: 999px;
  height: 44px;
  font-size: 15px;
  font-weight: 500;
}

.login-btn:hover:not(:disabled) {
  background: #A94E22;
  border-color: #A94E22;
}

:deep(.el-input__wrapper) {
  border-radius: 8px;
  border-color: #E7E1D7;
}

:deep(.el-input__wrapper:hover) {
  border-color: #C4612F;
}

:deep(.el-input__wrapper.is-focus) {
  border-color: #C4612F;
  box-shadow: 0 0 0 1px #C4612F inset;
}
</style>
