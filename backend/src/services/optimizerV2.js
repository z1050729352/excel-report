/**
 * 订货优化算法 v2（画像驱动 · 多目标）
 *
 * 相对 v1（纯 ρ = 毛利/进价 贪心）的改进，依据「客户信息查询」截面分析：
 *   1. 档位决定基线量（R²≈0.84）—— 配额本身已是档位投放结果，作为硬约束保留
 *   2. 表内静态属性几乎解释不了同档差异（达成率 R²≈0.09）—— 用画像推策略象限，而非硬改数量
 *  3. 结构（单条均价）是最大可操作空间（+16.3% 销额潜力）—— 把目标结构价写进打分
 *   4. 业态/商圈对同档达成有弱信号 —— 作为订量倾向系数
 *   5. 诚信等级、雪茄档位 —— 硬门槛 / 高结构偏好
 *
 * 目标函数（对候选品打分后贪心）：
 *   score = wρ·norm(ρ) + wS·structureFit + wV·volumeFit + profileBonus
 * 约束：预算 + 单品配额 + 段位总量 + SKU 宽度上限 + 诚信门槛
 */

import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import path from 'path'

// ─── 档位标准销量（分析表「档位平均销量」一一映射）──────────────────────────
export const TIER_REF_QTY = {
  1: 23.0, 2: 5.4, 3: 2.7, 4: 4.7, 5: 3.1, 6: 4.4, 7: 4.9, 8: 5.3, 9: 5.8,
  10: 7.3, 11: 10.8, 12: 12.2, 13: 13.5, 14: 15.3, 15: 17.3, 16: 21.7,
  17: 20.9, 18: 24.8, 19: 30.2, 20: 32.2, 21: 36.8, 22: 43.5, 23: 49.3,
  24: 67.2, 25: 67.5, 27: 104.3, 28: 144.8, 29: 221.8, 30: 292.2
}

// 同档位段内单条均价分位（元/条），用作结构目标
const TIER_PRICE_BANDS = [
  { max: 10, p25: 120.9, median: 139.6, p75: 166.8 },
  { max: 20, p25: 143.2, median: 157.2, p75: 200.0 },
  { max: 25, p25: 149.4, median: 162.9, p75: 180.2 },
  { max: 30, p25: 170.5, median: 193.7, p75: 239.9 }
]

// 业态 × 商圈 达成率中位系数（分析规则 B）
const BIZ_COEF = {
  '便利店|false': 1.03,
  '便利店|true': 1.20,
  '超市|false': 1.06,
  '超市|true': 1.06,
  '食杂店|false': 0.82,
  '食杂店|true': 1.34,
  '烟酒商店|false': 1.0,
  '娱乐服务业|false': 0.9
}

const STRATEGIES = {
  BENCHMARK: '高量高价·标杆型',
  FLOW_UPGRADE: '高量低价·流量改造型',
  STRUCTURE: '低量高价·结构型',
  BASELINE: '低量低价·保底型'
}

/**
 * @param {Object} merchant
 *   tier                档位 1-30
 *   market_type         城镇/乡村
 *   business_type       便利店/食杂店/超市/...
 *   district            居民区/商业（集贸）区/...
 *   credit_level        A/AA/AAA/C/D
 *   terminal_level      普通终端/现代终端/加盟店
 *   cigar_tier          E/D/C
 *   avg_unit_price      可选，历史单条均价（有则用于象限判定）
 *   attainment_rate     可选，实际销量/档位标准销量
 *   sales_qty           可选，近期销量
 */
