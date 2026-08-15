<template>
  <div class="products-page">
    <div class="page-header">
      <h2 class="page-title">货源管理</h2>
      <el-button type="primary" @click="$router.push('/admin/import')">
        <el-icon><Upload /></el-icon>
        导入货源表
      </el-button>
    </div>

    <el-alert
      title="说明"
      type="info"
      :closable="false"
      style="margin-bottom: 20px"
    >
      货源信息通过Excel表格导入，不支持手动添加或编辑。导入时会自动更新所有货源数据和配额信息。
    </el-alert>
    
    <!-- 搜索栏 -->
    <div class="filter-bar">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索货源名称或编码"
        clearable
        class="filter-input"
        @clear="fetchProducts"
        @keyup.enter="fetchProducts"
      >
        <template #append>
          <el-button @click="fetchProducts">
            <el-icon><Search /></el-icon>
          </el-button>
        </template>
      </el-input>
      
      <el-select
        v-model="searchCategory"
        placeholder="价位段"
        clearable
        style="width: 130px"
        @change="fetchProducts"
      >
        <el-option label="5段" value="5段" />
        <el-option label="6段" value="6段" />
        <el-option label="7段" value="7段" />
      </el-select>
    </div>
    
    <!-- 商品表格 -->
    <div class="table-container">
      <el-table
        :data="products"
        v-loading="loading"
        style="width: 100%"
      >
        <el-table-column prop="product_code" label="货源编码" width="120" />
        <el-table-column prop="product_name" label="货源名称" min-width="200" />
        <el-table-column prop="mode" label="投放模式" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.mode" size="small">{{ row.mode }}</el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="seg" label="价位段" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.seg" type="warning" size="small">{{ row.seg }}</el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="进价" width="100">
          <template #default="{ row }">
            ¥{{ formatMoney(row.cost_price || 0) }}
          </template>
        </el-table-column>
        <el-table-column label="零售价" width="100">
          <template #default="{ row }">
            ¥{{ formatMoney(row.sell_price || 0) }}
          </template>
        </el-table-column>
        <el-table-column label="毛利" width="100">
          <template #default="{ row }">
            <span :style="{ color: row.profit > 0 ? '#67c23a' : '#909399' }">
              ¥{{ formatMoney(row.profit || 0) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="unit" label="单位" width="80" />
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
              @current-change="fetchProducts"
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
            @size-change="fetchProducts"
            @current-change="fetchProducts"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { formatMoney } from '@/shared/utils/format'
import request from '@/shared/api/request'

const loading = ref(false)
const products = ref([])
const searchKeyword = ref('')
const searchCategory = ref('')

const windowWidth = ref(window.innerWidth)
const isMobile = computed(() => windowWidth.value < 768)
const onResize = () => { windowWidth.value = window.innerWidth }

const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
})

onMounted(() => {
  window.addEventListener('resize', onResize)
  fetchProducts()
})
onUnmounted(() => window.removeEventListener('resize', onResize))

const fetchProducts = async () => {
  loading.value = true
  try {
    const res = await request.get('/admin/products', {
      params: {
        keyword: searchKeyword.value,
        seg: searchCategory.value,
        page: pagination.page,
        pageSize: pagination.pageSize
      }
    })
    
    if (res.success) {
      products.value = res.data || []
      pagination.total = res.pagination?.total || 0
    } else {
      products.value = []
      pagination.total = 0
    }
  } catch (error) {
    // 静默处理，没有数据就显示空列表
    products.value = []
    pagination.total = 0
    console.error('获取货源列表失败:', error)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.products-page {
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
  width: 260px;
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
}
</style>
