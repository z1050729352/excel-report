"use strict";
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const utils = require("@electron-toolkit/utils");
const XLSX = require("xlsx");
function toNumber(val) {
  if (val === null || val === void 0 || val === "") return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}
function toDate(val) {
  if (!val) return null;
  let d;
  if (typeof val === "number") {
    const excelEpoch = new Date(1899, 11, 30);
    d = new Date(excelEpoch.getTime() + val * 864e5);
  } else if (val instanceof Date) {
    d = val;
  } else {
    d = new Date(String(val));
  }
  return isNaN(d.getTime()) ? null : d;
}
function toYearMonth(val) {
  const d = toDate(val);
  if (!d) return String(val || "").slice(0, 7) || null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function toQuarter(val) {
  const d = toDate(val);
  if (!d) return null;
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}
function round(n, p = 2) {
  if (n === null || n === void 0 || isNaN(n)) return 0;
  const f = Math.pow(10, p);
  return Math.round(Number(n) * f) / f;
}
function detectNumericColumns(headers, rows) {
  const cols = [];
  for (const h of headers) {
    let count = 0;
    for (const row of rows) if (toNumber(row[h]) !== null) count++;
    if (rows.length > 0 && count / rows.length >= 0.6) cols.push(h);
  }
  return cols;
}
function detectDateColumn(headers, rows) {
  for (const h of headers) {
    let count = 0;
    for (const row of rows) {
      const v = row[h];
      if (!v) continue;
      if (typeof v === "number" && v > 1 && v < 1e5) {
        count++;
        continue;
      }
      if (v instanceof Date) {
        count++;
        continue;
      }
      if (!isNaN(new Date(String(v)).getTime())) count++;
    }
    if (rows.length > 0 && count / rows.length >= 0.6) return h;
  }
  return null;
}
function detectCategoryColumns(headers, rows, numericCols, dateCol) {
  const result = [];
  for (const h of headers) {
    if (numericCols.includes(h) || h === dateCol) continue;
    const unique = new Set(rows.map((r) => r[h]).filter((v) => v !== null && v !== void 0 && v !== ""));
    if (unique.size >= 2 && unique.size <= Math.min(50, rows.length * 0.3 + 2)) {
      result.push({ name: h, uniqueCount: unique.size });
    }
  }
  result.sort((a, b) => a.uniqueCount - b.uniqueCount);
  return result.map((r) => r.name);
}
function calcStats(values) {
  const nums = values.filter((v) => v !== null && !isNaN(v)).map(Number);
  if (nums.length === 0) return { count: 0, sum: 0, avg: 0, min: 0, max: 0, median: 0, std: 0, cv: 0 };
  nums.sort((a, b) => a - b);
  const sum = nums.reduce((s, v) => s + v, 0);
  const avg = sum / nums.length;
  const mid = Math.floor(nums.length / 2);
  const median = nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid];
  const variance = nums.reduce((s, v) => s + (v - avg) ** 2, 0) / nums.length;
  const std = Math.sqrt(variance);
  const cv = avg !== 0 ? std / Math.abs(avg) : 0;
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
  };
}
function groupByTime(rows, dateCol, valueCol, granularity = "month") {
  const map = {};
  const keyFn = granularity === "quarter" ? toQuarter : toYearMonth;
  for (const row of rows) {
    const key = keyFn(row[dateCol]);
    if (!key) continue;
    const v = toNumber(row[valueCol]);
    if (v === null) continue;
    if (!map[key]) map[key] = { sum: 0, count: 0, values: [] };
    map[key].sum += v;
    map[key].count++;
    map[key].values.push(v);
  }
  return Object.keys(map).sort().map((k) => ({
    period: k,
    sum: round(map[k].sum),
    avg: round(map[k].sum / map[k].count),
    count: map[k].count,
    max: Math.max(...map[k].values),
    min: Math.min(...map[k].values)
  }));
}
function calcGrowthRates(data) {
  if (!data || data.length < 2) return data.map((d) => ({ ...d, mom: null, yoy: null }));
  return data.map((item, i) => {
    const mom = i > 0 && data[i - 1].sum !== 0 ? round((item.sum - data[i - 1].sum) / Math.abs(data[i - 1].sum) * 100) : null;
    const lookback = item.period.includes("Q") ? 4 : 12;
    const yoyItem = i >= lookback ? data[i - lookback] : null;
    const yoy = yoyItem && yoyItem.sum !== 0 ? round((item.sum - yoyItem.sum) / Math.abs(yoyItem.sum) * 100) : null;
    return { ...item, mom, yoy };
  });
}
function groupByCategory(rows, categoryCol, valueCol) {
  const map = {};
  for (const row of rows) {
    const cat = row[categoryCol] != null ? String(row[categoryCol]) : "(空)";
    const v = toNumber(row[valueCol]);
    if (v === null) continue;
    if (!map[cat]) map[cat] = { sum: 0, count: 0, values: [] };
    map[cat].sum += v;
    map[cat].count++;
    map[cat].values.push(v);
  }
  return Object.entries(map).map(([name, d]) => ({
    name,
    sum: round(d.sum),
    avg: round(d.sum / d.count),
    count: d.count,
    max: Math.max(...d.values),
    min: Math.min(...d.values)
  })).sort((a, b) => b.sum - a.sum);
}
function crossAnalyze(rows, cat1, cat2, valueCol) {
  const map = {};
  for (const row of rows) {
    const k1 = row[cat1] != null ? String(row[cat1]) : "(空)";
    const k2 = row[cat2] != null ? String(row[cat2]) : "(空)";
    const v = toNumber(row[valueCol]);
    if (v === null) continue;
    if (!map[k1]) map[k1] = {};
    if (!map[k1][k2]) map[k1][k2] = { sum: 0, count: 0 };
    map[k1][k2].sum += v;
    map[k1][k2].count++;
  }
  const cat1Keys = Object.keys(map);
  const cat2Keys = Array.from(new Set(cat1Keys.flatMap((k) => Object.keys(map[k])))).sort();
  return {
    cat1Keys: cat1Keys.sort(),
    cat2Keys,
    matrix: cat1Keys.map((k1) => cat2Keys.map((k2) => round(map[k1]?.[k2]?.sum || 0)))
  };
}
function pearsonCorrelation(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const validPairs = [];
  for (let i = 0; i < n; i++) {
    if (xs[i] !== null && ys[i] !== null && !isNaN(xs[i]) && !isNaN(ys[i])) {
      validPairs.push([xs[i], ys[i]]);
    }
  }
  if (validPairs.length < 3) return 0;
  const sumX = validPairs.reduce((s, [x]) => s + x, 0);
  const sumY = validPairs.reduce((s, [, y]) => s + y, 0);
  const meanX = sumX / validPairs.length;
  const meanY = sumY / validPairs.length;
  let num = 0, denX = 0, denY = 0;
  for (const [x, y] of validPairs) {
    num += (x - meanX) * (y - meanY);
    denX += (x - meanX) ** 2;
    denY += (y - meanY) ** 2;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : round(num / den, 3);
}
function buildCorrelationMatrix(rows, numericCols) {
  const cols = numericCols.slice(0, 8);
  const matrix = [];
  for (const c1 of cols) {
    const row = [];
    const xs = rows.map((r) => toNumber(r[c1]));
    for (const c2 of cols) {
      const ys = rows.map((r) => toNumber(r[c2]));
      row.push(pearsonCorrelation(xs, ys));
    }
    matrix.push(row);
  }
  return { cols, matrix };
}
function buildHistogram(values, bins = 10) {
  const nums = values.filter((v) => v !== null && !isNaN(v)).map(Number);
  if (nums.length === 0) return { bins: [], labels: [] };
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (min === max) return { bins: [nums.length], labels: [`${round(min)}`] };
  const step = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  const labels = [];
  for (let i = 0; i < bins; i++) {
    const lo = min + step * i;
    const hi = min + step * (i + 1);
    labels.push(`${round(lo)}~${round(hi)}`);
  }
  for (const v of nums) {
    let idx = Math.floor((v - min) / step);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    counts[idx]++;
  }
  return { bins: counts, labels };
}
function evaluateDataQuality(rows, headers) {
  const total = rows.length;
  const colQuality = {};
  let totalNulls = 0;
  for (const h of headers) {
    let nulls = 0;
    for (const row of rows) {
      const v = row[h];
      if (v === null || v === void 0 || v === "") nulls++;
    }
    colQuality[h] = {
      nulls,
      fillRate: total > 0 ? round((1 - nulls / total) * 100, 1) : 100
    };
    totalNulls += nulls;
  }
  const seen = /* @__PURE__ */ new Set();
  let duplicates = 0;
  for (const row of rows) {
    const key = JSON.stringify(row);
    if (seen.has(key)) duplicates++;
    else seen.add(key);
  }
  const totalCells = total * headers.length;
  const overallFillRate = totalCells > 0 ? round((1 - totalNulls / totalCells) * 100, 1) : 100;
  const duplicateRate = total > 0 ? round(duplicates / total * 100, 1) : 0;
  let score = 100;
  score -= Math.min(30, (100 - overallFillRate) * 0.5);
  score -= Math.min(20, duplicateRate * 2);
  return {
    totalRows: total,
    totalCells,
    totalNulls,
    overallFillRate,
    duplicates,
    duplicateRate,
    columns: colQuality,
    score: round(Math.max(0, score), 1)
  };
}
function detectOutliers(rows, valueCol, stats) {
  if (!stats || stats.count === 0) return [];
  const mean = stats.avg;
  const std = stats.std;
  if (std === 0) return [];
  return rows.filter((r) => {
    const v = toNumber(r[valueCol]);
    return v !== null && Math.abs(v - mean) > 3 * std;
  }).slice(0, 15).map((r) => ({ ...r, _outlierValue: toNumber(r[valueCol]) }));
}
function generateInsights$1(result) {
  const insights = [];
  const { summary, monthlyGrowth, quarterlyGrowth, categoryBreakdowns, correlations, dataQuality, distribution, outliers } = result;
  const { primaryValueColumn: primaryCol, categoryColumn: mainCat, dateColumn: dateCol } = summary;
  const stats = primaryCol ? summary.columnStats[primaryCol] : null;
  insights.push({
    type: "overview",
    text: `数据集共 ${summary.totalRows.toLocaleString()} 行 ${result.headers.length} 列，其中数值列 ${summary.numericColumns.length} 个，分类列 ${summary.categoryColumns.length} 个${dateCol ? `，时间维度字段为「${dateCol}」` : ""}。`
  });
  if (dataQuality) {
    const q = dataQuality;
    const qualityLevel = q.score >= 90 ? "优秀" : q.score >= 75 ? "良好" : q.score >= 60 ? "一般" : "较差";
    insights.push({
      type: "quality",
      text: `数据质量评分 ${q.score} 分（${qualityLevel}），整体填充率 ${q.overallFillRate}%，重复行 ${q.duplicates} 条（${q.duplicateRate}%）。${q.score < 75 ? "⚠️ 建议先做数据清洗再分析。" : ""}`
    });
  }
  if (stats && primaryCol) {
    insights.push({
      type: "stats",
      text: `核心指标「${primaryCol}」：总计 ${stats.sum.toLocaleString()}，均值 ${stats.avg.toLocaleString()}，中位数 ${stats.median.toLocaleString()}，最大值 ${stats.max.toLocaleString()}，最小值 ${stats.min.toLocaleString()}。`
    });
    if (stats.cv > 1) {
      insights.push({ type: "warning", text: `⚠️ 「${primaryCol}」数据波动剧烈（变异系数 ${stats.cv}），建议分段或按分类细化分析。` });
    } else if (stats.cv < 0.3) {
      insights.push({ type: "info", text: `「${primaryCol}」数据分布较为稳定（变异系数 ${stats.cv}），可预测性较高。` });
    }
    if (stats.median > 0 && stats.avg > 0) {
      const skew = (stats.avg - stats.median) / stats.median;
      if (skew > 0.3) insights.push({ type: "info", text: `数据呈明显右偏分布（均值 > 中位数 ${round(skew * 100, 1)}%），存在少数高值拉高平均。` });
      else if (skew < -0.3) insights.push({ type: "info", text: `数据呈明显左偏分布（均值 < 中位数 ${round(Math.abs(skew) * 100, 1)}%），存在少数低值拉低平均。` });
    }
  }
  if (monthlyGrowth && monthlyGrowth.length > 0) {
    const last = monthlyGrowth[monthlyGrowth.length - 1];
    const last3 = monthlyGrowth.slice(-3);
    const allUp = last3.length >= 3 && last3.every((m, i) => i === 0 || m.sum >= last3[i - 1].sum);
    const allDown = last3.length >= 3 && last3.every((m, i) => i === 0 || m.sum <= last3[i - 1].sum);
    if (last) {
      const momStr = last.mom !== null ? `，环比${last.mom >= 0 ? "增长" : "下降"} ${Math.abs(last.mom)}%` : "";
      const yoyStr = last.yoy !== null ? `，同比${last.yoy >= 0 ? "增长" : "下降"} ${Math.abs(last.yoy)}%` : "";
      insights.push({ type: "trend", text: `最近期（${last.period}）合计 ${last.sum.toLocaleString()}${momStr}${yoyStr}。` });
    }
    if (allUp) insights.push({ type: "positive", text: `📈 近 3 期数据持续上升，呈稳健增长态势。` });
    else if (allDown) insights.push({ type: "warning", text: `📉 近 3 期数据持续下滑，需关注背后原因。` });
    const peakMonth = [...monthlyGrowth].sort((a, b) => b.sum - a.sum)[0];
    const lowMonth = [...monthlyGrowth].sort((a, b) => a.sum - b.sum)[0];
    if (peakMonth && lowMonth && peakMonth.period !== lowMonth.period) {
      insights.push({ type: "info", text: `峰值期为 ${peakMonth.period}（${peakMonth.sum.toLocaleString()}），低谷期为 ${lowMonth.period}（${lowMonth.sum.toLocaleString()}），差距约 ${round((peakMonth.sum - lowMonth.sum) / lowMonth.sum * 100, 1)}%。` });
    }
    const bigChange = monthlyGrowth.find((m) => m.mom !== null && Math.abs(m.mom) > 50);
    if (bigChange) {
      insights.push({ type: "warning", text: `⚠️ ${bigChange.period} 出现大幅${bigChange.mom > 0 ? "上涨" : "下跌"}（${bigChange.mom}%），建议核查是否存在异常。` });
    }
  }
  if (categoryBreakdowns && mainCat && categoryBreakdowns[mainCat] && categoryBreakdowns[mainCat].length > 0) {
    const topCat = categoryBreakdowns[mainCat][0];
    const total = stats?.sum || categoryBreakdowns[mainCat].reduce((s, c) => s + c.sum, 0);
    const topPct = total ? round(topCat.sum / total * 100, 1) : 0;
    insights.push({ type: "category", text: `按「${mainCat}」分组，「${topCat.name}」占比最高，达 ${topPct}%，合计 ${topCat.sum.toLocaleString()}。` });
    if (topPct > 50) {
      insights.push({ type: "warning", text: `⚠️ 单一分类占比超过 50%，数据高度集中，建议评估集中度风险。` });
    }
    if (categoryBreakdowns[mainCat].length >= 5) {
      const top5 = categoryBreakdowns[mainCat].slice(0, 5);
      const top5Pct = total ? round(top5.reduce((s, c) => s + c.sum, 0) / total * 100, 1) : 0;
      insights.push({ type: "info", text: `「${mainCat}」前 5 大分类累计占比 ${top5Pct}%，符合${top5Pct > 80 ? "「二八法则」" : "相对均匀分布"}。` });
    }
  }
  if (correlations && correlations.matrix && correlations.cols.length >= 2) {
    const { cols, matrix } = correlations;
    const strongPairs = [];
    for (let i = 0; i < cols.length; i++) {
      for (let j = i + 1; j < cols.length; j++) {
        const r = matrix[i][j];
        if (Math.abs(r) > 0.7) strongPairs.push({ a: cols[i], b: cols[j], r });
      }
    }
    if (strongPairs.length > 0) {
      const top = strongPairs.sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0];
      insights.push({
        type: "correlation",
        text: `💡 「${top.a}」与「${top.b}」呈${top.r > 0 ? "强正" : "强负"}相关（r=${top.r}），${top.r > 0 ? "两者同向变化明显" : "两者反向变化明显"}。`
      });
      if (strongPairs.length > 1) {
        insights.push({ type: "info", text: `共发现 ${strongPairs.length} 对强相关的数值指标，可参考相关性热力图。` });
      }
    } else {
      insights.push({ type: "info", text: `数值列之间未检测到强相关关系，各维度相对独立。` });
    }
  }
  if (outliers && outliers.length > 0) {
    insights.push({ type: "warning", text: `⚠️ 检测到 ${outliers.length} 条异常值（超过均值 ±3σ），建议人工核查后再做决策。` });
  }
  if (distribution && distribution.bins && distribution.bins.length > 0) {
    const maxBinIdx = distribution.bins.indexOf(Math.max(...distribution.bins));
    if (maxBinIdx >= 0) {
      insights.push({ type: "info", text: `数据最集中的区间为 ${distribution.labels[maxBinIdx]}，占比 ${round(distribution.bins[maxBinIdx] / distribution.bins.reduce((s, v) => s + v, 0) * 100, 1)}%。` });
    }
  }
  return insights;
}
function analyzeData(rows, headers, fileName) {
  if (!rows || rows.length === 0) {
    return { error: "数据为空", fileName, rows: [], headers: [] };
  }
  const numericCols = detectNumericColumns(headers, rows);
  const dateCol = detectDateColumn(headers, rows);
  const categoryCols = detectCategoryColumns(headers, rows, numericCols, dateCol);
  const primaryCol = numericCols[0] || null;
  const mainCat = categoryCols[0] || null;
  const secondCat = categoryCols[1] || null;
  const columnStats = {};
  for (const col of numericCols) {
    columnStats[col] = calcStats(rows.map((r) => toNumber(r[col])));
  }
  let monthlyTrend = [], monthlyGrowth = [], quarterlyTrend = [], quarterlyGrowth = [];
  if (dateCol && primaryCol) {
    monthlyTrend = groupByTime(rows, dateCol, primaryCol, "month");
    monthlyGrowth = calcGrowthRates(monthlyTrend);
    quarterlyTrend = groupByTime(rows, dateCol, primaryCol, "quarter");
    quarterlyGrowth = calcGrowthRates(quarterlyTrend);
  }
  const categoryBreakdowns = {};
  for (const cat of categoryCols.slice(0, 3)) {
    if (primaryCol) {
      categoryBreakdowns[cat] = groupByCategory(rows, cat, primaryCol);
    }
  }
  const multiValueByCategory = {};
  if (mainCat) {
    for (const col of numericCols.slice(0, 4)) {
      multiValueByCategory[col] = groupByCategory(rows, mainCat, col).slice(0, 10);
    }
  }
  let crossAnalysis = null;
  if (mainCat && secondCat && primaryCol) {
    crossAnalysis = crossAnalyze(rows, mainCat, secondCat, primaryCol);
  }
  const correlations = numericCols.length >= 2 ? buildCorrelationMatrix(rows, numericCols) : null;
  const distribution = primaryCol ? buildHistogram(rows.map((r) => toNumber(r[primaryCol])), 10) : null;
  const dataQuality = evaluateDataQuality(rows, headers);
  const outliers = primaryCol ? detectOutliers(rows, primaryCol, columnStats[primaryCol]) : [];
  let topBottom = null;
  if (mainCat && categoryBreakdowns[mainCat]) {
    const all = categoryBreakdowns[mainCat];
    topBottom = {
      top: all.slice(0, 10),
      bottom: all.slice(-10).reverse()
    };
  }
  const summary = {
    totalRows: rows.length,
    numericColumns: numericCols,
    categoryColumns: categoryCols,
    dateColumn: dateCol,
    primaryValueColumn: primaryCol,
    categoryColumn: mainCat,
    secondCategoryColumn: secondCat,
    columnStats
  };
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
    generatedAt: (/* @__PURE__ */ new Date()).toLocaleString("zh-CN")
  };
  result.insights = generateInsights$1(result);
  return result;
}
const GLM_ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const DEFAULT_MODEL = "glm-4-flash";
let _envKey = "";
try {
  const envPath = path.join(process.cwd(), ".env");
  const envContent = fs.readFileSync(envPath, "utf-8");
  const match = envContent.match(/^GLM_API_KEY=(.+)$/m);
  if (match) _envKey = match[1].trim();
} catch (e) {
}
function getApiKey() {
  const key = process.env.GLM_API_KEY || _envKey;
  if (!key) {
    console.warn("[aiConfig] 未检测到 GLM_API_KEY，请在项目根目录 .env 文件中配置");
  }
  return key || "";
}
async function callGLM(messages, { apiKey, model = DEFAULT_MODEL, temperature = 0.4, maxTokens = 1500 } = {}) {
  const key = apiKey || getApiKey();
  if (!key) throw new Error("未配置 API Key");
  const res = await fetch(GLM_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false
    })
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`GLM API 调用失败: HTTP ${res.status} ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || "";
  return content.trim();
}
function buildDataSummary(analysisData) {
  const { summary, dataQuality, monthlyGrowth, categoryBreakdowns, correlations, outliers, fileName } = analysisData;
  const { primaryValueColumn: primaryCol, categoryColumn: mainCat, dateColumn: dateCol } = summary;
  const stats = primaryCol ? summary.columnStats[primaryCol] : null;
  const summaryObj = {
    文件名: fileName,
    数据规模: `${summary.totalRows} 行 × ${analysisData.headers.length} 列`,
    数据质量: dataQuality ? `评分 ${dataQuality.score}/100，填充率 ${dataQuality.overallFillRate}%，重复行 ${dataQuality.duplicates}` : "未评估",
    主指标: primaryCol || "未识别",
    主指标统计: stats ? {
      总计: stats.sum,
      均值: stats.avg,
      中位数: stats.median,
      最大: stats.max,
      最小: stats.min,
      标准差: stats.std,
      变异系数: stats.cv,
      P25: stats.p25,
      P75: stats.p75
    } : null,
    时间维度: dateCol || "无",
    分类维度: mainCat || "无",
    月度趋势: monthlyGrowth ? monthlyGrowth.slice(-12).map((m) => ({
      期: m.period,
      合计: m.sum,
      环比: m.mom,
      同比: m.yoy
    })) : null,
    主分类Top10: mainCat && categoryBreakdowns?.[mainCat] ? categoryBreakdowns[mainCat].slice(0, 10).map((c) => ({ 名称: c.name, 合计: c.sum, 占比: stats?.sum ? (c.sum / stats.sum * 100).toFixed(1) + "%" : "-" })) : null,
    相关性: correlations ? correlations.cols.map(
      (c1, i) => correlations.cols.map((c2, j) => i < j && Math.abs(correlations.matrix[i][j]) > 0.5 ? `${c1} vs ${c2}: r=${correlations.matrix[i][j]}` : null).filter(Boolean)
    ).flat().slice(0, 5) : [],
    异常值数量: outliers?.length || 0
  };
  return summaryObj;
}
async function generateExecutiveSummary(analysisData, { apiKey } = {}) {
  const summary = buildDataSummary(analysisData);
  const messages = [
    {
      role: "system",
      content: `你是一位资深数据分析师，擅长从业务角度解读数据。