export function classifyMerchant(merchant = {}) {
  const tier = Number(merchant.tier) || 15
  const band = TIER_PRICE_BANDS.find((b) => tier <= b.max) || TIER_PRICE_BANDS[3]
  const isCommercial = /商业|集贸/.test(String(merchant.district || ''))
  const biz = String(merchant.business_type || '食杂店')
  const bizCoef = BIZ_COEF[`${biz}|${isCommercial}`] ?? BIZ_COEF[`${biz}|false`] ?? 1.0

  // 有历史数据时用四象限；否则用画像启发式
  let strategy
  const hasHist =
    Number.isFinite(Number(merchant.avg_unit_price)) &&
    Number.isFinite(Number(merchant.attainment_rate))

  if (hasHist) {
    const highVol = Number(merchant.attainment_rate) >= 0.96
    const highPrice = Number(merchant.avg_unit_price) >= band.median
    if (highVol && highPrice) strategy = STRATEGIES.BENCHMARK
    else if (highVol && !highPrice) strategy = STRATEGIES.FLOW_UPGRADE
    else if (!highVol && highPrice) strategy = STRATEGIES.STRUCTURE
    else strategy = STRATEGIES.BASELINE
  } else {
    // 启发式：雪茄 C/D → 结构型；商业区便利/超市 → 偏标杆；乡村食杂 → 保底；其余流量改造
    const cigar = String(merchant.cigar_tier || 'E').toUpperCase()
    if (cigar === 'C' || cigar === 'D') strategy = STRATEGIES.STRUCTURE
    else if (isCommercial || biz === '超市' || /现代|加盟/.test(String(merchant.terminal_level || ''))) {
      strategy = STRATEGIES.BENCHMARK
    } else if (merchant.market_type === '乡村' && biz === '食杂店') {
      strategy = STRATEGIES.BASELINE
    } else {
      strategy = STRATEGIES.FLOW_UPGRADE
    }
  }

  // 目标结构价：流量改造冲 P75；标杆/结构取 P75；保底取中位
  let targetPrice = band.median
  if (strategy === STRATEGIES.FLOW_UPGRADE || strategy === STRATEGIES.BENCHMARK) {
    targetPrice = band.p75
  } else if (strategy === STRATEGIES.STRUCTURE) {
    targetPrice = Math.max(band.p75, band.median * 1.15)
  }

  // 雪茄户再抬高结构目标
  const cigar = String(merchant.cigar_tier || 'E').toUpperCase()
  if (cigar === 'C' || cigar === 'D') {
    targetPrice = Math.max(targetPrice, band.p75 * 1.1)
  }

  // SKU 宽度：低档/保底收窄，防压货
  let skuLimit = Infinity
  if (strategy === STRATEGIES.BASELINE) skuLimit = tier <= 10 ? 6 : 8
  else if (tier <= 10) skuLimit = 10
  else if (strategy === STRATEGIES.STRUCTURE) skuLimit = 12

  // 打分权重
  const weights = {
    [STRATEGIES.BENCHMARK]: { rho: 0.40, structure: 0.35, volume: 0.25 },
    [STRATEGIES.FLOW_UPGRADE]: { rho: 0.28, structure: 0.50, volume: 0.22 },
    [STRATEGIES.STRUCTURE]: { rho: 0.35, structure: 0.50, volume: 0.15 },
    [STRATEGIES.BASELINE]: { rho: 0.55, structure: 0.20, volume: 0.25 }
  }[strategy]

  const credit = String(merchant.credit_level || 'A').toUpperCase()
  const creditBlocked = credit === 'D' || credit === 'C'

  return {
    tier,
    strategy,
    band,
    targetPrice: +targetPrice.toFixed(1),
    bizCoef,
    isCommercial,
    skuLimit,
    weights,
    credit,
    creditBlocked,
    cigarTier: cigar,
    refQty: TIER_REF_QTY[tier] ?? null,
    targetQty: TIER_REF_QTY[tier] != null ? +(TIER_REF_QTY[tier] * bizCoef).toFixed(1) : null
  }
}

/**
 * 结构契合：商品零售价越接近目标结构价越好（高斯衰减）
 * σ = 目标价的 35%，保证价差一倍时仍有约 0.13 分
 */
function structureFit(sellPrice, targetPrice) {
  if (!(targetPrice > 0) || !(sellPrice > 0)) return 0
  const sigma = targetPrice * 0.35
  const z = (sellPrice - targetPrice) / sigma
  return Math.exp(-0.5 * z * z)
}

/**
 * 走量契合：低单价更易铺量；结构型则反过来偏好中高价
 */
function volumeFit(cost, medianCost, strategy) {
  if (!(medianCost > 0) || !(cost > 0)) return 0.5
  const ratio = cost / medianCost
  if (strategy === STRATEGIES.STRUCTURE) {
    // 结构型：中高价更好（ratio∈[0.8,1.6] 给高分）
    return Math.exp(-0.5 * ((ratio - 1.2) / 0.5) ** 2)
  }
  // 其他：便宜更好，但不要过度惩罚高价
  return 1 / (1 + Math.max(0, ratio - 0.6))
}

function normalize01(value, min, max) {
  if (!(max > min)) return 0.5
  return Math.max(0, Math.min(1, (value - min) / (max - min)))
}

/**
 * @param {Array} products  { product_name, cost_price, sell_price, cap, seg, product_code? }
 * @param {number} budget
 * @param {Object} merchant 见 classifyMerchant
 * @param {Object} segCaps  { '5段': n, ... }
 * @param {Object} [options]
 * @returns {Object} 订货方案（兼容 v1 字段 + 新增 strategy 诊断）
 */
