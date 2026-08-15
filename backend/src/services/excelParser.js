/**
 * Excel 解析模块
 * 解析商户信息表、货源表、信息更变表
 */

import XLSX from 'xlsx'

/**
 * 从 Buffer 解析 Excel
 * @param {Buffer} buffer
 * @returns {{ sheetNames: string[], sheets: Object }}
 */
export function parseExcelFromBuffer(buffer) {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })

    const result = {
      sheetNames: workbook.SheetNames,
      sheets: {}
    }

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false })

      if (data.length > 0) {
        const firstRow = data[0]
        const keys = Object.keys(firstRow)

        const isSpecialFormat =
          keys.length > 0 &&
          (keys[0].includes('表格数据') ||
            keys[0] === '' ||
            keys[0].startsWith('_') ||
            keys.filter((k) => k === '' || k.startsWith('_') || k.startsWith('__EMPTY')).length >
              keys.length / 2)

        if (isSpecialFormat) {
          console.log('[ExcelParser] 检测到特殊格式，第一行是表头')

          const newHeaders = Object.values(firstRow)

          const newData = data.slice(1).map((row) => {
            const newRow = {}
            Object.values(row).forEach((value, index) => {
              const header = newHeaders[index]
              if (header) {
                newRow[header] = value
              }
            })
            return newRow
          })

          result.sheets[sheetName] = newData
          console.log('[ExcelParser] 重新解析后的表头:', newHeaders.slice(0, 10))
        } else {
          result.sheets[sheetName] = data
        }
      } else {
        result.sheets[sheetName] = data
      }
    }

    return result
  } catch (err) {
    console.error('[ExcelParser] 解析失败:', err)
    throw new Error(`Excel 解析失败: ${err.message}`)
  }
}

function mapMerchantsFromSheets(sheets) {
  const sheetName = Object.keys(sheets)[0]
  const rows = sheets[sheetName]

  console.log('[ExcelParser] 商户信息表原始数据示例:', rows[0])
  console.log('[ExcelParser] 商户信息表字段名:', Object.keys(rows[0] || {}))

  const merchants = rows
    .map((row) => {
      return {
        company:           findField(row, ['公司']),
        license_no:        findField(row, ['许可证号', '零售户许可证号', '许可证', 'license_no', 'license', '证号']),
        customer_name:     findField(row, ['客户名称', '零售户名称', '商户名称', '名称', 'customer_name', 'name']),
        legal_person:      findField(row, ['法人', '法定代表人']),
        customer_status:   findField(row, ['客户状态', '状态']),
        contact:           findField(row, ['联系电话', '联系方式', '电话', 'contact', 'phone', '手机']),
        district:          findField(row, ['区县', '地区']),
        market_dept:       findField(row, ['市场部']),
        sales_line:        findField(row, ['营销线']),
        address:           findField(row, ['经营地址', '地址', 'address', '详细地址']),
        business_scope:    findField(row, ['经营范围']),
        shop_name:         findField(row, ['店铺门头名称', '门头名称', '店名']),
        market_type:       findField(row, ['市场类型']),
        market_type_sub:   findField(row, ['市场类型细分']),
        business_type:     findField(row, ['业态']),
        business_scale:    findField(row, ['经营规模']),
        business_circle:   findField(row, ['商圈']),
        order_cycle:       findField(row, ['订货周期类型', '订货周期']),
        order_day:         findField(row, ['订货日']),
        order_method:      findField(row, ['订货方式']),
        payment_method:    findField(row, ['结算方式']),
        online_payment:    findField(row, ['是否允许网上结算', '网上结算']),
        credit_level:      findField(row, ['诚信等级', '信用等级', 'credit_level', 'credit']),
        tier_code:         findField(row, ['档位编码']),
        tier:              findField(row, ['档位', '客户档位', 'tier', '等级']),
        join_date:         findField(row, ['入网日期']),
        terminal_level:    findField(row, ['终端层级']),
        terminal_type:     findField(row, ['终端类别']),
        terminal_type_sub: findField(row, ['终端类型细分']),
        cigar_tier:        findField(row, ['雪茄烟档位']),
        cigar_terminal_type: findField(row, ['雪茄烟终端类型']),
        sample_type:       findField(row, ['自动采集样本户类型']),
        budget:            parseFloat(findField(row, ['预算', 'budget', '资金']) || 50000),
        notes:             null
      }
    })
    .filter((m) => m.license_no)

  console.log(`[ExcelParser] 解析商户信息: ${merchants.length} 条`)
  return merchants
}

