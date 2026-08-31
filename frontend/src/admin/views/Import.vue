<template>
  <div class="import-page">
    <h2 class="page-title">数据导入</h2>

    <el-alert
      title="导入说明"
      type="info"
      :closable="false"
      style="margin-bottom: 24px"
    >
      <ul style="margin: 0; padding-left: 20px">
        <li>商户表和货源表：全量替换，导入后会清空原有数据并导入新数据</li>
        <li>更变表：增量添加，导入后需要到"更变管理"页面应用更变</li>
        <li>支持的文件格式：.xlsx, .xls</li>
      </ul>
    </el-alert>

    <!-- 商户表上传 -->
    <div class="import-card">
      <div class="card-header">
        <div class="header-info">
          <h3>
            <el-icon class="header-icon"><User /></el-icon>
            商户信息表
          </h3>
          <p>导入商户基础信息，包括许可证号、名称、档位、信用等级等</p>
        </div>
        <el-upload
          :action="uploadUrl + '/merchants'"
          :headers="uploadHeaders"
          :on-success="(res) => handleUploadSuccess(res, '商户信息')"
          :on-error="handleUploadError"
          :before-upload="beforeUpload"
          :show-file-list="false"
          accept=".xlsx,.xls"
        >
          <el-button type="primary" :loading="uploadingMerchants">
            <el-icon><Upload /></el-icon>
            选择文件上传
          </el-button>
        </el-upload>
      </div>
      <div v-if="merchantsResult" class="upload-result">
        <el-icon class="result-icon success"><CircleCheck /></el-icon>
        <span>{{ merchantsResult }}</span>
      </div>
    </div>

    <!-- 货源表上传 -->
    <div class="import-card">
      <div class="card-header">
        <div class="header-info">
          <h3>
            <el-icon class="header-icon"><Goods /></el-icon>
            货源投放表（烟草进价零售价毛利表）
          </h3>
          <p>请上传包含商品名称、进价、零售价、各档位配额的Excel文件（如：烟草进价零售价毛利表.xlsx），注意不是"货源投放策略"文件</p>
        </div>
        <el-upload
          :action="uploadUrl + '/products'"
          :headers="uploadHeaders"
          :on-success="(res) => handleUploadSuccess(res, '货源信息')"
          :on-error="handleUploadError"
          :before-upload="beforeUpload"
          :show-file-list="false"
          accept=".xlsx,.xls"
        >
          <el-button type="primary" :loading="uploadingProducts">
            <el-icon><Upload /></el-icon>
            选择文件上传
          </el-button>
        </el-upload>
      </div>
      <div v-if="productsResult" class="upload-result">
        <el-icon class="result-icon success"><CircleCheck /></el-icon>
        <span>{{ productsResult }}</span>
      </div>
    </div>

    <!-- 投放策略上传 -->
    <div class="import-card">
      <div class="card-header">
        <div class="header-info">
          <h3>
            <el-icon class="header-icon"><DataLine /></el-icon>
            货源投放策略
          </h3>
          <p>导入烟草公司定期更新的投放策略文件（如：货源投放策略7.23.xls），系统将按商品名称匹配并覆盖各档位配额，价格数据保持不变。若商品名不在系统中则自动跳过。</p>
        </div>
        <el-upload
          :action="uploadUrl + '/strategy'"
          :headers="uploadHeaders"
          :on-success="(res) => handleUploadSuccess(res, '投放策略')"
          :on-error="handleUploadError"
          :before-upload="beforeUpload"
          :show-file-list="false"
          accept=".xlsx,.xls"
        >
          <el-button type="warning">
            <el-icon><Upload /></el-icon>
            选择文件上传
          </el-button>
        </el-upload>
      </div>
      <div v-if="strategyResult" class="upload-result">
        <el-icon class="result-icon success"><CircleCheck /></el-icon>
        <span>{{ strategyResult }}</span>
      </div>
    </div>

    <!-- 商户订货表(销量)上传 -->
    <div class="import-card">
      <div class="card-header">
        <div class="header-info">
          <h3>
            <el-icon class="header-icon"><TrendCharts /></el-icon>
            商户订货表（当月销量）
          </h3>
          <p>导入"多指标销售汇总"表（如：商户8月订货量.xlsx），系统按客户编码匹配商户，更新其当月销量、含税销额、单箱值，用于商户端生成经营策略。仅更新已存在的商户。</p>
        </div>
        <el-upload
          :action="uploadUrl + '/sales'"
          :headers="uploadHeaders"
          :on-success="(res) => handleUploadSuccess(res, '销量数据')"
          :on-error="handleUploadError"
          :before-upload="beforeUpload"
          :show-file-list="false"
          accept=".xlsx,.xls"
        >
          <el-button type="success">
            <el-icon><Upload /></el-icon>
            选择文件上传
          </el-button>
        </el-upload>
      </div>
      <div v-if="salesResult" class="upload-result">
        <el-icon class="result-icon success"><CircleCheck /></el-icon>
        <span>{{ salesResult }}</span>
      </div>
    </div>

    <!-- 更变表上传 -->
    <div class="import-card">
      <div class="card-header">
        <div class="header-info">
          <h3>
            <el-icon class="header-icon"><EditPen /></el-icon>
            信息更变表
          </h3>
          <p>导入商户信息更变，包括新增、修改、删除操作，导入后需要手动应用</p>
        </div>
        <el-upload
          :action="uploadUrl + '/changes'"
          :headers="uploadHeaders"
          :on-success="(res) => handleUploadSuccess(res, '信息更变')"
          :on-error="handleUploadError"
          :before-upload="beforeUpload"
          :show-file-list="false"
          accept=".xlsx,.xls"
        >
          <el-button type="primary" :loading="uploadingChanges">
            <el-icon><Upload /></el-icon>
            选择文件上传
          </el-button>
        </el-upload>
      </div>
      <div v-if="changesResult" class="upload-result">
        <el-icon class="result-icon success"><CircleCheck /></el-icon>
        <span>{{ changesResult }}</span>
        <el-button
          v-if="changesResult"
          type="text"
          @click="$router.push('/admin/changes')"
          style="margin-left: 12px"
        >
          前往应用更变 →
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'