export function optimizeOrderV2(products, budget, merchant = {}, segCaps = {}, options = {}) {
  const safeBudget = Number(budget) || 0
  const profile = classifyMerchant(merchant)

  if (!products || products.length === 0 || safeBudget <= 0) {
    return emptyResult(safeBudget, profile, '没有可用货源或预算无效')
  }

  if (profile.creditBlocked && !options.allowLowCredit) {
    return emptyResult(
      safeBudget,
      profile,
      `诚信等级 ${profile.credit}：建议暂停自主订货，由客户经理人工审核后再投放`
    )
  }

  // 1. 候选清洗
  let candidates = products
    .map((p) => {
      const cost = Number(p.cost_price) || 0
      const retail = Number(p.sell_price) || 0
      const cap = Number(p.cap) || 0
      const profitPer = +(retail - cost).toFixed(2)
      return {
        ...p,
        cost_price: cost,
        sell_price: retail,
        cap,
        profitPer,
        rho: cost > 0 ? profitPer / cost : -Infinity
      }
    })
    .filter((p) => p.cost_price > 0 && p.profitPer > 0 && p.cap > 0)

  if (candidates.length === 0) {
    return emptyResult(safeBudget, profile, '过滤后无正毛利可订货源')
  }

  // 2. 多目标打分
  const rhos = candidates.map((p) => p.rho)
  const rhoMin = Math.min(...rhos)
  const rhoMax = Math.max(...rhos)
  const costs = candidates.map((p) => p.cost_price).sort((a, b) => a - b)
  const medianCost = costs[Math.floor(costs.length / 2)]
  const { weights } = profile

  for (const p of candidates) {
    const sFit = structureFit(p.sell_price, profile.targetPrice)
    const vFit = volumeFit(p.cost_price, medianCost, profile.strategy)
    const rNorm = normalize01(p.rho, rhoMin, rhoMax)

    // 雪茄档偏好：高零售价额外加分
    let bonus = 0
    if ((profile.cigarTier === 'C' || profile.cigarTier === 'D') && p.sell_price >= profile.targetPrice) {
      bonus += 0.08
    }
    // 商业区对中高端规格略加分
    if (profile.isCommercial && p.sell_price >= profile.band.median) {
      bonus += 0.04
    }

    p.score = +(
      weights.rho * rNorm +
      weights.structure * sFit +
      weights.volume * vFit +
      bonus
    ).toFixed(4)
    p._debug = { rNorm: +rNorm.toFixed(3), sFit: +sFit.toFixed(3), vFit: +vFit.toFixed(3), bonus }
  }

  candidates.sort((a, b) => b.score - a.score || b.rho - a.rho || b.profitPer - a.profitPer)

  // 3. 贪心分配（预算 / 单品 / 段位 / SKU 宽度）
  //    业态系数 > 1 时略微放宽「尽量花完」；< 1 时预留 (1-coef)*15% 预算不强制花完
  const spendCeiling =
    profile.bizCoef >= 1
      ? safeBudget
      : +(safeBudget * Math.max(0.7, 0.85 + profile.bizCoef * 0.15)).toFixed(2)

  let spent = 0
  let totalProfit = 0
  let totalRetail = 0
  let totalQty = 0
  const items = []
  const segUsed = {}

  for (const p of candidates) {
    if (items.length >= profile.skuLimit) break
    if (spent >= spendCeiling) break

    let cap = p.cap
    if (p.seg) {
      const left = (Number(segCaps[p.seg]) || 0) - (segUsed[p.seg] || 0)
      cap = Math.min(cap, Math.max(0, left))
    }
    if (cap <= 0) continue

    const affordable = Math.floor((spendCeiling - spent) / p.cost_price)
    const qty = Math.min(cap, affordable)
    if (qty <= 0) continue

    spent += qty * p.cost_price
    totalProfit += qty * p.profitPer
    totalRetail += qty * p.sell_price
    totalQty += qty
    if (p.seg) segUsed[p.seg] = (segUsed[p.seg] || 0) + qty

    items.push({
      product_name: p.product_name,
      product_code: p.product_code,
      cost_price: p.cost_price,
      sell_price: p.sell_price,
      seg: p.seg || null,
      profit: p.profitPer,
      quantity: qty,
      subtotal: +(qty * p.cost_price).toFixed(2),
      subtotalProfit: +(qty * p.profitPer).toFixed(2),
      score: p.score,
      rho: +p.rho.toFixed(4)
    })
  }

  // 4. 若因 SKU 上限 / 系数预留导致预算浪费过多，用剩余名额补最高 ρ 品（二次填充）
  if (spent < safeBudget * 0.92 && items.length < profile.skuLimit) {
    const picked = new Set(items.map((i) => i.product_name))
    const rest = candidates
      .filter((p) => !picked.has(p.product_name))
      .sort((a, b) => b.rho - a.rho)

    for (const p of rest) {
      if (items.length >= profile.skuLimit) break
      if (spent >= safeBudget) break

      let cap = p.cap
      if (p.seg) {
        const left = (Number(segCaps[p.seg]) || 0) - (segUsed[p.seg] || 0)
        cap = Math.min(cap, Math.max(0, left))
      }
      // 减去已订同名（不应发生）
      const affordable = Math.floor((safeBudget - spent) / p.cost_price)
      const qty = Math.min(cap, affordable)
      if (qty <= 0) continue

      spent += qty * p.cost_price
      totalProfit += qty * p.profitPer
      totalRetail += qty * p.sell_price
      totalQty += qty
      if (p.seg) segUsed[p.seg] = (segUsed[p.seg] || 0) + qty

      items.push({
        product_name: p.product_name,
        product_code: p.product_code,
        cost_price: p.cost_price,
        sell_price: p.sell_price,
        seg: p.seg || null,
        profit: p.profitPer,
        quantity: qty,
        subtotal: +(qty * p.cost_price).toFixed(2),
        subtotalProfit: +(qty * p.profitPer).toFixed(2),
        score: p.score,
        rho: +p.rho.toFixed(4),
        fillPass: 2
      })
    }
  }

  const totalCost = +spent.toFixed(2)
  totalProfit = +totalProfit.toFixed(2)
  const marginRate = totalCost > 0 ? +((totalProfit / totalCost) * 100).toFixed(2) : 0
  const avgUnitPrice = totalQty > 0 ? +(totalRetail / totalQty).toFixed(2) : 0
  const structureGap = +(avgUnitPrice - profile.targetPrice).toFixed(2)

  return {
    items,
    profitable: items,
    necessary: [],
    totalCost,
    totalProfit,
    remainingBudget: +(safeBudget - spent).toFixed(2),
    marginRate,
    avgUnitPrice,
    totalQty,
    structureGap,
    profile,
    summary: buildSummary({
      items,
      totalCost,
      totalProfit,
      budget: safeBudget,
      marginRate,
      avgUnitPrice,
      totalQty,
      profile,
      structureGap
    })
  }
}