export function parseMerchantSheet(buffer) {
  const { sheets } = parseExcelFromBuffer(buffer)
  return mapMerchantsFromSheets(sheets)
}

/**
 * 从行对象中提取各档位配额矩阵
 * 匹配形如「30档」「01档」的列，key 为档位整数
 */
function extractCapsMatrix(row) {
  const caps = {}
  for (const key of Object.keys(row)) {
    const m = String(key).match(/^0*(\d{1,2})档$/)
    if (m) {
      const tier = parseInt(m[1], 10)
      if (tier >= 1 && tier <= 30) {
        const v = row[key]
        const n = v === '' || v == null ? 0 : Number(v)
        if (Number.isFinite(n) && n > 0) caps[tier] = n
      }
    }
  }
  return caps
}

function mapProductsFromSheets(sheets) {
  // 主数据表：含「商品名称」和档位列的表
  const sheetName =
    Object.keys(sheets).find((name) => {
      const first = sheets[name][0]
      return first && Object.keys(first).some((k) => /^0*\d{1,2}档$/.test(k))
    }) || Object.keys(sheets)[0]

  const rows = sheets[sheetName]
  console.log('[ExcelParser] 货源表字段名:', Object.keys(rows[0] || {}))

  const products = rows
    .map((row, index) => {
      const productName = findField(row, [
        '商品名称',
        '品牌名称',
        '货源名称',
        '名称',
        'product_name',
        '品牌'
      ])
      const mode = findField(row, ['投放模式', '投放方式', 'mode'])
      const seg = findField(row, ['价位段', 'seg', '段位']) || null
      const costPrice = parseFloat(
        findField(row, ['进货价(元/条)', '进货价', '成本价', '进价', 'cost_price', '批发价']) || 0
      )
      const sellPrice = parseFloat(
        findField(row, ['零售价(元/条·估算待核实)', '零售价', '售价', 'sell_price', '建议零售价']) || 0
      )
      const caps = extractCapsMatrix(row)

      return {
        product_code: `P${String(index + 1).padStart(5, '0')}`,
        product_name: productName,
        mode: mode || null,
        seg: seg || null,
        cost_price: costPrice,
        sell_price: sellPrice,
        caps,
        unit: '条',
        notes: null
      }
    })
    .filter((p) => p.product_name && p.product_name !== '商品名称' && p.cost_price > 0)

  console.log(`[ExcelParser] 解析货源信息: ${products.length} 条`)
  if (products.length > 0) console.log('[ExcelParser] 货源示例:', products[0])
  return products
}

/**
 * 解析段位总量上限表
 * 优先从名为「段位总量」的 sheet 读；否则返回空数组
 * 格式：每行 { 段位, 30档, 29档, ... }
 */
function mapSegCapsFromSheets(sheets) {
  const sheetName = Object.keys(sheets).find((n) => /段位|总量/.test(n))
  if (!sheetName) return []

  const rows = sheets[sheetName]
  const segCaps = []
  for (const row of rows) {
    const seg = findField(row, ['段位', 'seg', '价位段'])
    if (!seg) continue
    for (const key of Object.keys(row)) {
      const m = String(key).match(/^0*(\d{1,2})档$/)
      if (m) {
        const tier = parseInt(m[1], 10)
        const v = row[key]
        const cap = v === '' || v == null ? 0 : Number(v)
        if (Number.isFinite(cap) && cap > 0) segCaps.push({ seg, tier, cap })
      }
    }
  }
  console.log(`[ExcelParser] 解析段位总量上限: ${segCaps.length} 条`)
  return segCaps
}

/**
 * @returns {{ products: Array, segCaps: Array }}
 */
export function parseProductSheet(buffer) {
  const { sheets } = parseExcelFromBuffer(buffer)
  return {
    products: mapProductsFromSheets(sheets),
    segCaps: mapSegCapsFromSheets(sheets)
  }
}

