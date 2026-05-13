/**
 * aiAnalyzer.js - 调用智谱 GLM-4-Flash 生成智能分析
 */
import { getApiKey, GLM_ENDPOINT, DEFAULT_MODEL } from './aiConfig.js'

/**
 * 调用 GLM API
 */
async function callGLM(messages, { apiKey, model = DEFAULT_MODEL, temperature = 0.4, maxTokens = 1500 } = {}) {
  const key = apiKey || getApiKey()
  if (!key) throw new Error('未配置 API Key')

  const res = await fetch(GLM_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false
    })
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`GLM API 调用失败: HTTP ${res.status} ${errText.slice(0, 200)}`)
  }

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content || ''
  return content.trim()
}

/**
 * 构建给 AI 的数据摘要（只喂关键信息，避免 token 过多）
 */
function buildDataSummary(analysisData) {
  const { summary, dataQuality, monthlyGrowth, categoryBreakdowns, correlations, outliers, fileName } = analysisData
  const { primaryValueColumn: primaryCol, categoryColumn: mainCat, dateColumn: dateCol } = summary
  const stats = primaryCol ? summary.columnStats[primaryCol] : null

  const summaryObj = {
    文件名: fileName,
    数据规模: `${summary.totalRows} 行 × ${analysisData.headers.length} 列`,
    数据质量: dataQuality ? `评分 ${dataQuality.score}/100，填充率 ${dataQuality.overallFillRate}%，重复行 ${dataQuality.duplicates}` : '未评估',
    主指标: primaryCol || '未识别',
    主指标统计: stats ? {
      总计: stats.sum, 均值: stats.avg, 中位数: stats.median,
      最大: stats.max, 最小: stats.min, 标准差: stats.std,
      变异系数: stats.cv, P25: stats.p25, P75: stats.p75
    } : null,
    时间维度: dateCol || '无',
    分类维度: mainCat || '无',
    月度趋势: monthlyGrowth ? monthlyGrowth.slice(-12).map(m => ({
      期: m.period, 合计: m.sum, 环比: m.mom, 同比: m.yoy
    })) : null,
    主分类Top10: (mainCat && categoryBreakdowns?.[mainCat])
      ? categoryBreakdowns[mainCat].slice(0, 10).map(c => ({ 名称: c.name, 合计: c.sum, 占比: stats?.sum ? ((c.sum / stats.sum) * 100).toFixed(1) + '%' : '-' }))
      : null,
    相关性: correlations ? correlations.cols.map((c1, i) =>
      correlations.cols.map((c2, j) => i < j && Math.abs(correlations.matrix[i][j]) > 0.5
        ? `${c1} vs ${c2}: r=${correlations.matrix[i][j]}` : null).filter(Boolean)
    ).flat().slice(0, 5) : [],
    异常值数量: outliers?.length || 0
  }

  return summaryObj
}

/**
 * 生成执行摘要（200~300 字）
 */
export async function generateExecutiveSummary(analysisData, { apiKey } = {}) {
  const summary = buildDataSummary(analysisData)

  const messages = [
    {
      role: 'system',
      content: `你是一位资深数据分析师，擅长从业务角度解读数据。
你的任务是根据用户提供的数据分析结果，撰写一段精炼的执行摘要（200~300字），
要求：
1. 语言流畅，具有洞察力，避免生硬的数字罗列
2. 从业务角度出发，指出关键发现、潜在风险、趋势判断
3. 使用中文，不要 markdown 语法，只输出纯文本段落
4. 不要开头的套话（如"本报告分析了..."），直接进入正题`
    },
    {
      role: 'user',
      content: `请根据以下数据分析结果撰写执行摘要：\n\n${JSON.stringify(summary, null, 2)}`
    }
  ]

  try {
    const content = await callGLM(messages, { apiKey, maxTokens: 800 })
    return { success: true, content }
  } catch (err) {
    console.error('[aiAnalyzer] generateExecutiveSummary 失败:', err.message)
    return { success: false, error: err.message, content: '' }
  }
}

/**
 * 生成深度洞察（多条结构化建议）
 */
export async function generateInsights(analysisData, { apiKey } = {}) {
  const summary = buildDataSummary(analysisData)

  const messages = [
    {
      role: 'system',
      content: `你是一位资深数据分析师。请根据数据分析结果，生成 6~10 条深度洞察。
要求：
1. 每条洞察独立成段，必须有业务价值，避免简单描述数字
2. 涵盖：关键发现、异常警示、趋势判断、行动建议、潜在机会
3. 使用中文，每条 50~100 字，不要编号，不要 markdown 符号
4. 输出格式：每条洞察一行，用"||"分隔（不要在每条结尾加标点前的||）
5. 类型标签：每条开头用 [发现]/[警示]/[趋势]/[建议]/[机会] 之一`
    },
    {
      role: 'user',
      content: `请根据以下数据分析结果生成深度洞察：\n\n${JSON.stringify(summary, null, 2)}`
    }
  ]

  try {
    const content = await callGLM(messages, { apiKey, maxTokens: 1500 })
    // 解析：按 || 分隔
    const items = content.split('||').map(s => s.trim()).filter(Boolean)
    const parsed = items.map(text => {
      const match = text.match(/^\[(发现|警示|趋势|建议|机会)\]\s*(.+)$/)
      if (match) return { type: match[1], text: match[2] }
      return { type: '发现', text }
    })
    return { success: true, insights: parsed }
  } catch (err) {
    console.error('[aiAnalyzer] generateInsights 失败:', err.message)
    return { success: false, error: err.message, insights: [] }
  }
}