你的任务是根据用户提供的数据分析结果，撰写一段精炼的执行摘要（200~300字），
要求：
1. 语言流畅，具有洞察力，避免生硬的数字罗列
2. 从业务角度出发，指出关键发现、潜在风险、趋势判断
3. 使用中文，不要 markdown 语法，只输出纯文本段落
4. 不要开头的套话（如"本报告分析了..."），直接进入正题`
    },
    {
      role: "user",
      content: `请根据以下数据分析结果撰写执行摘要：

${JSON.stringify(summary, null, 2)}`
    }
  ];
  try {
    const content = await callGLM(messages, { apiKey, maxTokens: 800 });
    return { success: true, content };
  } catch (err) {
    console.error("[aiAnalyzer] generateExecutiveSummary 失败:", err.message);
    return { success: false, error: err.message, content: "" };
  }
}
async function generateInsights(analysisData, { apiKey } = {}) {
  const summary = buildDataSummary(analysisData);
  const messages = [
    {
      role: "system",
      content: `你是一位资深数据分析师。请根据数据分析结果，生成 6~10 条深度洞察。
要求：
1. 每条洞察独立成段，必须有业务价值，避免简单描述数字
2. 涵盖：关键发现、异常警示、趋势判断、行动建议、潜在机会
3. 使用中文，每条 50~100 字，不要编号，不要 markdown 符号
4. 输出格式：每条洞察一行，用"||"分隔（不要在每条结尾加标点前的||）
5. 类型标签：每条开头用 [发现]/[警示]/[趋势]/[建议]/[机会] 之一`
    },
    {
      role: "user",
      content: `请根据以下数据分析结果生成深度洞察：

