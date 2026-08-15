<template>
  <div class="merchants-page">
    <div class="page-header">
      <h2 class="page-title">商户管理</h2>
      <el-button type="primary" @click="$router.push('/admin/import')">
        <el-icon><Upload /></el-icon>
        导入商户表
      </el-button>
    </div>

    <el-alert
      title="说明"
      type="info"
      :closable="false"
      style="margin-bottom: 20px"
    >
      商户信息通过Excel表格导入，不支持手动添加或编辑。如需修改商户信息，请导入更变表。
    </el-alert>

    <!-- 搜索栏 -->
    <div class="filter-bar">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索商户名称或许可证号"
        clearable
        class="filter-input"
        @clear="fetchMerchants"
        @keyup.enter="fetchMerchants"
      >
        <template #append>
          <el-button @click="fetchMerchants">
            <el-icon><Search /></el-icon>
          </el-button>
        </template>
      </el-input>

      <el-select
        v-model="searchLevel"
        placeholder="诚信等级"
        clearable
        style="width: 140px"
        @change="fetchMerchants"
      >
        <el-option label="A级" value="A" />
        <el-option label="B级" value="B" />
        <el-option label="C级" value="C" />
        <el-option label="D级" value="D" />
      </el-select>
    </div>

    <!-- 商户表格 -->
    <div class="table-container">
      <el-table
        :data="merchants"
        v-loading="loading"
        style="width: 100%"
        :scroll-x="true"
      >
        <el-table-column prop="license_no" label="许可证号" min-width="160" />
        <el-table-column prop="customer_name" label="客户名称" min-width="160" show-overflow-tooltip />
        <el-table-column prop="tier" label="档位" width="90" />
        <el-table-column prop="credit_level" label="诚信等级" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.credit_level" size="small">{{ row.credit_level }}</el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="contact" label="联系电话" min-width="130" />
        <el-table-column prop="customer_status" label="客户状态" width="100">
          <template #default="{ row }">
            <el-tag
              :type="row.customer_status === '正常' || row.customer_status === '活跃' ? 'success' : 'info'"
              size="small"
            >
              {{ row.customer_status || '正常' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openDetail(row)">
              查看详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination">
        <!-- 移动端：精简分页 -->
        <template v-if="isMobile">
          <div class="mobile-pagination">
            <span class="mobile-pagination-total">共 {{ pagination.total }} 条</span>
            <el-pagination
              v-model:current-page="pagination.page"
              v-model:page-size="pagination.pageSize"
              :total="pagination.total"
              layout="prev, pager, next"
              :pager-count="5"
              small
              @current-change="fetchMerchants"
            />
          </div>
        </template>
        <!-- PC端：完整分页 -->
        <template v-else>
          <el-pagination
            v-model:current-page="pagination.page"
            v-model:page-size="pagination.pageSize"
            :page-sizes="[10, 20, 50, 100]"
            :total="pagination.total"
            layout="total, sizes, prev, pager, next"
            @size-change="fetchMerchants"
            @current-change="fetchMerchants"
          />
        </template>
      </div>
    </div>

    <!-- 详情弹窗 -->
    <el-dialog
      v-model="detailVisible"
      :title="currentMerchant?.customer_name || '商户详情'"
      :width="isMobile ? '95%' : '760px'"
      class="detail-dialog"
    >
      <div v-if="currentMerchant" class="detail-content">
        <!-- 基本信息 -->
        <div class="detail-section">
          <div class="section-title">基本信息</div>
          <div class="detail-grid">
            <div class="detail-item" v-for="field in basicFields" :key="field.key">
              <span class="detail-label">{{ field.label }}</span>
              <span class="detail-value">{{ currentMerchant[field.key] || '-' }}</span>
            </div>
          </div>
        </div>
        <!-- 经营信息 -->
        <div class="detail-section">
          <div class="section-title">经营信息</div>
          <div class="detail-grid">
            <div class="detail-item" v-for="field in bizFields" :key="field.key">
              <span class="detail-label">{{ field.label }}</span>
              <span class="detail-value">{{ currentMerchant[field.key] || '-' }}</span>
            </div>
          </div>
        </div>
        <!-- 订货与结算 -->
        <div class="detail-section">
          <div class="section-title">订货与结算</div>
          <div class="detail-grid">
            <div class="detail-item" v-for="field in orderFields" :key="field.key">
              <span class="detail-label">{{ field.label }}</span>
              <span class="detail-value">{{ currentMerchant[field.key] || '-' }}</span>
            </div>
          </div>
        </div>
        <!-- 终端信息 -->
        <div class="detail-section">
          <div class="section-title">终端信息</div>
          <div class="detail-grid">
            <div class="detail-item" v-for="field in terminalFields" :key="field.key">
              <span class="detail-label">{{ field.label }}</span>
              <span class="detail-value">{{ currentMerchant[field.key] || '-' }}</span>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import request from '@/shared/api/request'

const loading = ref(false)
const merchants = ref([])
const searchKeyword = ref('')
const searchLevel = ref('')
const detailVisible = ref(false)
const currentMerchant = ref(null)

const windowWidth = ref(window.innerWidth)
const isMobile = computed(() => windowWidth.value < 768)

const onResize = () => { windowWidth.value = window.innerWidth }
onMounted(() => {
  window.addEventListener('resize', onResize)
  fetchMerchants()
})
onUnmounted(() => window.removeEventListener('resize', onResize))

const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
})

