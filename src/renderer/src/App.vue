<script setup>
import { ref, computed } from 'vue'

const stage = ref('idle')
const progress = ref({ message: '', percent: 0 })
const analysisData = ref(null)
const errorMsg = ref('')
const isDragOver = ref(false)
const activeTab = ref('overview')

// AI 状态
const aiLoading = ref(false)
const aiSummary = ref('')
const aiInsightsList = ref([])
const aiQuestion = ref('')
const aiAnswer = ref('')
const aiError = ref('')

const tabs = [
  { id: 'overview', label: '📋 概览', icon: '📋' },
  { id: 'quality',  label: '✅ 质量', icon: '✅' },
  { id: 'stats',    label: '📊 统计', icon: '📊' },
  { id: 'trend',    label: '📈 趋势', icon: '📈' },
  { id: 'category', label: '🗂️ 分类', icon: '🗂️' },
  { id: 'insights', label: '💡 洞察', icon: '💡' }
]

const primaryCol = computed(() => analysisData.value?.summary?.primaryValueColumn || '')
const categoryCol = computed(() => analysisData.value?.summary?.categoryColumn || '')
const dateCol = computed(() => analysisData.value?.summary?.dateColumn || '')
const stats = computed(() => {
  if (!primaryCol.value || !analysisData.value?.summary?.columnStats) return null
  return analysisData.value.summary.columnStats[primaryCol.value]
})
const catData = computed(() => {
  if (!categoryCol.value) return []
  return analysisData.value?.categoryBreakdowns?.[categoryCol.value] || []
})
const quality = computed(() => analysisData.value?.dataQuality || null)
const qScoreLevel = computed(() => {
  const s = quality.value?.score || 0
  if (s >= 90) return 'good'
  if (s >= 60) return 'ok'
  return 'bad'
})

let unsubProgress = null
function startListeningProgress() {
  if (unsubProgress) unsubProgress()
  unsubProgress = window.electronAPI.onProgress((data) => {
    progress.value = { ...progress.value, ...data }
  })
}

async function handleFile(filePath) {
  if (!filePath) return
  stage.value = 'parsing'
  errorMsg.value = ''
  analysisData.value = null
  startListeningProgress()
  const result = await window.electronAPI.parseExcel(filePath)
  if (result.success) {
    analysisData.value = result.data
    progress.value = { message: '', percent: 0 }
    stage.value = 'done'
  } else {
    errorMsg.value = result.error || '解析失败'
    progress.value = { message: '', percent: 0 }
    stage.value = 'idle'
  }
}

async function openFile() {
  const filePath = await window.electronAPI.openFileDialog()
  if (filePath) await handleFile(filePath)
}

function onDragOver(e) { e.preventDefault(); isDragOver.value = true }
function onDragLeave() { isDragOver.value = false }
function onDrop(e) {
  e.preventDefault()
  isDragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  const ext = file.name.split('.').pop().toLowerCase()
  if (!['xlsx', 'xls', 'csv'].includes(ext)) {
    errorMsg.value = '仅支持 .xlsx / .xls / .csv'
    return
  }
  handleFile(file.path)
}

// ── 报告模板选择 ─────────────────────────────────────────────────────────────
const showExportModal = ref(false)
const reportTemplates = ref([])
const selectedTemplate = ref('detailed')
const exportMode = ref('template') // 'template' | 'ai'
const aiExportPrompt = ref('')
const aiPlanLoading = ref(false)
const aiPlan = ref(null)

async function openExportModal() {
  if (!analysisData.value) return
  showExportModal.value = true
  // 加载模板列表
  const result = await window.electronAPI.getReportTemplates()
  if (result.success) {
    reportTemplates.value = result.templates
  }
}

async function generateAiPlan() {
  if (!aiExportPrompt.value.trim()) return
  aiPlanLoading.value = true
  aiPlan.value = null
  try {
    const result = await window.electronAPI.aiReportPlan({ userRequest: aiExportPrompt.value.trim() })
    if (result.success) {
      aiPlan.value = result.plan
    } else {
      aiError.value = result.error || 'AI 规划失败'
    }
  } catch (e) {
    aiError.value = e.message
  } finally {
    aiPlanLoading.value = false
  }
}

async function generatePdf() {
  if (!analysisData.value) return
  showExportModal.value = false
  stage.value = 'generating'
  progress.value = { message: '准备中…', percent: 5 }
  startListeningProgress()

  let opts = {}
  if (exportMode.value === 'ai' && aiPlan.value) {
    // 深拷贝确保对象可被 IPC 序列化
    opts = { customPlan: JSON.parse(JSON.stringify(aiPlan.value)) }
  } else {
    opts = { templateId: selectedTemplate.value }
  }

  try {
    console.log('[renderer] generatePdf 调用, opts:', JSON.stringify(opts).slice(0, 200))
    const result = await window.electronAPI.generatePdf(opts)
    console.log('[renderer] generatePdf 返回:', result)
    if (result.success) {
      stage.value = 'done'
      progress.value = { message: `✅ PDF 已保存：${result.path}`, percent: 100 }
    } else if (result.error !== '用户取消保存') {
      errorMsg.value = result.error || '生成失败'
      stage.value = 'done'
    } else {
      stage.value = 'done'
    }
  } catch (e) {
    console.error('[renderer] generatePdf 异常:', e)
    errorMsg.value = e.message || '生成失败'
    stage.value = 'done'
  }
}

