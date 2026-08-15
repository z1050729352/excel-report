const XLSX = require('xlsx')
const wb = XLSX.readFile('src/货源投放策略7.23.xls')
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Sheet1'], { header: 1, defval: '' })

// 档位表头：第5行(index5) 列3='30档' ... 列32='01档'
const headerRow = rows[5]
const gradeCols = [] // [{label,col}]
for (let c = 3; c < headerRow.length; c++) {
  if (String(headerRow[c]).includes('档')) gradeCols.push({ label: headerRow[c], col: c })
}

// 价位段区间中值当进价
const SEG_PRICE = { '5段': (263 + 290) / 2, '6段': (220 + 263) / 2, '7段': (180 + 220) / 2 }

// 批零差率模型（零售毛利率，贴合国家分类管控规律）
// 毛利率定义：(零售价 - 进价) / 零售价
function retailMargin(cost) {
  if (cost >= 600) return 0.10
  if (cost >= 400) return 0.11
  if (cost >= 300) return 0.12
  if (cost >= 200) return 0.13
  if (cost >= 150) return 0.14
  if (cost >= 100) return 0.15
  return 0.16
}
// 零售价 = 进价 / (1 - 毛利率)，取整到 5 元/条（=0.5元/包）
function calcRetail(cost) {
  const m = retailMargin(cost)
  const raw = cost / (1 - m)
  return Math.round(raw / 5) * 5
}

// 组装数据
const out = []
for (let i = 6; i < rows.length; i++) {
  const name = rows[i][0], mode = rows[i][1], priceOrSeg = rows[i][2]
  if (!name) continue
  let cost, segLabel = ''
  if (mode === '价位段') {
    cost = SEG_PRICE[priceOrSeg]; segLabel = priceOrSeg
    if (!cost) continue
  } else if (mode === '其他' && typeof priceOrSeg === 'number') {
    cost = priceOrSeg
  } else continue

  const retail = calcRetail(cost)
  const profit = +(retail - cost).toFixed(2)
  const margin = +((profit / retail) * 100).toFixed(2)

  const row = {
    商品名称: name,
    投放模式: mode,
    价位段: segLabel,
    '进货价(元/条)': cost,
    '零售价(元/条·估算待核实)': retail,
    '单条毛利(元)': profit,
    '毛利率(%)': margin
  }
  // 追加各档位配额
  gradeCols.forEach(g => { row[g.label] = rows[i][g.col] === '' ? '' : rows[i][g.col] })
  out.push(row)
}

// 生成工作簿
const headerOrder = ['商品名称', '投放模式', '价位段', '进货价(元/条)', '零售价(元/条·估算待核实)', '单条毛利(元)', '毛利率(%)', ...gradeCols.map(g => g.label)]
const ws = XLSX.utils.json_to_sheet(out, { header: headerOrder })
ws['!cols'] = headerOrder.map(h => ({ wch: h === '商品名称' ? 24 : h.length > 8 ? 18 : 8 }))
const newWb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(newWb, ws, '烟草进价零售价毛利表')

// 说明页
const notes = [
  ['说明项', '内容'],
  ['数据来源', '进货价、各档位配额：来自《货源投放策略7.23.xls》原表'],
  ['价位段进价', '5段取[263,290)中值276.5；6段取[220,263)中值241.5；7段取[180,220)中值200'],
  ['零售价', '⚠️ 市场估算值，非官方。按国家批零差率管控规律推算，待产品/烟草公司零售指导价核实替换'],
  ['毛利率定义', '(零售价 - 进货价) / 零售价 × 100%'],
  ['差率模型', '进价≥600→10%；400-600→11%；300-400→12%；200-300→13%；150-200→14%；100-150→15%；<100→16%'],
  ['档位配额', '数字=该档位该品种可订上限(条)，空=不投放'],
  ['价位段约束', '除单品上限外，5/6/7段还有整段总量上限(30档各段合计≤3条)，程序里需额外处理']
]
const wsNote = XLSX.utils.aoa_to_sheet(notes)
wsNote['!cols'] = [{ wch: 14 }, { wch: 80 }]
XLSX.utils.book_append_sheet(newWb, wsNote, '说明')

// 段位总量上限 sheet（从原投放表行2-4读取各档位的段位总量）
const segHeader = ['段位', ...gradeCols.map(g => g.label)]
const segRows = [segHeader]
for (let i = 2; i <= 4; i++) {
  const seg = rows[i][0]
  if (!seg) continue
  const row = [seg]
  gradeCols.forEach(g => { row.push(rows[i][g.col] === '' ? '' : rows[i][g.col]) })
  segRows.push(row)
}
const wsSeg = XLSX.utils.aoa_to_sheet(segRows)
wsSeg['!cols'] = segHeader.map(() => ({ wch: 6 }))
XLSX.utils.book_append_sheet(newWb, wsSeg, '段位总量')

XLSX.writeFile(newWb, 'src/烟草进价零售价毛利表.xlsx')
console.log('已生成: src/烟草进价零售价毛利表.xlsx')
console.log('品种数:', out.length)
console.log('\n样例(前10行):')
out.slice(0, 10).forEach(r => console.log(
  r.商品名称.padEnd(22), '进', String(r['进货价(元/条)']).padStart(7), '零售', String(r['零售价(元/条·估算待核实)']).padStart(6), '毛利', String(r['单条毛利(元)']).padStart(7), r['毛利率(%)'] + '%'
))