// 字段分组定义
const basicFields = [
  { key: 'license_no',       label: '许可证号' },
  { key: 'customer_name',    label: '客户名称' },
  { key: 'company',          label: '公司' },
  { key: 'legal_person',     label: '法人' },
  { key: 'customer_status',  label: '客户状态' },
  { key: 'contact',          label: '联系电话' },
  { key: 'district',         label: '区县' },
  { key: 'market_dept',      label: '市场部' },
  { key: 'sales_line',       label: '营销线' },
  { key: 'address',          label: '经营地址' },
  { key: 'credit_level',     label: '诚信等级' },
  { key: 'join_date',        label: '入网日期' },
]
const bizFields = [
  { key: 'business_scope',   label: '经营范围' },
  { key: 'shop_name',        label: '店铺门头名称' },
  { key: 'market_type',      label: '市场类型' },
  { key: 'market_type_sub',  label: '市场类型细分' },
  { key: 'business_type',    label: '业态' },
  { key: 'business_scale',   label: '经营规模' },
  { key: 'business_circle',  label: '商圈' },
]
const orderFields = [
  { key: 'order_cycle',      label: '订货周期类型' },
  { key: 'order_day',        label: '订货日' },
  { key: 'order_method',     label: '订货方式' },
  { key: 'payment_method',   label: '结算方式' },
  { key: 'online_payment',   label: '网上结算' },
]
const terminalFields = [
  { key: 'tier_code',           label: '档位编码' },
  { key: 'tier',                label: '档位' },
  { key: 'terminal_level',      label: '终端层级' },
  { key: 'terminal_type',       label: '终端类别' },
  { key: 'terminal_type_sub',   label: '终端类型细分' },
  { key: 'cigar_tier',          label: '雪茄烟档位' },
  { key: 'cigar_terminal_type', label: '雪茄烟终端类型' },
  { key: 'sample_type',         label: '自动采集样本户类型' },
]

const openDetail = (row) => {
  currentMerchant.value = row
  detailVisible.value = true
}

const fetchMerchants = async () => {
  loading.value = true
  try {
    const res = await request.get('/admin/merchants', {
      params: {
        keyword: searchKeyword.value,
        level: searchLevel.value,
        page: pagination.page,
        pageSize: pagination.pageSize
      }
    })
    if (res.success) {
      merchants.value = res.data || []
      pagination.total = res.pagination?.total || 0
    } else {
      merchants.value = []
      pagination.total = 0
    }
  } catch (error) {
    merchants.value = []
    pagination.total = 0
    console.error('获取商户列表失败:', error)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.merchants-page {
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
  font-size: 22px;
  font-weight: 500;
  color: #1F2421;
  margin: 0;
}

.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.filter-input {
  width: 280px;
}

.table-container {
  background: #FFFFFF;
  border-radius: 12px;
  padding: 16px;
  border: 1px solid #E7E1D7;
  overflow-x: auto;
}

.pagination {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}

.mobile-pagination {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.mobile-pagination-total {
  font-size: 13px;
  color: #5C635D;
}

/* 详情弹窗 */
.detail-content {
  max-height: 60vh;
  overflow-y: auto;
}

.detail-section {
  margin-bottom: 20px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #C4612F;
  border-left: 3px solid #C4612F;
  padding-left: 8px;
  margin-bottom: 12px;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 20px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.detail-label {
  font-size: 12px;
  color: #888;
}

.detail-value {
  font-size: 13px;
  color: #1F2421;
  word-break: break-all;
}

@media (max-width: 767px) {
  .page-title {
    font-size: 18px;
  }

  .filter-input {
    width: 100%;
  }

  .filter-bar {
    flex-direction: column;
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