/**
 * AI 生成报告规划（根据用户自然语言需求，输出结构化报告配置）
 */
export async function generateReportPlan(analysisData, userRequest, { apiKey } = {}) {
  const summary = buildDataSummary(analysisData)

  // 把更完整的数据传给 AI
  const fullData = {
    文件名: summary.文件名,
    数据规模: summary.数据规模,
    数据质量: summary.数据质量,
    主指标: summary.主指标,
    主指标统计: summary.主指标统计,
    时间维度: summary.时间维度,
    分类维度: summary.分类维度,
    月度趋势: summary.月度趋势,
    主分类Top10: summary.主分类Top10,
    相关性: summary.相关性,
    异常值数量: summary.异常值数量
  }

  const messages = [
    {
      role: 'system',
      content: `你是一位数据可视化工程师。你需要根据用户需求和数据，直接生成一个完整的 HTML 页面代码，用于渲染成 PDF 报告。

技术要求：
1. 使用 ECharts 5.x 绑图表（已通过 <script> 标签全局引入，直接用 echarts.init() 即可）
2. 页面宽度 210mm（A4），用 class="page" 分页，每页 min-height: 297mm，page-break-after: always
3. 支持 @media print 的 -webkit-print-color-adjust: exact
4. 图表容器必须有明确的 width 和 height（如 width:100%; height:200px）
5. 图表在 DOMContentLoaded 后用 setTimeout 600ms 初始化
6. 所有数据直接硬编码在 JS 中（不需要外部数据注入）

样式建议：
- 背景白色，字体用 PingFang SC / Microsoft YaHei
- 封面可用渐变背景
- 标题用深蓝色 #1d2b64，强调色 #4facfe
- 表格、卡片、图表自由组合

输出要求：
- 只输出 HTML 代码，从 <!DOCTYPE html> 开始到 </html> 结束
- 不要 markdown 代码块包裹，直接输出纯 HTML
- 根据用户需求决定页数、内容详略、图表类型
- 用户说"一页"就只生成一页，说"详细"就多页`
    },
    {
      role: 'user',
      content: `数据：${JSON.stringify(fullData)}\n\n用户需求：${userRequest}`
    }
  ]

  try {
    const content = await callGLM(messages, { apiKey, maxTokens: 4000, temperature: 0.7 })
    // 提取 HTML（可能被 ```html ``` 包裹）
    let html = content
    const htmlMatch = content.match(/<!DOCTYPE[\s\S]*<\/html>/i)
    if (htmlMatch) {
      html = htmlMatch[0]
    } else {
      // 尝试去掉 markdown 代码块
      html = content.replace(/^```html?\s*/i, '').replace(/\s*```\s*$/, '')
    }
    if (!html.includes('<html') && !html.includes('<body')) {
      throw new Error('AI 未返回有效 HTML')
    }
    return { success: true, plan: { html } }
  } catch (err) {
    console.error('[aiAnalyzer] generateReportPlan 失败:', err.message)
    return { success: false, error: err.message, plan: null }
  }
}

/**
 * AI 为报告章节生成叙述文案
 */
export async function generateNarrative(analysisData, focus, { apiKey } = {}) {
  const summary = buildDataSummary(analysisData)

  const focusPrompts = {
    executive_summary: '撰写一段 200-300 字的执行摘要，从业务角度解读数据，指出关键发现和建议。',
    brief_summary: '用 100 字以内概括数据的核心发现，语言精炼。',
    trend_analysis: '针对时间趋势数据，分析增长/下降原因，给出趋势判断和预测。200 字以内。',
    risk_warning: '重点分析数据中的风险信号和异常，给出预警建议。200 字以内。'
  }

  const prompt = focusPrompts[focus] || focusPrompts.executive_summary

  const messages = [
    {
      role: 'system',
      content: `你是一位资深数据分析师。${prompt}
要求：使用中文，不要 markdown，不要开头套话，直接输出纯文本。`
    },
    {
      role: 'user',
      content: `数据分析结果：\n${JSON.stringify(summary, null, 2)}`
    }
  ]

  try {
    const content = await callGLM(messages, { apiKey, maxTokens: 800 })
    return { success: true, content }
  } catch (err) {
    return { success: false, error: err.message, content: '' }
  }
}

/**
 * 用户自定义提问（二期功能，先提供接口）
 */
export async function askAboutData(analysisData, question, { apiKey } = {}) {
  const summary = buildDataSummary(analysisData)

  const messages = [
    {
      role: 'system',
      content: `你是一位数据分析师，基于给定的数据分析结果回答用户问题。
如果数据不足以回答，请明确说明"数据无法回答此问题"。
回答要简洁、有理有据，字数控制在 150 字以内。使用中文。`
    },
    {
      role: 'user',
      content: `数据分析结果：\n${JSON.stringify(summary, null, 2)}\n\n用户问题：${question}`
    }
  ]

  try {
    const content = await callGLM(messages, { apiKey, maxTokens: 600 })
    return { success: true, answer: content }
  } catch (err) {
    return { success: false, error: err.message, answer: '' }
  }
}
