/**
 * 订货优化算法
 * 在有限预算下，实现利润最大化
 */

/**
 * 订货优化算法（贪心算法）
 * @param {Array} products - 可用货源列表
 * @param {Number} budget - 预算
 * @param {String} tier - 当前档位
 * @returns {Object} 订货方案
 */
export function optimizeOrder(products, budget, tier) {
  if (!products || products.length === 0) {
    return {
      profitable: [],
      necessary: [],
      totalCost: 0,
      totalProfit: 0,
      remainingBudget: budget,
      summary: '没有可用货源'
    }
  }
  
  // 1. 分类：赚钱的 vs 赔钱的
  const profitable = products.filter(p => p.profit > 0).sort((a, b) => b.profit - a.profit)
  const unprofitable = products.filter(p => p.profit <= 0).sort((a, b) => a.profit - b.profit) // 亏损少的优先
  
  // 2. 贪心算法：优先选利润高的
  const selected = []
  let remainingBudget = budget
  let totalProfit = 0
  
  for (const product of profitable) {
    if (remainingBudget >= product.cost_price) {
      selected.push({
        ...product,
        quantity: 1, // 简化：每种货源订 1 单位
        subtotal: product.cost_price,
        profit: product.profit
      })
      remainingBudget -= product.cost_price
      totalProfit += product.profit
    }
  }
  
  // 3. 保档位策略：如果还有预算，加一些必订的（即使亏损）
  // 简化逻辑：选择亏损最少的几个
  const necessary = []
  const necessaryCount = Math.min(3, unprofitable.length) // 最多选 3 个
  
  for (let i = 0; i < necessaryCount && i < unprofitable.length; i++) {
    const product = unprofitable[i]
    if (remainingBudget >= product.cost_price) {
      necessary.push({
        ...product,
        quantity: 1,
        subtotal: product.cost_price,
        profit: product.profit,
        reason: '保档位必订'
      })
      remainingBudget -= product.cost_price
      totalProfit += product.profit
    }
  }
  
  const totalCost = budget - remainingBudget
  
  return {
    profitable: selected,
    necessary: necessary,
    totalCost: totalCost,
    totalProfit: totalProfit,
    remainingBudget: remainingBudget,
    summary: generateSummary(selected, necessary, totalCost, totalProfit, budget)
  }
}

/**
 * 生成订货方案摘要
 */
function generateSummary(profitable, necessary, totalCost, totalProfit, budget) {
  const profitableCount = profitable.length
  const necessaryCount = necessary.length
  const totalCount = profitableCount + necessaryCount
  
  let summary = `本次订货方案：\n`
  summary += `- 总预算：¥${budget.toFixed(2)}\n`
  summary += `- 实际花费：¥${totalCost.toFixed(2)}\n`
  summary += `- 预计利润：¥${totalProfit.toFixed(2)}\n`
  summary += `- 利润率：${((totalProfit / totalCost) * 100).toFixed(1)}%\n\n`
  
  summary += `订货明细：\n`
  summary += `- 优先订购（赚钱）：${profitableCount} 种\n`
  summary += `- 保档必订（亏损）：${necessaryCount} 种\n`
  summary += `- 合计：${totalCount} 种货源\n`
  
  return summary
}

/**
 * 生成订货指导建议
 */
export function generateOrderGuide(merchant, products, orderPlan) {
  const guide = {
    merchantInfo: {
      customerName: merchant.customer_name,
      licenseNo: merchant.license_no,
      tier: merchant.tier,
      creditLevel: merchant.credit_level,
      budget: merchant.budget
    },
    orderPlan: orderPlan,
    recommendations: []
  }
  
  // 生成建议
  if (orderPlan.profitable.length > 0) {
    guide.recommendations.push({
      type: 'success',
      title: '优先订购建议',
      content: `以下 ${orderPlan.profitable.length} 种货源利润较高，建议优先订购：`,
      items: orderPlan.profitable.map(p => ({
        name: p.product_name,
        profit: p.profit,
        costPrice: p.cost_price,
        sellPrice: p.sell_price
      }))
    })
  }
  
  if (orderPlan.necessary.length > 0) {
    guide.recommendations.push({
      type: 'warning',
      title: '保档位必订',
      content: `为了保持 ${merchant.tier} 档位，建议订购以下货源（虽然利润较低）：`,
      items: orderPlan.necessary.map(p => ({
        name: p.product_name,
        profit: p.profit,
        costPrice: p.cost_price,
        sellPrice: p.sell_price,
        reason: p.reason
      }))
    })
  }
  
  if (orderPlan.remainingBudget > 0) {
    guide.recommendations.push({
      type: 'info',
      title: '预算结余',
      content: `本次订货后还剩余 ¥${orderPlan.remainingBudget.toFixed(2)}，可用于下次订货或应急周转。`
    })
  }
  
  return guide
}

/**
 * 计算档位保持所需最低订货量
 * （简化版：根据档位返回建议订货金额）
 */
export function calculateMinOrderForTier(tier) {
  const tierRequirements = {
    'A档': 50000,
    'B档': 30000,
    'C档': 20000,
    'D档': 10000
  }
  
  return tierRequirements[tier] || 10000
}
