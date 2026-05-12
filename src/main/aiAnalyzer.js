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