function reset() {
  stage.value = 'idle'
  analysisData.value = null
  errorMsg.value = ''
  progress.value = { message: '', percent: 0 }
  activeTab.value = 'overview'
}

function fmt(n) {
  if (n === null || n === undefined) return '—'
  return Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}
function pctStr(n) {
  if (n === null || n === undefined) return '—'
  return (n > 0 ? '+' : '') + n + '%'
}

// ── AI 调用 ──────────────────────────────────────────────────────────────────
async function runAiSummary() {
  aiLoading.value = true
  aiError.value = ''
  try {
    const result = await window.electronAPI.aiSummary()
    if (result.success) {
      aiSummary.value = result.content
      // 同时保存到缓存供 PDF 使用
      await window.electronAPI.saveAiSummary(result.content)
    } else {
      aiError.value = result.error || 'AI 摘要生成失败'
    }
  } catch (e) {
    aiError.value = e.message || '调用失败'
  } finally {
    aiLoading.value = false
  }
}

async function runAiInsights() {
  aiLoading.value = true
  aiError.value = ''
  try {
    const result = await window.electronAPI.aiInsights()
    if (result.success && result.insights) {
      aiInsightsList.value = result.insights
    } else {
      aiError.value = result.error || 'AI 洞察生成失败'
    }
  } catch (e) {
    aiError.value = e.message || '调用失败'
  } finally {
    aiLoading.value = false
  }
}

