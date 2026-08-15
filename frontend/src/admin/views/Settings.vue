<template>
  <div class="settings-page">
    <h2 class="page-title">系统设置</h2>
    
    <el-tabs v-model="activeTab" class="settings-tabs">
      <!-- 基本设置 -->
      <el-tab-pane label="基本设置" name="basic">
        <el-form
          ref="basicFormRef"
          :model="basicForm"
          label-width="120px"
          class="settings-form"
        >
          <el-form-item label="系统名称">
            <el-input v-model="basicForm.systemName" />
          </el-form-item>
          
          <el-form-item label="联系电话">
            <el-input v-model="basicForm.contactPhone" />
          </el-form-item>
          
          <el-form-item label="联系邮箱">
            <el-input v-model="basicForm.contactEmail" />
          </el-form-item>
          
          <el-form-item label="系统公告">
            <el-input
              v-model="basicForm.announcement"
              type="textarea"
              :rows="4"
              placeholder="请输入系统公告"
            />
          </el-form-item>
          
          <el-form-item>
            <el-button type="primary" @click="saveBasicSettings" :loading="saving">
              保存
            </el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>
      
      <!-- 修改密码 -->
      <el-tab-pane label="修改密码" name="password">
        <el-form
          ref="passwordFormRef"
          :model="passwordForm"
          :rules="passwordRules"
          label-width="120px"
          class="settings-form"
        >
          <el-form-item label="原密码" prop="oldPassword">
            <el-input
              v-model="passwordForm.oldPassword"
              type="password"
              show-password
            />
          </el-form-item>
          
          <el-form-item label="新密码" prop="newPassword">
            <el-input
              v-model="passwordForm.newPassword"
              type="password"
              show-password
            />
          </el-form-item>
          
          <el-form-item label="确认密码" prop="confirmPassword">
            <el-input
              v-model="passwordForm.confirmPassword"
              type="password"
              show-password
            />
          </el-form-item>
          
          <el-form-item>
            <el-button type="primary" @click="handleChangePassword" :loading="saving">
              修改密码
            </el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import request from '@/shared/api/request'

const router = useRouter()
const activeTab = ref('basic')
const saving = ref(false)

const basicFormRef = ref(null)
const passwordFormRef = ref(null)

const basicForm = reactive({
  systemName: '烟草订货优化系统',
  contactPhone: '',
  contactEmail: '',
  announcement: ''
})

const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const validateConfirmPassword = (rule, value, callback) => {
  if (value !== passwordForm.newPassword) {
    callback(new Error('两次输入的密码不一致'))
  } else {
    callback()
  }
}

const passwordRules = {
  oldPassword: [
    { required: true, message: '请输入原密码', trigger: 'blur' }
  ],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于6位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认新密码', trigger: 'blur' },
    { validator: validateConfirmPassword, trigger: 'blur' }
  ]
}

onMounted(() => {
  loadSettings()
})

const loadSettings = async () => {
  try {
    const res = await request.get('/admin/settings')
    if (res.success && res.data) {
      Object.assign(basicForm, res.data.basic || {})
    }
  } catch (error) {
    console.error('获取设置失败:', error)
  }
}

const saveBasicSettings = async () => {
  saving.value = true
  try {
    await request.put('/admin/settings/basic', basicForm)
    ElMessage.success('保存成功')
  } catch (error) {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

const handleChangePassword = async () => {
  if (!passwordFormRef.value) return
  
  await passwordFormRef.value.validate(async (valid) => {
    if (!valid) return
    
    saving.value = true
    try {
      await request.put('/auth/password', {
        oldPassword: passwordForm.oldPassword,
        newPassword: passwordForm.newPassword
      })
      
      ElMessage.success('密码修改成功，请重新登录')
      
      passwordForm.oldPassword = ''
      passwordForm.newPassword = ''
      passwordForm.confirmPassword = ''
      passwordFormRef.value.resetFields()
      
      setTimeout(() => {
        localStorage.removeItem('admin_token')
        router.push('/login')
      }, 1500)
    } catch (error) {
      ElMessage.error(error.message || '修改密码失败')
    } finally {
      saving.value = false
    }
  })
}
</script>

<style scoped>
.settings-page {
  max-width: 900px;
  margin: 0 auto;
}

.page-title {
  font-size: 24px;
  font-weight: 500;
  color: #1F2421;
  margin: 0 0 24px 0;
}

.settings-tabs {
  background: #FFFFFF;
  border-radius: 12px;
  padding: 24px;
  border: 1px solid #E7E1D7;
}

.settings-form {
  max-width: 600px;
  padding: 20px 0;
}

.form-hint {
  margin-left: 12px;
  font-size: 13px;
  color: #5C635D;
}

:deep(.el-divider) {
  margin: 20px 0;
}
</style>