const uploadingMerchants = ref(false)
const uploadingProducts = ref(false)
const uploadingChanges = ref(false)
const uploadingStrategy = ref(false)

const merchantsResult = ref('')
const productsResult = ref('')
const changesResult = ref('')
const strategyResult = ref('')
const salesResult = ref('')

const uploadUrl = computed(() => {
  return import.meta.env.VITE_API_BASE_URL + '/admin/import'
})

const uploadHeaders = computed(() => {
  const token = localStorage.getItem('admin_token')
  return {
    Authorization: `Bearer ${token}`
  }
})

const beforeUpload = (file) => {
  const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                  file.type === 'application/vnd.ms-excel'
  const isLt10M = file.size / 1024 / 1024 < 10

  if (!isExcel) {
    ElMessage.error('只能上传 Excel 文件')
    return false
  }
  if (!isLt10M) {
    ElMessage.error('文件大小不能超过 10MB')
    return false
  }
  return true
}

const handleUploadSuccess = (response, type) => {
  if (response.success) {
    ElMessage.success(`${type}导入成功`)
    
    if (type === '商户信息') {
      merchantsResult.value = response.message || `成功导入 ${response.count} 条商户信息`
      uploadingMerchants.value = false
    } else if (type === '货源信息') {
      productsResult.value = response.message || `成功导入 ${response.count} 条货源信息`
      uploadingProducts.value = false
    } else if (type === '信息更变') {
      changesResult.value = response.message || `成功导入 ${response.count} 条信息更变`
      uploadingChanges.value = false
    } else if (type === '投放策略') {
      strategyResult.value = response.message || `投放策略导入成功`
      uploadingStrategy.value = false
    } else if (type === '销量数据') {
      salesResult.value = response.message || `销量数据导入成功`
    }
  } else {
    ElMessage.error(response.error || `${type}导入失败`)
  }
}

const handleUploadError = (error) => {
  ElMessage.error('文件上传失败，请检查网络连接')
  uploadingMerchants.value = false
  uploadingProducts.value = false
  uploadingChanges.value = false
}
</script>

<style scoped>
.import-page {
  max-width: 900px;
  margin: 0 auto;
}

.page-title {
  font-size: 24px;
  font-weight: 500;
  color: #1F2421;
  margin: 0 0 24px 0;
}

.import-card {
  background: #FFFFFF;
  border: 1px solid #E7E1D7;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 20px;
  transition: box-shadow 0.2s;
}

.import-card:hover {
  box-shadow: 0 4px 12px rgba(31, 36, 33, 0.08);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.header-info {
  flex: 1;
}

.header-info h3 {
  font-size: 18px;
  font-weight: 500;
  color: #1F2421;
  margin: 0 0 8px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  color: #C4612F;
  font-size: 20px;
}

.header-info p {
  font-size: 14px;
  color: #5C635D;
  margin: 0;
  line-height: 1.6;
}

.upload-result {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #E7E1D7;
  display: flex;
  align-items: center;
  font-size: 14px;
  color: #5C635D;
}

.result-icon {
  margin-right: 8px;
  font-size: 18px;
}

.result-icon.success {
  color: #67c23a;
}
</style>