function mapChangesFromSheets(sheets, sheetNames) {
  console.log('[ExcelParser] ===== 信息更变表调试 =====')
  console.log('[ExcelParser] Sheet 数量:', sheetNames.length)
  console.log('[ExcelParser] Sheet 名称:', sheetNames)

  const changes = []

  for (const sheetName of sheetNames) {
    const rows = sheets[sheetName]
    console.log(`[ExcelParser] 处理 Sheet: "${sheetName}", 行数: ${rows.length}`)

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const allValues = Object.values(row)
      const firstValue = allValues[0]
      const nonEmptyValues = allValues.filter((v) => v && v.trim && v.trim() !== '')

      if (nonEmptyValues.length === 1 && (firstValue === '删除' || firstValue === '增加')) {
        console.log(`[ExcelParser] Sheet "${sheetName}" 第 ${i + 1} 行 - 发现分组标题: "${firstValue}"`)
        continue
      }

      const sequence = findField(row, ['序号', '类型'])
      const licenseNo = findField(row, ['许可证号', '零售户许可证号', '许可证', 'license_no', 'license'])

      if (!licenseNo || sequence === '序号' || sequence === '类型' || sequence === '零售户许可证号') {
        if (sequence || licenseNo) {
          console.log(`[ExcelParser] Sheet "${sheetName}" 第 ${i + 1} 行 - 跳过表头或空行`)
        }
        continue
      }

      console.log(
        `[ExcelParser] Sheet "${sheetName}" 第 ${i + 1} 行 - 处理更变行 - 序号: "${sequence}", 许可证号: "${licenseNo}"`
      )

      if (sequence === '删除' || sequence === '删' || sequence === 'delete' || sheetName === '删除') {
        changes.push({
          license_no: licenseNo,
          change_type: '删除',
          merchant_data: null
        })
        console.log(`[ExcelParser] -> 识别为删除操作`)
      } else if (
        sequence === '新增' ||
        sequence === '增加' ||
        sequence === '添加' ||
        sequence === 'add' ||
        sheetName === '增加' ||
        sheetName === '新增'
      ) {
        const customerName = findField(row, ['客户名称', '零售户名称', '商户名称', '名称'])
        const tier = findField(row, ['档位', '客户档位', 'tier', '档位编码'])
        const creditLevel = findField(row, ['诚信等级', '信用等级', 'credit_level'])
        const address = findField(row, ['地址', 'address', '详细地址'])
        const contact = findField(row, ['联系方式', '电话', 'contact', '客户经理'])
        const budget = parseFloat(findField(row, ['预算', 'budget']) || 50000)

        changes.push({
          license_no: licenseNo,
          change_type: '新增',
          merchant_data: {
            license_no: licenseNo,
            customer_name: customerName,
            tier: tier,
            credit_level: creditLevel,
            address: address,
            contact: contact,
            budget: budget
          }
        })
        console.log(`[ExcelParser] -> 识别为新增操作: ${customerName}`)
      } else if (sequence) {
        const customerName = findField(row, ['客户名称', '零售户名称', '商户名称', '名称'])
        const tier = findField(row, ['档位', '客户档位', 'tier', '档位编码'])
        const creditLevel = findField(row, ['诚信等级', '信用等级', 'credit_level'])
        const address = findField(row, ['地址', 'address', '详细地址'])
        const contact = findField(row, ['联系方式', '电话', 'contact', '客户经理'])
        const budget = parseFloat(findField(row, ['预算', 'budget']) || 50000)

        changes.push({
          license_no: licenseNo,
          change_type: '更新',
          merchant_data: {
            license_no: licenseNo,
            customer_name: customerName,
            tier: tier,
            credit_level: creditLevel,
            address: address,
            contact: contact,
            budget: budget
          }
        })
        console.log(`[ExcelParser] -> 识别为更新操作: ${customerName}`)
      }
    }
  }

  console.log(`[ExcelParser] 解析信息更变: ${changes.length} 条`)
  console.log(`[ExcelParser] 更变类型统计:`, {
    删除: changes.filter((c) => c.change_type === '删除').length,
    新增: changes.filter((c) => c.change_type === '新增').length,
    更新: changes.filter((c) => c.change_type === '更新').length
  })
  return changes
}

export function parseChangeSheet(buffer) {
  const { sheets, sheetNames } = parseExcelFromBuffer(buffer)
  return mapChangesFromSheets(sheets, sheetNames)
}

/**
 * 解析货源投放策略文件（如：货源投放策略7.23.xls）
 * 格式：
 *   Sheet1 → 段位总量配额（段位 + 各档列）
 *   其他Sheet → 商品+档位配额（3行表头，第2行为字段名，档位列为32位零填充数字ID）
 *
 * @param {Buffer} buffer
 * @returns {{ productCaps: Array<{product_name, product_code, caps}>, segCaps: Array<{seg, tier, cap}> }}
 */
