const XLSX = require('xlsx')
const wb = XLSX.readFile('src/货源投放策略7.23.xls')
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Sheet1'], { header: 1, defval: '' })

// ── 入参：档位(1-30) 和 预算，模拟从数据库商户表查到 ──
const GRADE = parseInt(process.argv[2] || '30', 10) // 档位
const BUDGET = parseFloat(process.argv[3] || '50000') // 预算

// 表头第5行(index5): 列3='30档' ... 列32='01档'，找到目标档位的列索引
const headerRow = rows[5]
let gradeCol = -1
for (let c = 3; c < headerRow.length; c++) {
  if (String(headerRow[c]).replace(/^0/, '') === String(GRADE) + '档' || headerRow[c] === String(GRADE).padStart(2, '0') + '档') {
    gradeCol = c; break
  }
}
if (gradeCol === -1) { console.error('未找到档位列:', GRADE); process.exit(1) }

// 段位价格区间中值（进货价/条）与段位总量上限（读对应档位列）
const SEG_PRICE = { '5段': (263 + 290) / 2, '6段': (220 + 263) / 2, '7段': (180 + 220) / 2 }
const SEG_TOTAL_CAP = {}
for (let i = 2; i <= 4; i++) {
  const seg = rows[i][0], cap = rows[i][gradeCol]
  if (seg) SEG_TOTAL_CAP[seg] = typeof cap === 'number' ? cap : 0
}

// 提取该档位可订品种
let items = []
for (let i = 6; i < rows.length; i++) {
  const name = rows[i][0], mode = rows[i][1], priceOrSeg = rows[i][2], q = rows[i][gradeCol]
  if (typeof q !== 'number' || q <= 0) continue
  if (mode === '价位段') {
    const price = SEG_PRICE[priceOrSeg]
    if (price) items.push({ name, price, cap: q, seg: priceOrSeg })
  } else if (mode === '其他' && typeof priceOrSeg === 'number') {
    items.push({ name, price: priceOrSeg, cap: q, seg: null })
  }
}

// 批零差率模型（贴合国家管控规律；上线用零售指导价表替换）
function marginRate(p) { return p >= 600 ? 0.10 : p >= 400 ? 0.12 : p >= 200 ? 0.15 : 0.17 }
items.forEach(it => { it.rate = marginRate(it.price); it.profitPer = +(it.price * it.rate).toFixed(2) })
items.sort((a, b) => b.rate - a.rate || b.profitPer - a.profitPer)

// 贪心 + 段位分组约束
let spent = 0, profit = 0, plan = []
const segUsed = {}
for (const it of items) {
  if (spent >= BUDGET) break
  let cap = it.cap
  if (it.seg) cap = Math.min(cap, (SEG_TOTAL_CAP[it.seg] || 0) - (segUsed[it.seg] || 0))
  if (cap <= 0) continue
  const qty = Math.min(cap, Math.floor((BUDGET - spent) / it.price))
  if (qty > 0) {
    spent += qty * it.price; profit += qty * it.profitPer
    if (it.seg) segUsed[it.seg] = (segUsed[it.seg] || 0) + qty
    plan.push({ ...it, qty, cost: +(qty * it.price).toFixed(2), gain: +(qty * it.profitPer).toFixed(2) })
  }
}

console.log(`档位=${GRADE}档  预算=${BUDGET}`)
console.log(`可订品种池:${items.length}  入选:${plan.length}`)
console.log(`进货成本:${spent.toFixed(2)}  剩余:${(BUDGET - spent).toFixed(2)}`)
console.log(`预计利润:${profit.toFixed(2)}  综合利润率:${(profit / spent * 100).toFixed(2)}%`)
console.log('\n完整进货清单:')
plan.forEach((p, i) => console.log(
  String(i + 1).padStart(2), p.name.padEnd(22), '进价' + String(p.price).padStart(7), '×' + String(p.qty).padStart(2) + '条',
  '成本' + String(p.cost).padStart(9), '利润' + String(p.gain).padStart(7)
))
