/**
 * analyzer.js - Excel 数据多维度分析模块
 */

// ─── 工具函数 ──────────────────────────────────────────────────────────────────
function toNumber(val) {
  if (val === null || val === undefined || val === '') return null
  const n = Number(val)
  return isNaN(n) ? null : n
}

function toDate(val) {
  if (!val) return null
  let d
  if (typeof val === 'number') {
    const excelEpoch = new Date(1899, 11, 30)
    d = new Date(excelEpoch.getTime() + val * 86400000)
  } else if (val instanceof Date) {
    d = val
  } else {
    d = new Date(String(val))
  }
  return isNaN(d.getTime()) ? null : d
}

function toYearMonth(val) {
  const d = toDate(val)
  if (!d) return String(val || '').slice(0, 7) || null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function toQuarter(val) {
  const d = toDate(val)
  if (!d) return null
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`
}

function round(n, p = 2) {
  if (n === null || n === undefined || isNaN(n)) return 0
  const f = Math.pow(10, p)
  return Math.round(Number(n) * f) / f
}

// ─── 列类型检测 ────────────────────────────────────────────────────────────────
function detectNumericColumns(headers, rows) {
  const cols = []
  for (const h of headers) {
    let count = 0
    for (const row of rows) if (toNumber(row[h]) !== null) count++
    if (rows.length > 0 && count / rows.length >= 0.6) cols.push(h)
  }
  return cols
}

function detectDateColumn(headers, rows) {
  for (const h of headers) {
    let count = 0
    for (const row of rows) {
      const v = row[h]
      if (!v) continue
      if (typeof v === 'number' && v > 1 && v < 100000) { count++; continue }
      if (v instanceof Date) { count++; continue }
      if (!isNaN(new Date(String(v)).getTime())) count++
    }
    if (rows.length > 0 && count / rows.length >= 0.6) return h
  }
  return null
}

function detectCategoryColumns(headers, rows, numericCols, dateCol) {
  const result = []
  for (const h of headers) {
    if (numericCols.includes(h) || h === dateCol) continue
    const unique = new Set(rows.map(r => r[h]).filter(v => v !== null && v !== undefined && v !== ''))
    if (unique.size >= 2 && unique.size <= Math.min(50, rows.length * 0.3 + 2)) {
      result.push({ name: h, uniqueCount: unique.size })
    }
  }
  // 按唯一值数量升序（优先少的作为主分类）
  result.sort((a, b) => a.uniqueCount - b.uniqueCount)
  return result.map(r => r.name)
}

// ─── 统计量 ────────────────────────────────────────────────────────────────────
function calcStats(values) {
  const nums = values.filter(v => v !== null && !isNaN(v)).map(Number)
  if (nums.length === 0) return { count: 0, sum: 0, avg: 0, min: 0, max: 0, median: 0, std: 0, cv: 0 }
  nums.sort((a, b) => a - b)
  const sum = nums.reduce((s, v) => s + v, 0)
  const avg = sum / nums.length
  const mid = Math.floor(nums.length / 2)
  const median = nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid]
  const variance = nums.reduce((s, v) => s + (v - avg) ** 2, 0) / nums.length
  const std = Math.sqrt(variance)
  const cv = avg !== 0 ? std / Math.abs(avg) : 0  // 变异系数
  return {
    count: nums.length,
    sum: round(sum),
    avg: round(avg),
    min: nums[0],
    max: nums[nums.length - 1],
    median: round(median),
    std: round(std),
    cv: round(cv, 4),
    p25: round(nums[Math.floor(nums.length * 0.25)]),
    p75: round(nums[Math.floor(nums.length * 0.75)])
  }
}

// ─── 按月/季度分组 ─────────────────────────────────────────────────────────────
function groupByTime(rows, dateCol, valueCol, granularity = 'month') {
  const map = {}
  const keyFn = granularity === 'quarter' ? toQuarter : toYearMonth
  for (const row of rows) {
    const key = keyFn(row[dateCol])
    if (!key) continue
    const v = toNumber(row[valueCol])
    if (v === null) continue
    if (!map[key]) map[key] = { sum: 0, count: 0, values: [] }
    map[key].sum += v
    map[key].count++
    map[key].values.push(v)
  }
  return Object.keys(map).sort().map(k => ({
    period: k,
    sum: round(map[k].sum),
    avg: round(map[k].sum / map[k].count),
    count: map[k].count,
    max: Math.max(...map[k].values),
    min: Math.min(...map[k].values)
  }))
}

function calcGrowthRates(data) {
  if (!data || data.length < 2) return data.map(d => ({ ...d, mom: null, yoy: null }))
  return data.map((item, i) => {
    const mom = i > 0 && data[i - 1].sum !== 0
      ? round(((item.sum - data[i - 1].sum) / Math.abs(data[i - 1].sum)) * 100)
      : null
    // 同比：向前找 12 个期（月）或 4 个期（季）
    const lookback = item.period.includes('Q') ? 4 : 12
    const yoyItem = i >= lookback ? data[i - lookback] : null
    const yoy = yoyItem && yoyItem.sum !== 0
      ? round(((item.sum - yoyItem.sum) / Math.abs(yoyItem.sum)) * 100)
      : null
    return { ...item, mom, yoy }
  })
}

// ─── 分类聚合 ──────────────────────────────────────────────────────────────────
function groupByCategory(rows, categoryCol, valueCol) {
  const map = {}
  for (const row of rows) {
    const cat = row[categoryCol] != null ? String(row[categoryCol]) : '(空)'
    const v = toNumber(row[valueCol])
    if (v === null) continue
    if (!map[cat]) map[cat] = { sum: 0, count: 0, values: [] }
    map[cat].sum += v
    map[cat].count++
    map[cat].values.push(v)
  }
  return Object.entries(map).map(([name, d]) => ({
    name,
    sum: round(d.sum),
    avg: round(d.sum / d.count),
    count: d.count,
    max: Math.max(...d.values),
    min: Math.min(...d.values)
  })).sort((a, b) => b.sum - a.sum)
}

// 多维交叉：分类1 × 分类2 × 数值
function crossAnalyze(rows, cat1, cat2, valueCol) {
  const map = {}
  for (const row of rows) {
    const k1 = row[cat1] != null ? String(row[cat1]) : '(空)'
    const k2 = row[cat2] != null ? String(row[cat2]) : '(空)'
    const v = toNumber(row[valueCol])
    if (v === null) continue
    if (!map[k1]) map[k1] = {}
    if (!map[k1][k2]) map[k1][k2] = { sum: 0, count: 0 }
    map[k1][k2].sum += v
    map[k1][k2].count++
  }
  const cat1Keys = Object.keys(map)
  const cat2Keys = Array.from(new Set(cat1Keys.flatMap(k => Object.keys(map[k])))).sort()
  return {
    cat1Keys: cat1Keys.sort(),
    cat2Keys,
    matrix: cat1Keys.map(k1 => cat2Keys.map(k2 => round(map[k1]?.[k2]?.sum || 0)))
  }
}

// ─── 皮尔逊相关系数 ─────────────────────────────────────────────────────────────
function pearsonCorrelation(xs, ys) {
  const n = Math.min(xs.length, ys.length)
  if (n < 3) return 0
  const validPairs = []
  for (let i = 0; i < n; i++) {
    if (xs[i] !== null && ys[i] !== null && !isNaN(xs[i]) && !isNaN(ys[i])) {
      validPairs.push([xs[i], ys[i]])
    }
  }
  if (validPairs.length < 3) return 0
  const sumX = validPairs.reduce((s, [x]) => s + x, 0)
  const sumY = validPairs.reduce((s, [, y]) => s + y, 0)
  const meanX = sumX / validPairs.length
  const meanY = sumY / validPairs.length
  let num = 0, denX = 0, denY = 0
  for (const [x, y] of validPairs) {
    num += (x - meanX) * (y - meanY)
    denX += (x - meanX) ** 2
    denY += (y - meanY) ** 2
  }
  const den = Math.sqrt(denX * denY)
  return den === 0 ? 0 : round(num / den, 3)
}

function buildCorrelationMatrix(rows, numericCols) {
  const cols = numericCols.slice(0, 8) // 最多8列，避免图表过密
  const matrix = []
  for (const c1 of cols) {
    const row = []
    const xs = rows.map(r => toNumber(r[c1]))
    for (const c2 of cols) {
      const ys = rows.map(r => toNumber(r[c2]))
      row.push(pearsonCorrelation(xs, ys))
    }
    matrix.push(row)
  }
  return { cols, matrix }
}

// ─── 分布直方图 ────────────────────────────────────────────────────────────────
function buildHistogram(values, bins = 10) {
  const nums = values.filter(v => v !== null && !isNaN(v)).map(Number)
  if (nums.length === 0) return { bins: [], labels: [] }
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  if (min === max) return { bins: [nums.length], labels: [`${round(min)}`] }
  const step = (max - min) / bins
  const counts = new Array(bins).fill(0)
  const labels = []
  for (let i = 0; i < bins; i++) {
    const lo = min + step * i
    const hi = min + step * (i + 1)
    labels.push(`${round(lo)}~${round(hi)}`)
  }
  for (const v of nums) {
    let idx = Math.floor((v - min) / step)
    if (idx >= bins) idx = bins - 1
    if (idx < 0) idx = 0
    counts[idx]++
  }
  return { bins: counts, labels }
}

// ─── 数据质量评估 ──────────────────────────────────────────────────────────────
function evaluateDataQuality(rows, headers) {
  const total = rows.length
  const colQuality = {}
  let totalNulls = 0

  for (const h of headers) {
    let nulls = 0
    for (const row of rows) {
      const v = row[h]
      if (v === null || v === undefined || v === '') nulls++
    }
    colQuality[h] = {
      nulls,
      fillRate: total > 0 ? round((1 - nulls / total) * 100, 1) : 100
    }
    totalNulls += nulls
  }

  // 重复行检测（基于所有字段的 JSON 字符串）
  const seen = new Set()
  let duplicates = 0
  for (const row of rows) {
    const key = JSON.stringify(row)
    if (seen.has(key)) duplicates++
    else seen.add(key)
  }

  const totalCells = total * headers.length
  const overallFillRate = totalCells > 0 ? round((1 - totalNulls / totalCells) * 100, 1) : 100
  const duplicateRate = total > 0 ? round((duplicates / total) * 100, 1) : 0

  // 100分制评分
  let score = 100
  score -= Math.min(30, (100 - overallFillRate) * 0.5) // 缺失率扣分
  score -= Math.min(20, duplicateRate * 2)              // 重复率扣分

  return {
    totalRows: total,
    totalCells,
    totalNulls,
    overallFillRate,
    duplicates,
    duplicateRate,
    columns: colQuality,
    score: round(Math.max(0, score), 1)
  }
}

// ─── 异常值检测 ────────────────────────────────────────────────────────────────
function detectOutliers(rows, valueCol, stats) {
  if (!stats || stats.count === 0) return []
  const mean = stats.avg
  const std = stats.std
  if (std === 0) return []
  return rows
    .filter(r => {
      const v = toNumber(r[valueCol])
      return v !== null && Math.abs(v - mean) > 3 * std
    })
    .slice(0, 15)
    .map(r => ({ ...r, _outlierValue: toNumber(r[valueCol]) }))
}

// ─── 智能结论生成（规则引擎）────────────────────────────────────────────────────
function generateInsights(result) {
  const insights = []
  const { summary, monthlyGrowth, quarterlyGrowth, categoryBreakdowns, correlations, dataQuality, distribution, outliers } = result
  const { primaryValueColumn: primaryCol, categoryColumn: mainCat, dateColumn: dateCol } = summary
  const stats = primaryCol ? summary.columnStats[primaryCol] : null

  // ─ 数据规模与质量 ─
  insights.push({
    type: 'overview',
    text: `数据集共 ${summary.totalRows.toLocaleString()} 行 ${result.headers.length} 列，其中数值列 ${summary.numericColumns.length} 个，分类列 ${summary.categoryColumns.length} 个${dateCol ? `，时间维度字段为「${dateCol}」` : ''}。`
  })

  if (dataQuality) {
    const q = dataQuality
    const qualityLevel = q.score >= 90 ? '优秀' : q.score >= 75 ? '良好' : q.score >= 60 ? '一般' : '较差'
    insights.push({
      type: 'quality',
      text: `数据质量评分 ${q.score} 分（${qualityLevel}），整体填充率 ${q.overallFillRate}%，重复行 ${q.duplicates} 条（${q.duplicateRate}%）。${q.score < 75 ? '⚠️ 建议先做数据清洗再分析。' : ''}`
    })
  }

  // ─ 主指标统计 ─
  if (stats && primaryCol) {
    insights.push({
      type: 'stats',
      text: `核心指标「${primaryCol}」：总计 ${stats.sum.toLocaleString()}，均值 ${stats.avg.toLocaleString()}，中位数 ${stats.median.toLocaleString()}，最大值 ${stats.max.toLocaleString()}，最小值 ${stats.min.toLocaleString()}。`
    })

    // 变异系数分析
    if (stats.cv > 1) {
      insights.push({ type: 'warning', text: `⚠️ 「${primaryCol}」数据波动剧烈（变异系数 ${stats.cv}），建议分段或按分类细化分析。` })
    } else if (stats.cv < 0.3) {
      insights.push({ type: 'info', text: `「${primaryCol}」数据分布较为稳定（变异系数 ${stats.cv}），可预测性较高。` })
    }

    // 偏态判断
    if (stats.median > 0 && stats.avg > 0) {
      const skew = (stats.avg - stats.median) / stats.median
      if (skew > 0.3) insights.push({ type: 'info', text: `数据呈明显右偏分布（均值 > 中位数 ${round(skew * 100, 1)}%），存在少数高值拉高平均。` })
      else if (skew < -0.3) insights.push({ type: 'info', text: `数据呈明显左偏分布（均值 < 中位数 ${round(Math.abs(skew) * 100, 1)}%），存在少数低值拉低平均。` })
    }
  }

  // ─ 时间趋势 ─
  if (monthlyGrowth && monthlyGrowth.length > 0) {
    const last = monthlyGrowth[monthlyGrowth.length - 1]
    const last3 = monthlyGrowth.slice(-3)
    const allUp = last3.length >= 3 && last3.every((m, i) => i === 0 || m.sum >= last3[i - 1].sum)
    const allDown = last3.length >= 3 && last3.every((m, i) => i === 0 || m.sum <= last3[i - 1].sum)

    if (last) {
      const momStr = last.mom !== null ? `，环比${last.mom >= 0 ? '增长' : '下降'} ${Math.abs(last.mom)}%` : ''
      const yoyStr = last.yoy !== null ? `，同比${last.yoy >= 0 ? '增长' : '下降'} ${Math.abs(last.yoy)}%` : ''
      insights.push({ type: 'trend', text: `最近期（${last.period}）合计 ${last.sum.toLocaleString()}${momStr}${yoyStr}。` })
    }
    if (allUp) insights.push({ type: 'positive', text: `📈 近 3 期数据持续上升，呈稳健增长态势。` })
    else if (allDown) insights.push({ type: 'warning', text: `📉 近 3 期数据持续下滑，需关注背后原因。` })

    // 峰值月份
    const peakMonth = [...monthlyGrowth].sort((a, b) => b.sum - a.sum)[0]
    const lowMonth = [...monthlyGrowth].sort((a, b) => a.sum - b.sum)[0]
    if (peakMonth && lowMonth && peakMonth.period !== lowMonth.period) {
      insights.push({ type: 'info', text: `峰值期为 ${peakMonth.period}（${peakMonth.sum.toLocaleString()}），低谷期为 ${lowMonth.period}（${lowMonth.sum.toLocaleString()}），差距约 ${round((peakMonth.sum - lowMonth.sum) / lowMonth.sum * 100, 1)}%。` })
    }

    // 大幅波动预警
    const bigChange = monthlyGrowth.find(m => m.mom !== null && Math.abs(m.mom) > 50)
    if (bigChange) {
      insights.push({ type: 'warning', text: `⚠️ ${bigChange.period} 出现大幅${bigChange.mom > 0 ? '上涨' : '下跌'}（${bigChange.mom}%），建议核查是否存在异常。` })
    }
  }

  // ─ 分类分布 ─
  if (categoryBreakdowns && mainCat && categoryBreakdowns[mainCat] && categoryBreakdowns[mainCat].length > 0) {
    const topCat = categoryBreakdowns[mainCat][0]
    const total = stats?.sum || categoryBreakdowns[mainCat].reduce((s, c) => s + c.sum, 0)
    const topPct = total ? round(topCat.sum / total * 100, 1) : 0

    insights.push({ type: 'category', text: `按「${mainCat}」分组，「${topCat.name}」占比最高，达 ${topPct}%，合计 ${topCat.sum.toLocaleString()}。` })

    if (topPct > 50) {
      insights.push({ type: 'warning', text: `⚠️ 单一分类占比超过 50%，数据高度集中，建议评估集中度风险。` })
    }
    if (categoryBreakdowns[mainCat].length >= 5) {
      const top5 = categoryBreakdowns[mainCat].slice(0, 5)
      const top5Pct = total ? round(top5.reduce((s, c) => s + c.sum, 0) / total * 100, 1) : 0
      insights.push({ type: 'info', text: `「${mainCat}」前 5 大分类累计占比 ${top5Pct}%，符合${top5Pct > 80 ? '「二八法则」' : '相对均匀分布'}。` })
    }
  }

  // ─ 相关性 ─
  if (correlations && correlations.matrix && correlations.cols.length >= 2) {
    const { cols, matrix } = correlations
    const strongPairs = []
    for (let i = 0; i < cols.length; i++) {
      for (let j = i + 1; j < cols.length; j++) {
        const r = matrix[i][j]
        if (Math.abs(r) > 0.7) strongPairs.push({ a: cols[i], b: cols[j], r })
      }
    }
    if (strongPairs.length > 0) {
      const top = strongPairs.sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0]
      insights.push({
        type: 'correlation',
        text: `💡 「${top.a}」与「${top.b}」呈${top.r > 0 ? '强正' : '强负'}相关（r=${top.r}），${top.r > 0 ? '两者同向变化明显' : '两者反向变化明显'}。`
      })
      if (strongPairs.length > 1) {
        insights.push({ type: 'info', text: `共发现 ${strongPairs.length} 对强相关的数值指标，可参考相关性热力图。` })
      }
    } else {
      insights.push({ type: 'info', text: `数值列之间未检测到强相关关系，各维度相对独立。` })
    }
  }

  // ─ 异常值 ─
  if (outliers && outliers.length > 0) {
    insights.push({ type: 'warning', text: `⚠️ 检测到 ${outliers.length} 条异常值（超过均值 ±3σ），建议人工核查后再做决策。` })
  }

  // ─ 分布形态 ─
  if (distribution && distribution.bins && distribution.bins.length > 0) {
    const maxBinIdx = distribution.bins.indexOf(Math.max(...distribution.bins))
    if (maxBinIdx >= 0) {
      insights.push({ type: 'info', text: `数据最集中的区间为 ${distribution.labels[maxBinIdx]}，占比 ${round(distribution.bins[maxBinIdx] / distribution.bins.reduce((s, v) => s + v, 0) * 100, 1)}%。` })
    }
  }

  return insights
}

// ─── 主分析函数 ────────────────────────────────────────────────────────────────
export function analyzeData(rows, headers, fileName) {
  if (!rows || rows.length === 0) {
    return { error: '数据为空', fileName, rows: [], headers: [] }
  }

  // 1. 列类型识别
  const numericCols = detectNumericColumns(headers, rows)
  const dateCol = detectDateColumn(headers, rows)
  const categoryCols = detectCategoryColumns(headers, rows, numericCols, dateCol)
  const primaryCol = numericCols[0] || null
  const mainCat = categoryCols[0] || null
  const secondCat = categoryCols[1] || null

  // 2. 所有数值列统计
  const columnStats = {}
  for (const col of numericCols) {
    columnStats[col] = calcStats(rows.map(r => toNumber(r[col])))
  }

  // 3. 时间趋势（月 + 季）
  let monthlyTrend = [], monthlyGrowth = [], quarterlyTrend = [], quarterlyGrowth = []
  if (dateCol && primaryCol) {
    monthlyTrend = groupByTime(rows, dateCol, primaryCol, 'month')
    monthlyGrowth = calcGrowthRates(monthlyTrend)
    quarterlyTrend = groupByTime(rows, dateCol, primaryCol, 'quarter')
    quarterlyGrowth = calcGrowthRates(quarterlyTrend)
  }

  // 4. 分类分组（所有分类列 × 主数值列）
  const categoryBreakdowns = {}
  for (const cat of categoryCols.slice(0, 3)) {
    if (primaryCol) {
      categoryBreakdowns[cat] = groupByCategory(rows, cat, primaryCol)
    }
  }

  // 5. 多数值列 × 主分类列（对比图表用）
  const multiValueByCategory = {}
  if (mainCat) {
    for (const col of numericCols.slice(0, 4)) {
      multiValueByCategory[col] = groupByCategory(rows, mainCat, col).slice(0, 10)
    }
  }

  // 6. 多维交叉（主分类 × 次分类 × 主数值）
  let crossAnalysis = null
  if (mainCat && secondCat && primaryCol) {
    crossAnalysis = crossAnalyze(rows, mainCat, secondCat, primaryCol)
  }

  // 7. 相关性矩阵
  const correlations = numericCols.length >= 2 ? buildCorrelationMatrix(rows, numericCols) : null

  // 8. 主指标分布直方图
  const distribution = primaryCol ? buildHistogram(rows.map(r => toNumber(r[primaryCol])), 10) : null

  // 9. 数据质量评估
  const dataQuality = evaluateDataQuality(rows, headers)

  // 10. 异常值
  const outliers = primaryCol ? detectOutliers(rows, primaryCol, columnStats[primaryCol]) : []

  // 11. Top N / Bottom N（主分类按主指标）
  let topBottom = null
  if (mainCat && categoryBreakdowns[mainCat]) {
    const all = categoryBreakdowns[mainCat]
    topBottom = {
      top: all.slice(0, 10),
      bottom: all.slice(-10).reverse()
    }
  }

  // 12. 汇总
  const summary = {
    totalRows: rows.length,
    numericColumns: numericCols,
    categoryColumns: categoryCols,
    dateColumn: dateCol,
    primaryValueColumn: primaryCol,
    categoryColumn: mainCat,
    secondCategoryColumn: secondCat,
    columnStats
  }

  const result = {
    fileName,
    headers,
    summary,
    previewRows: rows.slice(0, 20),
    monthlyTrend,
    monthlyGrowth,
    quarterlyTrend,
    quarterlyGrowth,
    categoryBreakdowns,
    multiValueByCategory,
    crossAnalysis,
    correlations,
    distribution,
    dataQuality,
    outliers,
    topBottom,
    generatedAt: new Date().toLocaleString('zh-CN')
  }

  // 13. 智能结论（放最后生成，因为依赖其他字段）
  result.insights = generateInsights(result)

  return result
}
