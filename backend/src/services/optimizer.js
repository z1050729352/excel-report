/**
 * 订货优化算法
 * 有界背包问题：按性价比(每元进价的毛利)降序贪心
 * 约束：预算 + 单品配额上限 + 段位总量上限
 */

/**
 * @param {Array} products 可订货源，每项：
 *   { product_name, cost_price, sell_price, cap, seg }
 *   - cost_price 进货价/条
 *   - sell_price 零售价/条
 *   - cap        该档位单品上限（条）
 *   - seg        段位标识 '5段'/'6段'/'7段' 或 null
 * @param {number} budget 预算（≥3000）
 * @param {string|number} tier 档位（透传，用于摘要）
 * @param {Object} segCaps 段位总量上限 { '5段': n, ... }
 * @returns {Object} 订货方案
 */
export function optimizeOrder(products, budget, tier, segCaps = {}) {
  const safeBudget = Number(budget) || 0
  if (!products || products.length === 0 || safeBudget <= 0) {
    return {
      items: [],
      profitable: [],
      necessary: [],
      totalCost: 0,
      totalProfit: 0,
      remainingBudget: safeBudget,
      marginRate: 0,
      summary: '没有可用货源或预算无效'
    }
  }

  // 1. 计算性价比，过滤无效项（进价>0、有毛利、有配额）
  const candidates = products
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
    // 2. 按性价比降序，相同则按单条毛利降序
    .sort((a, b) => b.rho - a.rho || b.profitPer - a.profitPer)

  // 3. 贪心分配
  let spent = 0
  let totalProfit = 0
  const items = []
  const segUsed = {}

  for (const p of candidates) {
    if (spent >= safeBudget) break

    let cap = p.cap
    if (p.seg) {
      const left = (Number(segCaps[p.seg]) || 0) - (segUsed[p.seg] || 0)
      cap = Math.min(cap, left)
    }
    if (cap <= 0) continue

    const affordable = Math.floor((safeBudget - spent) / p.cost_price)
    const qty = Math.min(cap, affordable)
    if (qty <= 0) continue

    spent += qty * p.cost_price
    totalProfit += qty * p.profitPer
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
      subtotalProfit: +(qty * p.profitPer).toFixed(2)
    })
  }

  const totalCost = +spent.toFixed(2)
  totalProfit = +totalProfit.toFixed(2)
  const marginRate = totalCost > 0 ? +((totalProfit / totalCost) * 100).toFixed(2) : 0

  return {
    items,
    // 兼容下游：全部计入 profitable（都是正毛利），necessary 保留空数组
    profitable: items,
    necessary: [],
    totalCost,
    totalProfit,
    remainingBudget: +(safeBudget - spent).toFixed(2),
    marginRate,
    summary: buildSummary(items, totalCost, totalProfit, safeBudget, marginRate)
  }
}

function buildSummary(items, totalCost, totalProfit, budget, marginRate) {
  return [
    `本次订货方案：`,
    `- 总预算：¥${budget.toFixed(2)}`,
    `- 实际花费：¥${totalCost.toFixed(2)}`,
    `- 预计毛利：¥${totalProfit.toFixed(2)}`,
    `- 综合利润率：${marginRate}%`,
    `- 入选品种：${items.length} 种`
  ].join('\n')
}
