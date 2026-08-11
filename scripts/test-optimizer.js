const XLSX = require('xlsx')
const { optimize } = require('../src/main/optimizer')

// 从价格表加载指定档位的商品
function loadProducts(grade) {
  const wb = XLSX.readFile('src/烟草进价零售价毛利表.xlsx')
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['烟草进价零售价毛利表'], { defval: '' })
  const gradeKey = String(grade).padStart(2, '0') + '档'
  return rows.map(r => ({
    name: r['商品名称'],
    cost: r['进货价(元/条)'],
    retail: r['零售价(元/条·估算待核实)'],
    cap: r[gradeKey] === '' ? 0 : Number(r[gradeKey]),
    seg: r['价位段'] || null
  }))
}

// 段位总量上限（30档=各3条；简化处理，实际应按档位读投放表）
const segCap = { '5段': 3, '6段': 3, '7段': 3 }

for (const [grade, budget] of [[30, 3000], [30, 50000], [8, 20000]]) {
  const products = loadProducts(grade)
  const res = optimize(products, budget, segCap)
  console.log(`\n===== ${grade}档 / 预算${budget} =====`)
  console.log(`入选:${res.plan.length}种  成本:${res.totalCost}  剩余:${res.remaining}  利润:${res.totalProfit}  综合利润率:${res.marginRate}%`)
  console.log('前5:', res.plan.slice(0, 5).map(p => `${p.name}×${p.qty}`).join(', '))
}
