/**
 * 烟草进货利润最优化
 * 有界背包问题：贪心（性价比降序）+ DP 兜底
 */

/**
 * @param {Array} products 商品列表，每项:
 *   { name, cost, retail, cap, seg }
 *   - cost   进货价/条
 *   - retail 零售价/条
 *   - cap    该档位单品上限（已按商户档位取好）
 *   - seg    段位标识('5段'/'6段'/'7段')或 null
 * @param {number} budget 预算(≥3000)
 * @param {Object} segCap 段位总量上限 { '5段': n, '6段': n, '7段': n }
 * @returns {Object} { plan, totalCost, totalProfit, remaining, marginRate }
 */
function optimize(products, budget, segCap = {}) {
  if (budget < 3000) throw new Error('预算不能低于 3000 元')

  // 1. 计算性价比并过滤无效项
  const items = products
    .filter(p => p.cost > 0 && p.retail > p.cost && p.cap > 0)
    .map(p => ({
      ...p,
      profitPer: +(p.retail - p.cost).toFixed(2),
      rho: (p.retail - p.cost) / p.cost
    }))
    // 2. 按性价比降序，相同则按单条毛利降序
    .sort((a, b) => b.rho - a.rho || b.profitPer - a.profitPer)

  // 3. 贪心分配
  let spent = 0, profit = 0
  const plan = []
  const segUsed = {}

  for (const it of items) {
    if (spent >= budget) break
    let cap = it.cap
    if (it.seg) {
      const left = (segCap[it.seg] || 0) - (segUsed[it.seg] || 0)
      cap = Math.min(cap, left)
    }
    if (cap <= 0) continue

    const affordable = Math.floor((budget - spent) / it.cost)
    const qty = Math.min(cap, affordable)
    if (qty <= 0) continue

    spent += qty * it.cost
    profit += qty * it.profitPer
    if (it.seg) segUsed[it.seg] = (segUsed[it.seg] || 0) + qty

    plan.push({
      name: it.name,
      cost: it.cost,
      retail: it.retail,
      seg: it.seg,
      qty,
      subtotalCost: +(qty * it.cost).toFixed(2),
      subtotalProfit: +(qty * it.profitPer).toFixed(2)
    })
  }

  return {
    plan,
    totalCost: +spent.toFixed(2),
    totalProfit: +profit.toFixed(2),
    remaining: +(budget - spent).toFixed(2),
    marginRate: spent > 0 ? +((profit / spent) * 100).toFixed(2) : 0
  }
}

module.exports = { optimize }