export function parseStrategySheet(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const { SheetNames } = workbook

  const productCapsMap = {}  // product_name -> { tier -> qty }
  const segCapsArr = []

  for (const sheetName of SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false })
    if (!rows.length) continue

    const firstRowVals = Object.values(rows[0])

    // ── Sheet1：段位总量配额 ─────────────────────────────────────────
    // 特征：第一行第0列值是"段位"
    if (String(firstRowVals[0] || '').trim() === '段位') {
      // 找档位列索引
      const tierColMap = {}
      firstRowVals.forEach((v, idx) => {
        const m = String(v || '').match(/^0*(\d{1,2})档$/)
        if (m) {
          const t = parseInt(m[1], 10)
          if (t >= 1 && t <= 30) tierColMap[idx] = t
        }
      })

      for (let i = 1; i < rows.length; i++) {
        const vals = Object.values(rows[i])
        const seg = String(vals[0] || '').trim()
        if (!seg || !seg.includes('段')) continue

        for (const [idxStr, tier] of Object.entries(tierColMap)) {
          const v = vals[parseInt(idxStr)]
          const cap = v === '' || v == null ? 0 : Number(v)
          if (Number.isFinite(cap) && cap > 0) {
            segCapsArr.push({ seg, tier, cap })
          }
        }
      }

      console.log(`[ExcelParser] 策略Sheet "${sheetName}" 解析段位配额: ${segCapsArr.length} 条`)
      continue
    }

    // ── 产品Sheet：3行表头结构 ───────────────────────────────────────
    // rows[0] 元数据、rows[1] 字段名（档位列为32位零填充ID）、rows[2] 中文档名、rows[3+] 数据
    if (rows.length < 4) continue

    const headerRow = Object.values(rows[1])
    const nameIdx = headerRow.findIndex(v => String(v || '').trim() === '商品名称')
    const codeIdx = headerRow.findIndex(v => String(v || '').trim() === '商品编码')

    if (nameIdx === -1) {
      console.log(`[ExcelParser] 策略Sheet "${sheetName}" 未找到"商品名称"列，跳过`)
      continue
    }

    // 档位列：列值格式为 "00000000000000000000000000000030"（32位零填充十进制档位编号）
    const tierColMap = {}
    headerRow.forEach((v, idx) => {
      const s = String(v || '')
      // 32位零填充整数
      if (/^0+\d+$/.test(s) && s.length >= 10) {
        const t = parseInt(s, 10)
        if (t >= 1 && t <= 30) tierColMap[idx] = t
      }
    })

    if (Object.keys(tierColMap).length === 0) {
      console.log(`[ExcelParser] 策略Sheet "${sheetName}" 未找到档位列，跳过`)
      continue
    }

    let sheetCount = 0
    for (let i = 3; i < rows.length; i++) {  // 跳过前3行表头
      const vals = Object.values(rows[i])
      const productName = String(vals[nameIdx] || '').trim()
      const productCode = codeIdx !== -1 ? String(vals[codeIdx] || '').trim() : ''
      if (!productName) continue

      const caps = {}
      for (const [idxStr, tier] of Object.entries(tierColMap)) {
        const v = vals[parseInt(idxStr)]
        const qty = v === '' || v == null ? 0 : Number(v)
        if (Number.isFinite(qty) && qty > 0) caps[tier] = qty
      }

      if (Object.keys(caps).length > 0) {
        if (!productCapsMap[productName]) {
          productCapsMap[productName] = { product_name: productName, product_code: productCode, caps: {} }
        }
        // 合并同名商品在不同sheet里的档位数据
        Object.assign(productCapsMap[productName].caps, caps)
        sheetCount++
      }
    }

    console.log(`[ExcelParser] 策略Sheet "${sheetName}" 解析商品配额: ${sheetCount} 条`)
  }

  const productCaps = Object.values(productCapsMap)
  console.log(`[ExcelParser] 策略文件合计商品: ${productCaps.length} 种, 段位配额: ${segCapsArr.length} 条`)

  return { productCaps, segCaps: segCapsArr }
}

function findField(row, possibleNames) {
  for (const name of possibleNames) {
    if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
      return String(row[name]).trim()
    }

    const normalizedName = name.toLowerCase().replace(/\s/g, '')
    for (const key of Object.keys(row)) {
      const normalizedKey = key.toLowerCase().replace(/\s/g, '')
      if (normalizedKey === normalizedName) {
        const value = row[key]
        if (value !== undefined && value !== null && value !== '') {
          return String(value).trim()
        }
      }
    }
  }

  return null
}
