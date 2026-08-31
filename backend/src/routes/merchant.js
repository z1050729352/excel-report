import express from 'express'
import { query } from '../models/db.js'
import { normalizeTier } from '../services/tierUtils.js'
import { optimizeOrder } from '../services/optimizer.js'
import { buildBusinessStrategy } from '../services/strategyAdvisor.js'

/**
 * 计算档位销量统计：本档位平均销量、下一档位及其平均销量
 * 基于 merchants 表中已导入销量的商户
 */
async function computeTierStats(tierInt) {
  if (!tierInt) return {}

  // 拉取所有有销量的商户，按归一化档位聚合（tier 字段是中文/多格式，需在内存归一化）
  const rows = await query(
    'SELECT tier, monthly_sales FROM merchants WHERE monthly_sales IS NOT NULL'
  )

  const byTier = {} // tierInt -> { sum, count }
  for (const r of rows) {
    const t = normalizeTier(r.tier)
    const s = Number(r.monthly_sales)
    if (!t || !Number.isFinite(s)) continue
    if (!byTier[t]) byTier[t] = { sum: 0, count: 0 }
    byTier[t].sum += s
    byTier[t].count += 1
  }

  const avgOf = (t) =>
    byTier[t] && byTier[t].count > 0 ? +(byTier[t].sum / byTier[t].count).toFixed(1) : null

  // 找下一个存在数据的更高档位
  let nextTier = null
  for (let t = tierInt + 1; t <= 30; t++) {
    if (byTier[t] && byTier[t].count > 0) {
      nextTier = t
      break
    }
  }

  return {
    tierAvgSales: avgOf(tierInt),
    tierMerchantCount: byTier[tierInt]?.count || 0,
    nextTier,
    nextTierAvgSales: nextTier ? avgOf(nextTier) : null
  }
}

const router = express.Router()

/**
 * GET /api/merchant/:licenseNo
 * 查询商户信息（C端，无需登录）
 */
router.get('/:licenseNo', async (req, res) => {
  try {
    const { licenseNo } = req.params
    
    if (!licenseNo) {
      return res.status(400).json({
        success: false,
        error: '请输入商户号'
      })
    }
    
    // 查询商户
    const merchants = await query(
      'SELECT * FROM merchants WHERE license_no = ? AND status = ?',
      [licenseNo, '正常']
    )
    
    if (merchants.length === 0) {
      return res.status(404).json({
        success: false,
        error: '未找到该商户，请检查商户号'
      })
    }
    
    const merchant = merchants[0]
    
    // 统计可订货源数量
    const tierInt = normalizeTier(merchant.tier)
    let productCount = 0
    
    if (tierInt) {
      const products = await query('SELECT caps_json FROM products')
      productCount = products.filter(p => {
        if (!p.caps_json) return false
        try {
          // MySQL2 已自动解析 JSON 字段，caps_json 可能是对象或字符串
          const caps = typeof p.caps_json === 'string' ? JSON.parse(p.caps_json) : p.caps_json
          return (caps[tierInt] || 0) > 0
        } catch {
          return false
        }
      }).length
    }
    
    res.json({
      success: true,
      merchant,
      productCount
    })
  } catch (err) {
    console.error('[Merchant] 查询商户失败:', err)
    res.status(500).json({
      success: false,
      error: '查询失败，请稍后重试'
    })
  }
})

/**
 * POST /api/merchant/plan
 * 生成订货方案（C端，无需登录）
 */
router.post('/plan', async (req, res) => {
  try {
    const { licenseNo, budget } = req.body
    
    if (!licenseNo) {
      return res.status(400).json({
        success: false,
        error: '请输入商户号'
      })
    }
    
    if (!budget || budget < 3000) {
      return res.status(400).json({
        success: false,
        error: '预算不能低于3000元'
      })
    }
    
    // 查询商户
    const merchants = await query(
      'SELECT * FROM merchants WHERE license_no = ? AND status = ?',
      [licenseNo, '正常']
    )
    
    if (merchants.length === 0) {
      return res.status(404).json({
        success: false,
        error: '未找到该商户'
      })
    }
    
    const merchant = merchants[0]
    const tierInt = normalizeTier(merchant.tier)
    
    if (!tierInt) {
      return res.status(400).json({
        success: false,
        error: '商户档位信息无效'
      })
    }
    
    // 查询可订货源
    const allProducts = await query('SELECT * FROM products')
    const products = allProducts
      .map(p => {
        let caps = {}
        try {
          // MySQL2 已自动解析 JSON 字段，兼容对象和字符串两种情况
          caps = !p.caps_json ? {} : typeof p.caps_json === 'string' ? JSON.parse(p.caps_json) : p.caps_json
        } catch {
          caps = {}
        }
        const cap = Number(caps[tierInt]) || 0
        if (cap > 0) {
          return { ...p, cap }
        }
        return null
      })
      .filter(p => p !== null)
    
    if (products.length === 0) {
      return res.json({
        success: true,
        orderPlan: {
          items: [],
          profitable: [],
          necessary: [],
          totalCost: 0,
          totalProfit: 0,
          remainingBudget: budget,
          marginRate: 0,
          summary: '该档位暂无可订货源'
        },
        merchant
      })
    }
    
    // 查询段位总量上限
    const segCapRows = await query(
      'SELECT seg, cap FROM seg_caps WHERE tier = ?',
      [tierInt]
    )
    const segCaps = {}
    for (const row of segCapRows) {
      segCaps[row.seg] = row.cap
    }
    
    // 计算最优方案
    const orderPlan = optimizeOrder(products, budget, merchant.tier, segCaps)

    // 生成经营策略建议
    let businessStrategy = null
    try {
      const tierStats = await computeTierStats(tierInt)
      businessStrategy = buildBusinessStrategy(merchant, tierStats)
    } catch (err) {
      console.warn('[Merchant] 生成经营策略失败:', err.message)
    }

    // 记录查询日志（可选）
    try {
      await query(
        'INSERT INTO query_logs (license_no, budget, ip_address) VALUES (?, ?, ?)',
        [licenseNo, budget, req.ip]
      )
    } catch (err) {
      console.warn('[Merchant] 记录查询日志失败:', err.message)
    }
    
    res.json({
      success: true,
      orderPlan,
      businessStrategy,
      merchant: {
        license_no: merchant.license_no,
        customer_name: merchant.customer_name,
        tier: merchant.tier,
        credit_level: merchant.credit_level,
        market_type: merchant.market_type,
        monthly_sales: merchant.monthly_sales
      }
    })
  } catch (err) {
    console.error('[Merchant] 生成订货方案失败:', err)
    res.status(500).json({
      success: false,
      error: '生成方案失败，请稍后重试'
    })
  }
})

export default router