function emptyResult(budget, profile, summary) {
  return {
    items: [],
    profitable: [],
    necessary: [],
    totalCost: 0,
    totalProfit: 0,
    remainingBudget: budget,
    marginRate: 0,
    avgUnitPrice: 0,
    totalQty: 0,
    structureGap: 0,
    profile,
    summary
  }
}

function buildSummary({
  items,
  totalCost,
  totalProfit,
  budget,
  marginRate,
  avgUnitPrice,
  totalQty,
  profile,
  structureGap
}) {
  const gapText =
    structureGap >= 0
      ? `高于目标 ${structureGap} 元/条`
      : `低于目标 ${Math.abs(structureGap)} 元/条（仍有结构提升空间）`

  return [
    `本次订货方案（v2 画像驱动）：`,
    `- 策略象限：${profile.strategy}`,
    `- 目标结构价：¥${profile.targetPrice}/条（同档 P 分位） · 业态系数 ${profile.bizCoef}`,
    `- 总预算：¥${budget.toFixed(2)}`,
    `- 实际花费：¥${totalCost.toFixed(2)} · 剩余 ¥${(budget - totalCost).toFixed(2)}`,
    `- 预计毛利：¥${totalProfit.toFixed(2)} · 综合利润率 ${marginRate}%`,
    `- 入选品种：${items.length} 种 · 合计 ${totalQty} 条`,
    `- 方案单条均价：¥${avgUnitPrice}（${gapText}）`,
    profile.skuLimit < Infinity ? `- SKU 宽度上限：${profile.skuLimit}（防压货）` : null
  ]
    .filter(Boolean)
    .join('\n')
}

// ═══════════════════════════════════════════════════════════════════════════
// 示例：5 万预算 · 用本地毛利表 + 商户画像跑一遍
// 运行：node backend/src/services/optimizerV2.js
// ═══════════════════════════════════════════════════════════════════════════