${JSON.stringify(summary, null, 2)}`
    }
  ];
  try {
    const content = await callGLM(messages, { apiKey, maxTokens: 1500 });
    const items = content.split("||").map((s) => s.trim()).filter(Boolean);
    const parsed = items.map((text) => {
      const match = text.match(/^\[(发现|警示|趋势|建议|机会)\]\s*(.+)$/);
      if (match) return { type: match[1], text: match[2] };
      return { type: "发现", text };
    });
    return { success: true, insights: parsed };
  } catch (err) {
    console.error("[aiAnalyzer] generateInsights 失败:", err.message);
    return { success: false, error: err.message, insights: [] };
  }
}
async function generateReportPlan(analysisData, userRequest, { apiKey } = {}) {
  const summary = buildDataSummary(analysisData);
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
  };
  const messages = [
    {
      role: "system",
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
      role: "user",
      content: `数据：${JSON.stringify(fullData)}

用户需求：${userRequest}`
    }
  ];
  try {
    const content = await callGLM(messages, { apiKey, maxTokens: 4e3, temperature: 0.7 });
    let html = content;
    const htmlMatch = content.match(/<!DOCTYPE[\s\S]*<\/html>/i);
    if (htmlMatch) {
      html = htmlMatch[0];
    } else {
      html = content.replace(/^```html?\s*/i, "").replace(/\s*```\s*$/, "");
    }
    if (!html.includes("<html") && !html.includes("<body")) {
      throw new Error("AI 未返回有效 HTML");
    }
    return { success: true, plan: { html } };
  } catch (err) {
    console.error("[aiAnalyzer] generateReportPlan 失败:", err.message);
    return { success: false, error: err.message, plan: null };
  }
}
async function askAboutData(analysisData, question, { apiKey } = {}) {
  const summary = buildDataSummary(analysisData);
  const messages = [
    {
      role: "system",
      content: `你是一位数据分析师，基于给定的数据分析结果回答用户问题。
如果数据不足以回答，请明确说明"数据无法回答此问题"。
回答要简洁、有理有据，字数控制在 150 字以内。使用中文。`
    },
    {
      role: "user",
      content: `数据分析结果：
${JSON.stringify(summary, null, 2)}

用户问题：${question}`
    }
  ];
  try {
    const content = await callGLM(messages, { apiKey, maxTokens: 600 });
    return { success: true, answer: content };
  } catch (err) {
    return { success: false, error: err.message, answer: "" };
  }
}
const TEMPLATES = {
  executive: {
    id: "executive",
    name: "商务简报",
    icon: "💼",
    description: "适合给领导/客户汇报，突出核心指标和结论",
    pages: "3-4 页",
    sections: [
      { type: "cover", style: "gradient" },
      { type: "kpi_cards", metrics: ["sum", "avg", "count", "quality_score"] },
      { type: "trend_chart", granularity: "monthly", showGrowth: true },
      { type: "category_pie", topN: 5 },
      { type: "ai_narrative", focus: "executive_summary" },
      { type: "conclusion", showOutliers: false }
    ],
    colorScheme: "corporate_blue",
    detailLevel: "brief"
  },
  detailed: {
    id: "detailed",
    name: "详细报告",
    icon: "📊",
    description: "完整分析报告，包含所有图表和明细数据",
    pages: "8-9 页",
    sections: [
      { type: "cover", style: "gradient" },
      { type: "overview_quality" },
      { type: "statistics_full" },
      { type: "distribution" },
      { type: "trend_chart", granularity: "both", showGrowth: true },
      { type: "category_analysis", showCross: true },
      { type: "correlation" },
      { type: "detail_tables" },
      { type: "conclusion", showOutliers: true }
    ],
    colorScheme: "corporate_blue",
    detailLevel: "full"
  },
  dashboard: {
    id: "dashboard",
    name: "数据看板",
    icon: "📈",
    description: "一页纸看全貌，高信息密度，适合打印张贴",
    pages: "1-2 页",
    sections: [
      { type: "cover", style: "minimal" },
      { type: "dashboard_grid" }
    ],
    colorScheme: "vibrant",
    detailLevel: "compact"
  },
  minimal: {
    id: "minimal",
    name: "极简摘要",
    icon: "📝",
    description: "纯文字为主，快速浏览关键数字和结论",
    pages: "2 页",
    sections: [
      { type: "cover", style: "clean" },
      { type: "kpi_cards", metrics: ["sum", "avg", "mom"] },
      { type: "ai_narrative", focus: "brief_summary" },
      { type: "conclusion", showOutliers: false }
    ],
    colorScheme: "monochrome",
    detailLevel: "minimal"
  }
};
function getTemplateList() {
  return Object.values(TEMPLATES).map((t) => ({
    id: t.id,
    name: t.name,
    icon: t.icon,
    description: t.description,
    pages: t.pages
  }));
}
function getTemplate(templateId) {
  return TEMPLATES[templateId] || TEMPLATES.detailed;
}
let mainWindow = null;
let reportWindow = null;
let cachedWorkbook = null;
let cachedFilePath = null;
let cachedAnalysisData = null;
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: process.platform === "darwin" ? { x: 14, y: 18 } : void 0,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true
    }
  });
  mainWindow.on("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    electron.shell.openExternal(url);
    return { action: "deny" };
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
function createReportWindow() {
  reportWindow = new electron.BrowserWindow({
    width: 1200,
    height: 900,
    show: false,
    webPreferences: { sandbox: false, contextIsolation: false, nodeIntegration: false }
  });
  return reportWindow;
}
function extractRowsFromSheet(sheet, { startRow = 1, endRow = null, headerRow = null }) {
  const rawMatrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false, blankrows: false });
  if (rawMatrix.length === 0) return { headers: [], rows: [] };
  const headerIdx = (headerRow ? headerRow : startRow) - 1;
  const dataStartIdx = headerRow ? headerRow : startRow;
  const dataEndIdx = endRow ? endRow : rawMatrix.length;
  const headerArr = rawMatrix[headerIdx] || [];
  const headers = headerArr.map((h, i) => {
    if (h !== null && h !== void 0 && String(h).trim() !== "") return String(h).trim();
    return `列${i + 1}`;
  });
  const seen = /* @__PURE__ */ new Map();
  const finalHeaders = headers.map((h) => {
    const count = seen.get(h) || 0;
    seen.set(h, count + 1);
    return count === 0 ? h : `${h}_${count + 1}`;
  });
  const rows = [];
  for (let i = dataStartIdx; i < dataEndIdx && i < rawMatrix.length; i++) {
    const row = rawMatrix[i];
    if (!row) continue;
    const allEmpty = row.every((v) => v === null || v === void 0 || v === "");
    if (allEmpty) continue;
    const firstCell = String(row[0] || "").trim();
    if (/^(小计|合计|总计|Total|Subtotal|Sum)/i.test(firstCell)) continue;
    const obj = {};
    finalHeaders.forEach((h, j) => {
      obj[h] = row[j] ?? null;
    });
    rows.push(obj);
  }
  return { headers: finalHeaders, rows };
}
electron.ipcMain.handle("open-excel", async (_e, filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    cachedWorkbook = workbook;
    cachedFilePath = filePath;
    const sheets = workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false, blankrows: false });
      const totalRows = matrix.length;
      const totalCols = matrix.reduce((max, row) => Math.max(max, (row || []).length), 0);
      const preview = matrix.slice(0, 30).map((row) => (row || []).slice(0, 20));
      return { name, totalRows, totalCols, preview };
    });
    const fileName = filePath.split(/[\\/]/).pop();
    return { success: true, fileName, sheets };
  } catch (err) {
    console.error("[open-excel] 错误:", err);
    return { success: false, error: err.message };
  }
});
electron.ipcMain.handle("analyze-excel", async (_e, { sheetName, startRow, endRow, headerRow }) => {
  const send = (message, percent) => mainWindow?.webContents.send("progress", { message, percent });
  try {
    if (!cachedWorkbook) return { success: false, error: "未加载文件" };
    send("正在解析工作表…", 20);
    const sheet = cachedWorkbook.Sheets[sheetName] || cachedWorkbook.Sheets[cachedWorkbook.SheetNames[0]];
    if (!sheet) return { success: false, error: "工作表不存在" };
    const { headers, rows } = extractRowsFromSheet(sheet, { startRow, endRow, headerRow });
    if (rows.length === 0) return { success: false, error: "未提取到有效数据行，请检查起止行设置" };
    send("正在执行统计分析…", 60);
    const fileName = cachedFilePath.split(/[\\/]/).pop();
    const result = analyzeData(rows, headers, fileName);
    cachedAnalysisData = result;
    send("分析完成", 100);
    return { success: true, data: result };
  } catch (err) {
    console.error("[analyze-excel] 错误:", err);
    return { success: false, error: err.message };
  }
});
electron.ipcMain.handle("ai-summary", async (_e, { apiKey } = {}) => {
  if (!cachedAnalysisData) return { success: false, error: "没有分析数据" };
  mainWindow?.webContents.send("progress", { message: "AI 正在撰写执行摘要…", percent: 40 });
  const result = await generateExecutiveSummary(cachedAnalysisData, { apiKey });
  mainWindow?.webContents.send("progress", { message: result.success ? "摘要生成完成" : "摘要生成失败", percent: 100 });
  return result;
});
electron.ipcMain.handle("ai-insights", async (_e, { apiKey } = {}) => {
  if (!cachedAnalysisData) return { success: false, error: "没有分析数据" };
  mainWindow?.webContents.send("progress", { message: "AI 正在生成深度洞察…", percent: 40 });
  const result = await generateInsights(cachedAnalysisData, { apiKey });
  if (result.success && cachedAnalysisData) {
    cachedAnalysisData.aiInsights = result.insights;
  }
  mainWindow?.webContents.send("progress", { message: result.success ? "洞察生成完成" : "洞察生成失败", percent: 100 });
  return result;
});
electron.ipcMain.handle("ai-ask", async (_e, { question, apiKey } = {}) => {
  if (!cachedAnalysisData) return { success: false, error: "没有分析数据" };
  return askAboutData(cachedAnalysisData, question, { apiKey });
});
electron.ipcMain.handle("save-ai-summary", async (_e, { summary }) => {
  if (cachedAnalysisData) cachedAnalysisData.aiSummary = summary || "";
  return { success: true };
});
electron.ipcMain.handle("get-report-templates", async () => {
  return { success: true, templates: getTemplateList() };
});
electron.ipcMain.handle("ai-report-plan", async (_e, { userRequest, apiKey } = {}) => {
  if (!cachedAnalysisData) return { success: false, error: "没有分析数据" };
  mainWindow?.webContents.send("progress", { message: "AI 正在规划报告…", percent: 30 });
  const result = await generateReportPlan(cachedAnalysisData, userRequest, { apiKey });
  mainWindow?.webContents.send("progress", { message: result.success ? "报告规划完成" : "规划失败", percent: 100 });
  return result;
});
electron.ipcMain.handle("generate-pdf", async (_e, { templateId, customPlan } = {}) => {
  const send = (message, percent) => mainWindow?.webContents.send("progress", { message, percent });
  const analysisData = cachedAnalysisData;
  if (!analysisData) return { success: false, error: "没有可用的分析数据" };
  try {
    send("正在准备报告…", 15);
    let reportConfig;
    if (customPlan) {
      reportConfig = { mode: "ai", ...customPlan };
      console.log("[generate-pdf] 使用 AI 定制方案:", reportConfig.reportTitle, "章节:", JSON.stringify(reportConfig.sections?.map((s) => s.title)));
    } else {
      reportConfig = { mode: "template", ...getTemplate(templateId || "detailed") };
      console.log("[generate-pdf] 使用预设模板:", reportConfig.id);
    }
    const reportData = { ...analysisData, __reportConfig__: reportConfig };
    let html;
    if (reportConfig.mode === "ai" && reportConfig.html) {
      html = reportConfig.html;
      console.log("[generate-pdf] 使用 AI 生成的 HTML，长度:", html.length);
    } else {
      const templateMap = {
        detailed: "report-template.html",
        executive: "report-executive.html",
        dashboard: "report-dashboard.html",
        minimal: "report-minimal.html"
      };
      const templateFile = templateMap[reportConfig.id] || "report-template.html";
      const templatePath = utils.is.dev ? path.join(process.cwd(), "src/renderer/src", templateFile) : path.join(__dirname, "../renderer", templateFile);
      console.log("[generate-pdf] 使用模板:", templateFile);
      html = fs.readFileSync(templatePath, "utf-8");
      html = html.replace("</head>", `<script>window.__REPORT_DATA__ = ${JSON.stringify(reportData)};<\/script>
</head>`);
    }
    const echartsPath = path.join(process.cwd(), "node_modules/echarts/dist/echarts.min.js");
    try {
      const echartsCode = fs.readFileSync(echartsPath, "utf-8");
      html = html.replace(
        '<script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"><\/script>',
        `<script>${echartsCode}<\/script>`
      );
    } catch (e) {
      console.warn("[generate-pdf] 无法内联 ECharts:", e.message);
    }
    send("正在打开渲染窗口…", 35);
    if (reportWindow && !reportWindow.isDestroyed()) {
      reportWindow.destroy();
    }
    createReportWindow();
    await Promise.race([
      new Promise((resolve, reject) => {
        reportWindow.webContents.once("did-finish-load", resolve);
        reportWindow.webContents.once("did-fail-load", (_ev, _code, desc) => reject(new Error(desc)));
        reportWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("页面加载超时（10s）")), 1e4))
    ]);
    send("正在渲染图表（约3秒）…", 55);
    await new Promise((r) => setTimeout(r, 1e3));
    send("正在渲染图表…", 68);
    await new Promise((r) => setTimeout(r, 1500));
    send("正在导出 PDF…", 80);
    const pdfBuffer = await Promise.race([
      reportWindow.webContents.printToPDF({
        printBackground: true,
        pageSize: "A4",
        landscape: false,
        margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("PDF 导出超时（30s）")), 3e4))
    ]);
    send("请选择保存位置…", 90);
    const defaultName = `分析报告_${analysisData.fileName?.replace(/\.[^.]+$/, "") || "report"}_${Date.now()}.pdf`;
    const { filePath: savePath, canceled } = await electron.dialog.showSaveDialog(mainWindow, {
      title: "保存 PDF 报告",
      defaultPath: defaultName,
      filters: [{ name: "PDF 文件", extensions: ["pdf"] }]
    });
    if (canceled || !savePath) return { success: false, error: "用户取消保存" };
    fs.writeFileSync(savePath, pdfBuffer);
    send("✅ PDF 已保存，正在打开…", 100);
    electron.shell.openPath(savePath);
    return { success: true, path: savePath };
  } catch (err) {
    console.error("[generate-pdf] 错误:", err);
    send(`❌ 失败：${err.message}`, 0);
    return { success: false, error: err.message };
  }
});
electron.ipcMain.handle("parse-excel", async (_e, filePath) => {
  const send = (message, percent) => mainWindow?.webContents.send("progress", { message, percent });
  try {
    send("正在读取文件…", 10);
    const buffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    cachedWorkbook = workbook;
    cachedFilePath = filePath;
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return { success: false, error: "工作表不存在" };
    send("正在解析数据…", 30);
    const { headers, rows } = extractRowsFromSheet(sheet, { startRow: 1, endRow: null, headerRow: null });
    if (rows.length === 0) return { success: false, error: "未提取到有效数据行" };
    send("正在执行统计分析…", 60);
    const fileName = filePath.split(/[\\/]/).pop();
    const result = analyzeData(rows, headers, fileName);
    cachedAnalysisData = result;
    send("分析完成", 100);
    return { success: true, data: result };
  } catch (err) {
    console.error("[parse-excel] 错误:", err);
    return { success: false, error: err.message };
  }
});
electron.ipcMain.handle("open-file-dialog", async () => {
  const { filePaths, canceled } = await electron.dialog.showOpenDialog(mainWindow, {
    title: "选择 Excel 文件",
    filters: [{ name: "Excel 文件", extensions: ["xlsx", "xls", "csv"] }],
    properties: ["openFile"]
  });
  if (canceled || filePaths.length === 0) return null;
  return filePaths[0];
});
electron.app.whenReady().then(() => {
  utils.electronApp.setAppUserModelId("com.excel.report");
  electron.app.on("browser-window-created", (_, window) => utils.optimizer.watchWindowShortcuts(window));
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
