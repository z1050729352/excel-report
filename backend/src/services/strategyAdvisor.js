/**
 * 经营策略顾问
 * 根据商户的市场类型（城镇/乡村）、档位、当月销量、档位平均销量，
 * 拼接出有针对性的经营建议话术。不联网，纯模板 + 数据驱动。
 */

import { normalizeTier } from './tierUtils.js'

/**
 * 判断市场类型归类：城镇 / 乡村 / 未知
 * 兼容"城市""城镇""市区""乡村""农村""乡镇"等表述
 */
function classifyMarket(marketType) {
  const s = String(marketType || '').trim()
  if (!s) return 'unknown'
  if (/城|市区|市镇|镇/.test(s) && !/乡/.test(s)) return 'urban'
  if (/乡|农/.test(s)) return 'rural'
  return 'unknown'
}

/**
 * 档位高低分级：1-10 低档，11-20 中档，21-30 高档
 */
function tierLevel(tierInt) {
  if (tierInt == null) return 'unknown'
  if (tierInt >= 21) return 'high'
  if (tierInt >= 11) return 'mid'
  return 'low'
}

const TIER_LEVEL_LABEL = { high: '高档位', mid: '中档位', low: '低档位', unknown: '档位未知' }

/**
 * 生成经营策略
 * @param {Object} merchant 商户对象（含 market_type, tier, monthly_sales 等）
 * @param {Object} stats 档位统计 { tierAvgSales, nextTier, nextTierAvgSales, tierMerchantCount }
 * @returns {{ marketType:string, tierLevel:string, suggestions:string[], summary:string }}
 */
export function buildBusinessStrategy(merchant, stats = {}) {
  const tierInt = normalizeTier(merchant.tier)
  const market = classifyMarket(merchant.market_type)
  const level = tierLevel(tierInt)
  const suggestions = []

  // ── 1. 市场类型维度：价位结构建议 ──────────────────────────────
  if (market === 'urban') {
    suggestions.push(
      '您位于城镇市场，消费能力较强、对中高价位卷烟接受度高。建议适当增加高价位、精品卷烟的订货比例，满足商务、送礼及品牌消费需求，提升整体客单价与毛利空间。'
    )
  } else if (market === 'rural') {
    suggestions.push(
      '您位于乡村市场，消费以口粮烟、中低价位卷烟为主。建议以走量的中低价位卷烟为订货重点，保证畅销规格不断货，同时少量搭配中价位新品培育消费升级。'
    )
  } else {
    suggestions.push(
      '结合本地实际消费水平合理搭配高、中、低价位卷烟结构，畅销规格保证不断货，兼顾毛利与动销。'
    )
  }

  // ── 2. 档位维度：价位档次匹配 ────────────────────────────────
  if (level === 'high') {
    suggestions.push(
      `您当前为${TIER_LEVEL_LABEL[level]}（${merchant.tier}），进货实力较强。可优先保障高价位、紧俏货源的订货量，用高毛利品种拉动整体盈利。`
    )
  } else if (level === 'mid') {
    suggestions.push(
      `您当前为${TIER_LEVEL_LABEL[level]}（${merchant.tier}），建议以中价位卷烟为主力、高价位适度点缀，稳中求进逐步优化结构。`
    )
  } else if (level === 'low') {
    suggestions.push(
      `您当前为${TIER_LEVEL_LABEL[level]}（${merchant.tier}），建议聚焦低价位畅销规格、保证周转，避免高价位品种压货占用资金。`
    )
  }

  // ── 3. 订货量对比 & 冲击下一档位（最重要）────────────────────
  const mySales = Number(merchant.monthly_sales)
  const avg = Number(stats.tierAvgSales)
  if (Number.isFinite(mySales) && Number.isFinite(avg) && avg > 0) {
    const diff = +(mySales - avg).toFixed(1)
    const pct = +((mySales / avg - 1) * 100).toFixed(1)
    if (diff >= 0) {
      suggestions.push(
        `您当月销量 ${mySales} 条，高于同档位平均水平（${avg} 条）约 ${pct}%，经营表现良好。可在此基础上继续拓展客源、优化价位结构，向更高档位稳步迈进。`
      )
    } else {
      suggestions.push(
        `您当月销量 ${mySales} 条，低于同档位平均水平（${avg} 条）约 ${Math.abs(pct)}%（差 ${Math.abs(diff)} 条）。建议加强畅销品种备货、提升到店动销，争取达到并超过同档位平均线。`
      )
    }
  } else if (Number.isFinite(mySales)) {
    suggestions.push(`您当月销量为 ${mySales} 条，建议持续关注动销情况，稳定订货节奏。`)
  }

  // ── 4. 达到下一档位所需增量 ─────────────────────────────────
  if (
    Number.isFinite(mySales) &&
    stats.nextTier &&
    Number.isFinite(Number(stats.nextTierAvgSales)) &&
    Number(stats.nextTierAvgSales) > mySales
  ) {
    const gap = +(Number(stats.nextTierAvgSales) - mySales).toFixed(1)
    suggestions.push(
      `若希望冲击更高的第 ${stats.nextTier} 档，参考该档位平均销量 ${stats.nextTierAvgSales} 条，您还需在当前基础上约多销售 ${gap} 条。可通过增加畅销规格订货、开展店内陈列促销等方式逐步提量。`
    )
  }

  const summary =
    `综合您的市场类型（${merchant.market_type || '未知'}）、经营档位（${merchant.tier || '未知'}）` +
    `${Number.isFinite(mySales) ? `与当月销量（${mySales} 条）` : ''}，为您提供以下经营建议：`

  return {
    marketType: merchant.market_type || null,
    marketClass: market,
    tierLevel: level,
    monthlySales: Number.isFinite(mySales) ? mySales : null,
    tierAvgSales: Number.isFinite(avg) ? avg : null,
    suggestions,
    summary
  }
}