async function runAiAsk() {
  if (!aiQuestion.value.trim()) return
  aiLoading.value = true
  aiError.value = ''
  aiAnswer.value = ''
  try {
    const result = await window.electronAPI.aiAsk({ question: aiQuestion.value.trim() })
    if (result.success) {
      aiAnswer.value = result.answer
    } else {
      aiError.value = result.error || '回答失败'
    }
  } catch (e) {
    aiError.value = e.message || '调用失败'
  } finally {
    aiLoading.value = false
  }
}
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="logo">
        <span class="logo-icon">📊</span>
        <span class="logo-text">Excel 报告生成器</span>
      </div>
      <div class="topbar-actions" v-if="stage === 'done'">
        <button class="btn ghost" @click="reset">重新上传</button>
        <button class="btn primary" :disabled="stage === 'generating'" @click="openExportModal">
          {{ stage === 'generating' ? '生成中…' : '🖨️ 导出 PDF' }}
        </button>
      </div>
    </header>

    <main class="main">
      <!-- 上传区 -->
      <div v-if="stage === 'idle'" class="upload-zone" :class="{ dragover: isDragOver }"
        @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop" @click="openFile">
        <div class="upload-icon">📂</div>
        <div class="upload-title">拖入 Excel 文件，或点击选择</div>
        <div class="upload-sub">支持 .xlsx · .xls · .csv</div>
        <div v-if="errorMsg" class="upload-error">⚠️ {{ errorMsg }}</div>
      </div>

      <!-- 进度条 -->
      <div v-else-if="stage === 'parsing' || stage === 'generating'" class="progress-wrap">
        <div class="progress-title">{{ stage === 'parsing' ? '正在分析数据…' : '正在生成 PDF 报告…' }}</div>
        <div class="progress-bar-track">
          <div class="progress-bar-fill" :style="{ width: progress.percent + '%' }"></div>
        </div>
        <div class="progress-msg">{{ progress.message }}</div>
        <div class="progress-percent">{{ progress.percent }}%</div>
      </div>

      <!-- 分析结果 -->
      <div v-else-if="stage === 'done' && analysisData" class="result">
        <!-- 文件信息头 -->
        <div class="file-info-banner">
          <div class="file-info-left">
            <div class="file-name">📄 {{ analysisData.fileName }}</div>
            <div class="file-meta">
              {{ analysisData.summary.totalRows.toLocaleString() }} 行 ·
              {{ analysisData.headers.length }} 列 ·
              <span v-if="quality" :class="'q-' + qScoreLevel">质量评分 {{ quality.score }}</span>
            </div>
          </div>
          <div class="file-info-right">
            <span class="tag" v-if="primaryCol">主指标：{{ primaryCol }}</span>
            <span class="tag" v-if="categoryCol">分类：{{ categoryCol }}</span>
            <span class="tag" v-if="dateCol">时间：{{ dateCol }}</span>
          </div>
        </div>

        <!-- Tab 导航 -->
        <div class="tabs">
          <div v-for="t in tabs" :key="t.id" class="tab" :class="{ active: activeTab === t.id }" @click="activeTab = t.id">
            {{ t.label }}
          </div>
        </div>

        <!-- Tab 内容 -->

        <!-- 概览 -->
        <div v-if="activeTab === 'overview'" class="tab-panel">
          <div class="section-title">数据概览</div>
          <div class="info-cards">
            <div class="info-card primary">
              <div class="info-val">{{ analysisData.summary.totalRows.toLocaleString() }}</div>
              <div class="info-lbl">数据行数</div>
            </div>
            <div class="info-card"><div class="info-val">{{ analysisData.headers.length }}</div><div class="info-lbl">总列数</div></div>
            <div class="info-card"><div class="info-val">{{ analysisData.summary.numericColumns.length }}</div><div class="info-lbl">数值列</div></div>
            <div class="info-card"><div class="info-val">{{ analysisData.summary.categoryColumns.length }}</div><div class="info-lbl">分类列</div></div>
            <div class="info-card" v-if="quality">
              <div class="info-val" :class="'q-' + qScoreLevel">{{ quality.score }}</div>
              <div class="info-lbl">质量评分</div>
            </div>
          </div>

          <div class="section-title">数据预览（前 20 行）</div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr><th v-for="h in analysisData.headers" :key="h">{{ h }}</th></tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in analysisData.previewRows" :key="i">
                  <td v-for="h in analysisData.headers" :key="h">{{ row[h] ?? '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 质量 -->
        <div v-if="activeTab === 'quality' && quality" class="tab-panel">
          <div class="section-title">数据质量评分</div>
          <div class="quality-score-wrap">
            <div class="score-circle" :class="qScoreLevel">{{ quality.score }}</div>
            <div class="score-info">
              <div class="score-row">总单元格：<strong>{{ quality.totalCells.toLocaleString() }}</strong></div>
              <div class="score-row">缺失单元格：<strong>{{ quality.totalNulls.toLocaleString() }}</strong></div>
              <div class="score-row">整体填充率：<strong>{{ quality.overallFillRate }}%</strong></div>
              <div class="score-row">重复行数：<strong>{{ quality.duplicates }}</strong>（{{ quality.duplicateRate }}%）</div>
            </div>
          </div>

          <div class="section-title">各列填充率</div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>列名</th><th>非空数</th><th>缺失数</th><th>填充率</th></tr></thead>
              <tbody>
                <tr v-for="(info, col) in quality.columns" :key="col">
                  <td><strong>{{ col }}</strong></td>
                  <td>{{ (quality.totalRows - info.nulls).toLocaleString() }}</td>
                  <td>{{ info.nulls }}</td>
                  <td>
                    <div class="fill-bar-wrap">
                      <div class="fill-bar" :style="{ width: info.fillRate + '%' }"></div>
                      <span>{{ info.fillRate }}%</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 统计 -->
        <div v-if="activeTab === 'stats' && stats" class="tab-panel">
          <div class="section-title">主指标「{{ primaryCol }}」</div>
          <div class="stats-grid">
            <div class="stat-item"><div class="stat-val">{{ fmt(stats.sum) }}</div><div class="stat-lbl">总计</div></div>
            <div class="stat-item"><div class="stat-val">{{ fmt(stats.avg) }}</div><div class="stat-lbl">均值</div></div>
            <div class="stat-item"><div class="stat-val">{{ fmt(stats.median) }}</div><div class="stat-lbl">中位数</div></div>
            <div class="stat-item"><div class="stat-val">{{ fmt(stats.std) }}</div><div class="stat-lbl">标准差</div></div>
            <div class="stat-item"><div class="stat-val">{{ fmt(stats.max) }}</div><div class="stat-lbl">最大</div></div>
            <div class="stat-item"><div class="stat-val">{{ fmt(stats.min) }}</div><div class="stat-lbl">最小</div></div>
            <div class="stat-item"><div class="stat-val">{{ fmt(stats.p25) }}</div><div class="stat-lbl">P25</div></div>
            <div class="stat-item"><div class="stat-val">{{ fmt(stats.p75) }}</div><div class="stat-lbl">P75</div></div>
          </div>

          <div class="section-title">所有数值列</div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>列名</th><th>有效</th><th>总计</th><th>均值</th><th>中位数</th><th>最大</th><th>最小</th><th>标准差</th><th>变异系数</th></tr></thead>
              <tbody>
                <tr v-for="(s, col) in analysisData.summary.columnStats" :key="col">
                  <td><strong>{{ col }}</strong></td>
                  <td>{{ s.count.toLocaleString() }}</td>
                  <td>{{ fmt(s.sum) }}</td>
                  <td>{{ fmt(s.avg) }}</td>
                  <td>{{ fmt(s.median) }}</td>
                  <td>{{ fmt(s.max) }}</td>
                  <td>{{ fmt(s.min) }}</td>
                  <td>{{ fmt(s.std) }}</td>
                  <td :class="s.cv > 1 ? 'down' : s.cv < 0.3 ? 'up' : ''">{{ s.cv }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 趋势 -->
        <div v-if="activeTab === 'trend'" class="tab-panel">
          <div v-if="analysisData.monthlyGrowth?.length > 0">
            <div class="section-title">月度趋势（{{ primaryCol }}）</div>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>月份</th><th>合计</th><th>均值</th><th>笔数</th><th>环比</th><th>同比</th></tr></thead>
                <tbody>
                  <tr v-for="row in analysisData.monthlyGrowth.slice(-18)" :key="row.period">
                    <td>{{ row.period }}</td>
                    <td>{{ fmt(row.sum) }}</td>
                    <td>{{ fmt(row.avg) }}</td>
                    <td>{{ row.count }}</td>
                    <td :class="row.mom > 0 ? 'up' : row.mom < 0 ? 'down' : ''">{{ pctStr(row.mom) }}</td>
                    <td :class="row.yoy > 0 ? 'up' : row.yoy < 0 ? 'down' : ''">{{ pctStr(row.yoy) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div v-if="analysisData.quarterlyGrowth?.length > 0" style="margin-top:20px">
            <div class="section-title">季度趋势</div>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>季度</th><th>合计</th><th>均值</th><th>笔数</th><th>环比</th></tr></thead>
                <tbody>
                  <tr v-for="row in analysisData.quarterlyGrowth" :key="row.period">
                    <td>{{ row.period }}</td>
                    <td>{{ fmt(row.sum) }}</td>
                    <td>{{ fmt(row.avg) }}</td>
                    <td>{{ row.count }}</td>
                    <td :class="row.mom > 0 ? 'up' : row.mom < 0 ? 'down' : ''">{{ pctStr(row.mom) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div v-if="!analysisData.monthlyGrowth?.length && !analysisData.quarterlyGrowth?.length" class="empty">
            ℹ️ 未检测到日期列，无法生成时间趋势分析
          </div>
        </div>

        <!-- 分类 -->
        <div v-if="activeTab === 'category'" class="tab-panel">
          <div v-if="catData.length > 0">
            <div class="section-title">按「{{ categoryCol }}」分类</div>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>分类</th><th>合计</th><th>均值</th><th>笔数</th><th>占比</th></tr></thead>
                <tbody>
                  <tr v-for="row in catData.slice(0, 20)" :key="row.name">
                    <td>{{ row.name }}</td>
                    <td>{{ fmt(row.sum) }}</td>
                    <td>{{ fmt(row.avg) }}</td>
                    <td>{{ row.count }}</td>
                    <td>
                      <div class="pct-bar-wrap">
                        <div class="pct-bar" :style="{ width: (row.sum / catData[0].sum * 100).toFixed(1) + '%' }"></div>
                        <span>{{ stats?.sum ? (row.sum / stats.sum * 100).toFixed(1) : 0 }}%</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div v-else class="empty">ℹ️ 未检测到分类列</div>
        </div>

        <!-- 洞察 -->
        <div v-if="activeTab === 'insights'" class="tab-panel">
          <!-- AI 分析区 -->
          <div class="ai-section">
            <div class="section-title">🤖 AI 智能分析</div>
            <div class="ai-actions">
              <button class="btn primary" :disabled="aiLoading" @click="runAiSummary">
                {{ aiLoading ? '分析中…' : '📝 生成执行摘要' }}
              </button>
              <button class="btn primary" :disabled="aiLoading" @click="runAiInsights">
                {{ aiLoading ? '分析中…' : '💡 生成深度洞察' }}
              </button>
            </div>

            <!-- AI 执行摘要 -->
            <div v-if="aiSummary" class="ai-summary-box">
              <div class="ai-summary-title">📝 AI 执行摘要</div>
              <div class="ai-summary-content">{{ aiSummary }}</div>
            </div>

            <!-- AI 深度洞察 -->
            <div v-if="aiInsightsList.length > 0" class="ai-insights-box">
              <div class="ai-summary-title">💡 AI 深度洞察</div>
              <div v-for="(it, i) in aiInsightsList" :key="i" class="ai-insight-item" :class="it.type">
                <span class="ai-insight-tag">[{{ it.type }}]</span>
                <span>{{ it.text }}</span>
              </div>
            </div>

            <!-- AI 问答 -->
            <div class="ai-ask-section">
              <div class="ai-ask-title">💬 向 AI 提问</div>
              <div class="ai-ask-row">
                <input v-model="aiQuestion" class="ai-ask-input" placeholder="例如：为什么3月份数据下滑？" @keyup.enter="runAiAsk" />
                <button class="btn primary" :disabled="aiLoading || !aiQuestion.trim()" @click="runAiAsk">提问</button>
              </div>
              <div v-if="aiAnswer" class="ai-answer-box">{{ aiAnswer }}</div>
            </div>

            <div v-if="aiError" class="error-bar">⚠️ {{ aiError }}</div>
          </div>

          <!-- 规则引擎结论（兜底） -->
          <div class="section-title" style="margin-top:24px">📋 规则引擎分析</div>
          <div class="insights-list" v-if="analysisData.insights?.length">
            <div v-for="(it, i) in analysisData.insights" :key="i" class="insight-item" :class="it.type">
              <span class="insight-dot">▶</span>
              <span>{{ it.text }}</span>
            </div>
          </div>

          <div v-if="analysisData.outliers?.length > 0" style="margin-top:20px">
            <div class="section-title">⚠️ 异常值（{{ analysisData.outliers.length }} 条）</div>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th v-for="h in analysisData.headers" :key="h">{{ h }}</th></tr></thead>
                <tbody>
                  <tr v-for="(row, i) in analysisData.outliers" :key="i" class="outlier-row">
                    <td v-for="h in analysisData.headers" :key="h">{{ row[h] ?? '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- 进度/错误提示 -->
        <div v-if="progress.message && stage !== 'generating'" class="status-bar">{{ progress.message }}</div>
        <div v-if="errorMsg" class="error-bar">⚠️ {{ errorMsg }}</div>
      </div>
    </main>

    <!-- 导出模态框 -->
    <div v-if="showExportModal" class="modal-overlay" @click.self="showExportModal = false">
      <div class="modal-box">
        <div class="modal-header">
          <div class="modal-title">🖨️ 选择报告风格</div>
          <button class="modal-close" @click="showExportModal = false">✕</button>
        </div>

        <!-- 模式切换 -->
        <div class="mode-tabs">
          <div class="mode-tab" :class="{ active: exportMode === 'template' }" @click="exportMode = 'template'">
            📄 预设模板
          </div>
          <div class="mode-tab" :class="{ active: exportMode === 'ai' }" @click="exportMode = 'ai'">
            🤖 AI 定制
          </div>
        </div>

        <!-- 预设模板选择 -->
        <div v-if="exportMode === 'template'" class="template-grid">
          <div v-for="t in reportTemplates" :key="t.id"
            class="template-card" :class="{ selected: selectedTemplate === t.id }"
            @click="selectedTemplate = t.id">
            <div class="template-icon">{{ t.icon }}</div>
            <div class="template-name">{{ t.name }}</div>
            <div class="template-desc">{{ t.description }}</div>
            <div class="template-pages">{{ t.pages }}</div>
          </div>
        </div>

        <!-- AI 定制 -->
        <div v-if="exportMode === 'ai'" class="ai-export-section">
          <div class="ai-export-hint">告诉 AI 你想要什么样的报告，它会为你定制结构和内容</div>
          <div class="ai-export-examples">
            <span class="ai-example" @click="aiExportPrompt = '给老板看的简报，突出增长趋势，不要太多细节'">💼 给老板的简报</span>
            <span class="ai-example" @click="aiExportPrompt = '重点分析分类占比和异常数据，适合数据团队内部review'">📊 数据团队 Review</span>
            <span class="ai-example" @click="aiExportPrompt = '一页纸看板，信息密度高，适合打印张贴在办公室'">📈 一页看板</span>
            <span class="ai-example" @click="aiExportPrompt = '完整详细的分析报告，包含所有维度，适合存档'">📋 完整存档报告</span>
          </div>
          <div class="ai-export-input-row">
            <input v-model="aiExportPrompt" class="ai-export-input"
              placeholder="例如：给老板看的简报，重点突出增长趋势..."
              @keyup.enter="generateAiPlan" />
            <button class="btn primary" :disabled="aiPlanLoading || !aiExportPrompt.trim()" @click="generateAiPlan">
              {{ aiPlanLoading ? '规划中…' : '生成方案' }}
            </button>
          </div>
          <!-- AI 规划结果 -->
          <div v-if="aiPlan" class="ai-plan-result">
            <div class="ai-plan-title">✅ AI 已生成定制报告方案</div>
            <div class="ai-plan-sections">
              <span class="ai-plan-tag">HTML 报告已就绪，点击下方按钮导出</span>
            </div>
          </div>
        </div>

        <!-- 底部操作 -->
        <div class="modal-footer">
          <button class="btn ghost" @click="showExportModal = false">取消</button>
          <button class="btn primary"
            :disabled="exportMode === 'ai' && !aiPlan"
            @click="generatePdf">
            🚀 开始生成
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app { display: flex; flex-direction: column; height: 100vh; background: #0f1117; color: #e8eaf0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }

/* 顶栏 */
.topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 24px 0 80px; height: 52px;
  background: #161b27; border-bottom: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0; -webkit-app-region: drag;
}
.logo { display: flex; align-items: center; gap: 10px; }
.logo-icon { font-size: 22px; }
.logo-text { font-weight: 700; font-size: 16px; color: #fff; }
.topbar-actions { display: flex; gap: 10px; -webkit-app-region: no-drag; }

/* 按钮 */
.btn { padding: 8px 16px; border-radius: 10px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
.btn.ghost { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.85); border: 1px solid rgba(255,255,255,0.12); }
.btn.ghost:hover { background: rgba(255,255,255,0.14); }
.btn.primary { background: linear-gradient(135deg, #4facfe, #00f2fe); color: #071018; }
.btn.primary:hover { filter: brightness(1.1); }
.btn.primary:disabled { opacity: 0.5; cursor: not-allowed; }

/* 主区 */
.main { flex: 1; overflow-y: auto; padding: 24px 32px 48px; }

/* 上传区 */
.upload-zone {
  border: 2px dashed rgba(79,172,254,0.4); border-radius: 20px;
  padding: 80px 40px; text-align: center; cursor: pointer;
  transition: all 0.2s; background: rgba(79,172,254,0.03);
  max-width: 600px; margin: 60px auto;
}
.upload-zone:hover, .upload-zone.dragover {
  border-color: #4facfe; background: rgba(79,172,254,0.08);
}
.upload-icon { font-size: 56px; margin-bottom: 16px; }
.upload-title { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 8px; }
.upload-sub { color: rgba(255,255,255,0.5); font-size: 14px; }
.upload-error { margin-top: 16px; color: #ff6b6b; font-size: 14px; }

/* 进度 */
.progress-wrap { max-width: 500px; margin: 100px auto; text-align: center; }
.progress-title { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 24px; }
.progress-bar-track { height: 8px; border-radius: 999px; background: rgba(255,255,255,0.1); overflow: hidden; margin-bottom: 12px; }
.progress-bar-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #4facfe, #00f2fe); transition: width 0.4s ease; }
.progress-msg { color: rgba(255,255,255,0.7); font-size: 14px; }
.progress-percent { color: #4facfe; font-size: 24px; font-weight: 900; margin-top: 16px; font-family: 'Monaco', monospace; }

/* 结果区 */
.result { max-width: 1200px; margin: 0 auto; }

/* 文件信息横幅 */
.file-info-banner {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 20px; background: linear-gradient(135deg, rgba(79,172,254,0.08), rgba(79,172,254,0.02));
  border: 1px solid rgba(79,172,254,0.2); border-radius: 14px; margin-bottom: 18px;
  flex-wrap: wrap; gap: 12px;
}
.file-name { font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 4px; }
.file-meta { font-size: 12px; color: rgba(255,255,255,0.6); }
.file-info-right { display: flex; gap: 8px; flex-wrap: wrap; }
.tag {
  padding: 4px 10px; border-radius: 999px; font-size: 11px;
  background: rgba(79,172,254,0.12); color: #4facfe; border: 1px solid rgba(79,172,254,0.25);
}
.q-good { color: #4caf50 !important; }
.q-ok { color: #ff9800 !important; }
.q-bad { color: #f44336 !important; }

/* Tab */
.tabs {
  display: flex; gap: 4px; margin-bottom: 20px;
  border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 0;
  overflow-x: auto;
}
.tab {
  padding: 10px 18px; cursor: pointer; color: rgba(255,255,255,0.6);
  font-size: 13px; font-weight: 600; border-bottom: 2px solid transparent;
  white-space: nowrap; transition: all 0.15s;
}
.tab:hover { color: rgba(255,255,255,0.9); }
.tab.active { color: #4facfe; border-bottom-color: #4facfe; }

.tab-panel { padding: 4px 0; }
.section-title {
  font-size: 14px; font-weight: 700; color: rgba(255,255,255,0.9);
  margin-bottom: 12px; padding-bottom: 8px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  margin-top: 18px;
}
.section-title:first-child { margin-top: 0; }

/* 卡片 */
.info-cards { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
.info-card {
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px; padding: 14px 20px; min-width: 120px; text-align: center;
}
.info-card.primary {
  background: linear-gradient(135deg, rgba(79,172,254,0.15), rgba(0,242,254,0.08));
  border-color: rgba(79,172,254,0.3);
}
.info-val { font-size: 22px; font-weight: 900; color: #4facfe; }
.info-lbl { font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 4px; }

/* 质量评分 */
.quality-score-wrap { display: flex; align-items: center; gap: 20px; margin-bottom: 20px; padding: 20px; background: rgba(255,255,255,0.03); border-radius: 14px; border: 1px solid rgba(255,255,255,0.06); }
.score-circle {
  width: 90px; height: 90px; border-radius: 50%;
  display: grid; place-items: center; font-size: 32px; font-weight: 900; color: #fff;
  flex-shrink: 0;
}
.score-circle.good { background: linear-gradient(135deg, #43a047, #66bb6a); }
.score-circle.ok { background: linear-gradient(135deg, #fb8c00, #ffa726); }
.score-circle.bad { background: linear-gradient(135deg, #e53935, #ef5350); }
.score-info { flex: 1; }
.score-row { color: rgba(255,255,255,0.8); font-size: 13px; line-height: 1.9; }
.score-row strong { color: #fff; font-family: 'Monaco', monospace; }

.fill-bar-wrap { display: flex; align-items: center; gap: 8px; max-width: 200px; }
.fill-bar { height: 6px; border-radius: 3px; background: linear-gradient(90deg, #4facfe, #00f2fe); min-width: 2px; }

/* 统计网格 */
.stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; margin-bottom: 18px; }
.stat-item { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 12px 14px; text-align: center; }
.stat-val { font-size: 18px; font-weight: 800; color: #00f2fe; }
.stat-lbl { font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 4px; }

/* 表格 */
.table-wrap { overflow-x: auto; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); margin-bottom: 16px; }
.data-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.data-table th { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.75); padding: 9px 12px; text-align: left; font-weight: 600; white-space: nowrap; }
.data-table td { padding: 8px 12px; border-top: 1px solid rgba(255,255,255,0.04); color: rgba(255,255,255,0.85); white-space: nowrap; }
.data-table tr:hover td { background: rgba(255,255,255,0.03); }
.up { color: #4caf50; font-weight: 700; }
.down { color: #f44336; font-weight: 700; }
.outlier-row td { background: rgba(255,100,100,0.05); }

/* 占比条 */
.pct-bar-wrap { display: flex; align-items: center; gap: 8px; }
.pct-bar { height: 6px; border-radius: 3px; background: linear-gradient(90deg, #4facfe, #00f2fe); min-width: 2px; max-width: 100px; }

/* 洞察列表 */
.insights-list { display: flex; flex-direction: column; gap: 8px; }
.insight-item {
  display: flex; gap: 10px; align-items: flex-start;
  padding: 12px 16px; border-radius: 10px;
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
  font-size: 13px; color: rgba(255,255,255,0.9); line-height: 1.6;
}
.insight-item.warning { background: rgba(255,100,100,0.06); border-color: rgba(255,100,100,0.2); }
.insight-item.warning .insight-dot { color: #ef5350; }
.insight-item.positive { background: rgba(76,175,80,0.08); border-color: rgba(76,175,80,0.25); }
.insight-item.positive .insight-dot { color: #66bb6a; }
.insight-item.correlation { background: rgba(255,167,38,0.08); border-color: rgba(255,167,38,0.25); }
.insight-item.correlation .insight-dot { color: #ffa726; }
.insight-dot { font-weight: 900; flex-shrink: 0; color: #4facfe; }

.empty {
  text-align: center; padding: 60px 20px;
  color: rgba(255,255,255,0.4); font-size: 14px;
}

/* AI 区域 */
.ai-section { margin-bottom: 24px; }
.ai-actions { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.ai-summary-box {
  background: linear-gradient(135deg, rgba(79,172,254,0.08), rgba(0,242,254,0.04));
  border: 1px solid rgba(79,172,254,0.25); border-radius: 14px;
  padding: 18px 22px; margin-bottom: 16px;
}
.ai-summary-title { font-size: 13px; font-weight: 700; color: #4facfe; margin-bottom: 10px; }
.ai-summary-content { font-size: 14px; line-height: 1.8; color: rgba(255,255,255,0.9); }
.ai-insights-box {
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 14px; padding: 18px 22px; margin-bottom: 16px;
}
.ai-insight-item {
  display: flex; gap: 10px; align-items: flex-start;
  padding: 10px 14px; border-radius: 8px; margin-bottom: 8px;
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
  font-size: 13px; color: rgba(255,255,255,0.9); line-height: 1.6;
}
.ai-insight-tag {
  flex-shrink: 0; font-size: 11px; font-weight: 700; padding: 2px 8px;
  border-radius: 6px; background: rgba(79,172,254,0.15); color: #4facfe;
}
.ai-insight-item.警示 .ai-insight-tag { background: rgba(239,83,80,0.15); color: #ef5350; }
.ai-insight-item.趋势 .ai-insight-tag { background: rgba(38,166,154,0.15); color: #26a69a; }
.ai-insight-item.建议 .ai-insight-tag { background: rgba(255,167,38,0.15); color: #ffa726; }
.ai-insight-item.机会 .ai-insight-tag { background: rgba(102,187,106,0.15); color: #66bb6a; }

.ai-ask-section { margin-top: 16px; }
.ai-ask-title { font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.8); margin-bottom: 10px; }
.ai-ask-row { display: flex; gap: 10px; }
.ai-ask-input {
  flex: 1; padding: 10px 14px; border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.05);
  color: #fff; font-size: 13px; outline: none;
}
.ai-ask-input:focus { border-color: #4facfe; }
.ai-answer-box {
  margin-top: 12px; padding: 14px 18px; border-radius: 10px;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  font-size: 13px; line-height: 1.7; color: rgba(255,255,255,0.9);
}

/* 状态栏 */
.status-bar { margin-top: 16px; padding: 10px 16px; background: rgba(79,172,254,0.1); border: 1px solid rgba(79,172,254,0.2); border-radius: 10px; font-size: 13px; color: #4facfe; }
.error-bar { margin-top: 16px; padding: 10px 16px; background: rgba(255,100,100,0.1); border: 1px solid rgba(255,100,100,0.2); border-radius: 10px; font-size: 13px; color: #ff6b6b; }

/* 模态框 */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.7);
  display: grid; place-items: center; z-index: 1000;
  backdrop-filter: blur(4px);
}
.modal-box {
  background: #1a1f2e; border: 1px solid rgba(255,255,255,0.12);
  border-radius: 20px; padding: 28px; width: 90%; max-width: 680px;
  max-height: 85vh; overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
}
.modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.modal-title { font-size: 18px; font-weight: 800; color: #fff; }
.modal-close { background: none; border: none; color: rgba(255,255,255,0.5); font-size: 20px; cursor: pointer; padding: 4px 8px; border-radius: 6px; }
.modal-close:hover { background: rgba(255,255,255,0.1); color: #fff; }

/* 模式切换 */
.mode-tabs { display: flex; gap: 4px; margin-bottom: 20px; background: rgba(255,255,255,0.05); border-radius: 12px; padding: 4px; }
.mode-tab {
  flex: 1; padding: 10px 16px; text-align: center; border-radius: 10px;
  font-size: 13px; font-weight: 600; cursor: pointer; color: rgba(255,255,255,0.6);
  transition: all 0.2s;
}
.mode-tab.active { background: rgba(79,172,254,0.2); color: #4facfe; }
.mode-tab:hover:not(.active) { color: rgba(255,255,255,0.9); }

/* 模板网格 */
.template-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px; }
.template-card {
  background: rgba(255,255,255,0.04); border: 2px solid rgba(255,255,255,0.08);
  border-radius: 14px; padding: 18px; cursor: pointer; transition: all 0.2s;
  text-align: center;
}
.template-card:hover { border-color: rgba(79,172,254,0.3); background: rgba(79,172,254,0.05); }
.template-card.selected { border-color: #4facfe; background: rgba(79,172,254,0.1); box-shadow: 0 0 20px rgba(79,172,254,0.15); }
.template-icon { font-size: 32px; margin-bottom: 8px; }
.template-name { font-size: 14px; font-weight: 700; color: #fff; margin-bottom: 4px; }
.template-desc { font-size: 11px; color: rgba(255,255,255,0.5); line-height: 1.5; margin-bottom: 6px; }
.template-pages { font-size: 10px; color: #4facfe; font-weight: 600; }

/* AI 导出 */
.ai-export-section { margin-bottom: 20px; }
.ai-export-hint { font-size: 13px; color: rgba(255,255,255,0.7); margin-bottom: 12px; }
.ai-export-examples { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.ai-example {
  padding: 6px 12px; border-radius: 999px; font-size: 11px;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
  color: rgba(255,255,255,0.8); cursor: pointer; transition: all 0.15s;
}
.ai-example:hover { background: rgba(79,172,254,0.15); border-color: rgba(79,172,254,0.3); color: #4facfe; }
.ai-export-input-row { display: flex; gap: 10px; }
.ai-export-input {
  flex: 1; padding: 10px 14px; border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.05);
  color: #fff; font-size: 13px; outline: none;
}
.ai-export-input:focus { border-color: #4facfe; }
.ai-plan-result {
  margin-top: 14px; padding: 14px 18px; border-radius: 12px;
  background: rgba(76,175,80,0.08); border: 1px solid rgba(76,175,80,0.25);
}
.ai-plan-title { font-size: 13px; font-weight: 700; color: #66bb6a; margin-bottom: 8px; }
.ai-plan-sections { display: flex; flex-wrap: wrap; gap: 6px; }
.ai-plan-tag {
  padding: 3px 8px; border-radius: 6px; font-size: 10px;
  background: rgba(79,172,254,0.12); color: #4facfe; border: 1px solid rgba(79,172,254,0.2);
}

/* 模态底部 */
.modal-footer { display: flex; justify-content: flex-end; gap: 10px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.08); }
</style>
