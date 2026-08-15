/**
 * 档位归一化工具
 * 商户档位可能是「八档」「8档」「08档」「8」等多种格式，统一转成 1-30 整数
 */

const CN_NUM = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10
}

/**
 * 解析中文数字（支持 1-30，如「八」「十」「二十」「三十」「二十九」）
 */
function parseChineseNumber(str) {
  if (!str) return NaN
  if (CN_NUM[str] !== undefined && !str.includes('十')) return CN_NUM[str]

  const idx = str.indexOf('十')
  if (idx === -1) return CN_NUM[str] ?? NaN

  // 含「十」：十=10，二十=20，二十九=29，三十=30
  const tensChar = str.slice(0, idx)
  const onesChar = str.slice(idx + 1)
  const tens = tensChar ? (CN_NUM[tensChar] || 0) : 1
  const ones = onesChar ? (CN_NUM[onesChar] || 0) : 0
  return tens * 10 + ones
}

/**
 * 将任意档位表示归一化为 1-30 的整数，无法识别返回 null
 * @param {string|number} tier
 * @returns {number|null}
 */
export function normalizeTier(tier) {
  if (tier == null) return null
  if (typeof tier === 'number' && Number.isFinite(tier)) {
    return tier >= 1 && tier <= 30 ? Math.round(tier) : null
  }

  const s = String(tier).trim()
  if (!s) return null

  // 纯数字或带「档」的阿拉伯数字：30档 / 08档 / 8
  const digitMatch = s.match(/(\d+)/)
  if (digitMatch) {
    const n = parseInt(digitMatch[1], 10)
    return n >= 1 && n <= 30 ? n : null
  }

  // 中文数字：八档 / 二十九档 / 三十档
  const cnMatch = s.replace(/档$/, '')
  const n = parseChineseNumber(cnMatch)
  return Number.isFinite(n) && n >= 1 && n <= 30 ? n : null
}

/**
 * 生成价格表列名 key，如 8 -> "08档"，30 -> "30档"
 */
export function tierColumnKey(tierInt) {
  return String(tierInt).padStart(2, '0') + '档'
}