async function runDemo() {
  const require = createRequire(import.meta.url)
  const XLSX = require('xlsx')
  const { optimizeOrder } = await import('./optimizer.js')

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../')
  const priceFile = path.join(root, 'data/烟草进价零售价毛利表.xlsx')

  const wb = XLSX.readFile(priceFile)
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['烟草进价零售价毛利表'], { defval: '' })
  const segRows = XLSX.utils.sheet_to_json(wb.Sheets['段位总量'], { defval: '' })

  // 样例商户：郑州航空港区周静便利店（三十档 / 城镇 / 便利店 / 居民区 / AAA / 加盟 / 雪茄E）
  // 无历史单条价时走启发式 → 加盟+便利店 → 标杆型，目标结构冲 26-30 档 P75≈239.9
  const merchant = {
    customer_name: '郑州航空港区周静便利店',
    tier: 30,
    market_type: '城镇',
    business_type: '便利店',
    district: '居民区',
    credit_level: 'AAA',
    terminal_level: '加盟店',
    cigar_tier: 'E'
    // 若有历史可解开下面两行，直接定象限：
    // avg_unit_price: 180,
    // attainment_rate: 1.1
  }

  const BUDGET = 50000
  const tierKey = '30档'

  const products = rows
    .map((r, i) => {
      const cap = r[tierKey] === '' || r[tierKey] == null ? 0 : Number(r[tierKey])
      return {
        product_code: `P${String(i + 1).padStart(5, '0')}`,
        product_name: r['商品名称'],
        cost_price: Number(r['进货价(元/条)']) || 0,
        sell_price: Number(r['零售价(元/条·估算待核实)']) || 0,
        cap,
        seg: r['价位段'] || null
      }
    })
    .filter((p) => p.cap > 0 && p.cost_price > 0)

  const segCaps = {}
  for (const r of segRows) {
    const seg = r['段位']
    const cap = r[tierKey] === '' || r[tierKey] == null ? 0 : Number(r[tierKey])
    if (seg && cap > 0) segCaps[seg] = cap
  }

  const v1 = optimizeOrder(products, BUDGET, merchant.tier, segCaps)
  const v2 = optimizeOrderV2(products, BUDGET, merchant, segCaps)

  const avg = (plan) => {
    const qty = plan.items.reduce((s, i) => s + i.quantity, 0)
    const retail = plan.items.reduce((s, i) => s + i.quantity * i.sell_price, 0)
    return qty ? retail / qty : 0
  }

  console.log('═'.repeat(64))
  console.log('订货优化 v2 示例 · 预算 ¥50,000')
  console.log('═'.repeat(64))
  console.log(`商户：${merchant.customer_name}`)
  console.log(
    `画像：${merchant.tier}档 / ${merchant.market_type} / ${merchant.business_type} / ${merchant.district} / 诚信${merchant.credit_level} / ${merchant.terminal_level} / 雪茄${merchant.cigar_tier}`
  )
  console.log(`可订货源：${products.length} 种 · 段位上限：${JSON.stringify(segCaps)}`)
  console.log()
  console.log(v2.summary)
  console.log()
  console.log('── v1（纯毛利性价比） vs v2（画像多目标）──')
  console.log(
    `v1  花费 ¥${v1.totalCost}  毛利 ¥${v1.totalProfit}  利润率 ${v1.marginRate}%  品种 ${v1.items.length}  单条均价 ¥${avg(v1).toFixed(1)}`
  )
  console.log(
    `v2  花费 ¥${v2.totalCost}  毛利 ¥${v2.totalProfit}  利润率 ${v2.marginRate}%  品种 ${v2.items.length}  单条均价 ¥${v2.avgUnitPrice}  结构缺口 ${v2.structureGap}`
  )
  console.log()
  console.log('── v2 完整进货清单（按得分序）──')
  console.log(
    `${'#'.padStart(2)} ${'商品'.padEnd(22)} ${'进价'.padStart(7)} ${'零售'.padStart(7)} ${'毛利'.padStart(6)} ${'ρ'.padStart(6)} ${'得分'.padStart(6)} ${'条数'.padStart(4)} ${'成本'.padStart(9)} ${'利润'.padStart(8)}`
  )
  v2.items.forEach((p, i) => {
    console.log(
      `${String(i + 1).padStart(2)} ${p.product_name.slice(0, 11).padEnd(22)} ${String(p.cost_price).padStart(7)} ${String(p.sell_price).padStart(7)} ${String(p.profit).padStart(6)} ${p.rho.toFixed(3).padStart(6)} ${String(p.score).padStart(6)} ${String(p.quantity).padStart(4)} ${String(p.subtotal).padStart(9)} ${String(p.subtotalProfit).padStart(8)}`
    )
  })
  console.log()
  console.log('说明：v2 在接近的毛利下会抬高方案单条均价，逼近同档 P75 结构目标；')
  console.log('      对「高量低价·流量改造」店，这正是分析里 +16.3% 销额潜力的来源。')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runDemo().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
