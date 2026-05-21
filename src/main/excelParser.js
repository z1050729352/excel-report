/**
 * Excel 解析模块
 * 解析商户信息表、货源表、信息更变表
 */

import XLSX from 'xlsx'
import { readFileSync } from 'fs'

/**
 * 解析 Excel 文件
 * @param {string} filePath - 文件路径
 * @returns {Object} { sheetNames, sheets }
 */
export function parseExcel(filePath) {
  try {
    const buffer = readFileSync(filePath)
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
    
    const result = {
      sheetNames: workbook.SheetNames,
      sheets: {}
    }
    
    // 解析所有 sheet
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false })
      
      // 检测是否是特殊格式（第一行的值是真正的表头）
      if (data.length > 0) {
        const firstRow = data[0]
        const keys = Object.keys(firstRow)
        
        // 如果字段名都是 "表格数据"、"表格数据_1" 或者空字符串、"_1"、"_2" 这种格式
        const isSpecialFormat = keys.length > 0 && (
          keys[0].includes('表格数据') || 
          keys[0] === '' || 
          keys[0].startsWith('_') ||
          keys.filter(k => k === '' || k.startsWith('_') || k.startsWith('__EMPTY')).length > keys.length / 2
        )
        
        if (isSpecialFormat) {
          console.log('[ExcelParser] 检测到特殊格式，第一行是表头')
          
          // 第一行的值作为新的表头
          const newHeaders = Object.values(firstRow)
          
          // 从第二行开始是真正的数据
          const newData = data.slice(1).map(row => {
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

/**
 * 解析商户信息表
 * 预期字段：许可证号、客户名称、档位、诚信等级、地址、联系方式、预算
 */
export function parseMerchantSheet(filePath) {
  const { sheets } = parseExcel(filePath)
  const sheetName = Object.keys(sheets)[0] // 使用第一个 sheet
  const rows = sheets[sheetName]
  
  console.log('[ExcelParser] 商户信息表原始数据示例:', rows[0])
  console.log('[ExcelParser] 商户信息表字段名:', Object.keys(rows[0] || {}))
  
  const merchants = rows.map(row => {
    // 智能匹配字段名（支持中英文、不同写法）
    const licenseNo = findField(row, ['许可证号', '零售户许可证号', '许可证', 'license_no', 'license', '证号'])
    const customerName = findField(row, ['客户名称', '零售户名称', '商户名称', '名称', 'customer_name', 'name'])
    const tier = findField(row, ['档位', '客户档位', 'tier', '等级'])
    const creditLevel = findField(row, ['诚信等级', '信用等级', 'credit_level', 'credit'])
    const address = findField(row, ['地址', 'address', '详细地址'])
    const contact = findField(row, ['联系方式', '电话', 'contact', 'phone', '手机', '客户经理'])
    const budget = parseFloat(findField(row, ['预算', 'budget', '资金']) || 50000) // 默认 5 万预算
    
    return {
      license_no: licenseNo,
      customer_name: customerName,
      tier: tier,
      credit_level: creditLevel,
      address: address,
      contact: contact,
      budget: budget,
      notes: null
    }
  }).filter(m => m.license_no) // 过滤掉没有许可证号的行
  
  console.log(`[ExcelParser] 解析商户信息: ${merchants.length} 条`)
  return merchants
}

/**
 * 解析货源表
 * 预期字段：货源编号、品牌名称、档位要求、成本价、售价、分类
 */
export function parseProductSheet(filePath) {
  const { sheets } = parseExcel(filePath)
  const sheetName = Object.keys(sheets)[0]
  const rows = sheets[sheetName]
  
  console.log('[ExcelParser] 货源表原始数据示例:', rows[0])
  console.log('[ExcelParser] 货源表字段名:', Object.keys(rows[0] || {}))
  
  const products = rows.map((row, index) => {
    // 尝试多种字段名
    const productCode = findField(row, ['序号', '货源编号', '编号', 'product_code', 'code', '代码', '品牌代码', '卷烟代码'])
    const productName = findField(row, ['商品名称', '品牌名称', '货源名称', '名称', 'product_name', 'name', '品牌', '卷烟品牌'])
    const tierRequired = findField(row, ['档位要求', '档位', 'tier_required', 'tier', '要求档位', '投放档位'])
    const isDistribute = findField(row, ['是否投放', '投放'])
    const distributeMethod = findField(row, ['投放方式'])
    
    // 价格字段（可能没有）
    const costPrice = parseFloat(findField(row, ['成本价', '进价', 'cost_price', 'cost', '批发价']) || 0)
    const sellPrice = parseFloat(findField(row, ['售价', '零售价', 'sell_price', 'price', '建议零售价']) || 0)
    const category = findField(row, ['分类', 'category', '类别', '品类'])
    const unit = findField(row, ['单位', 'unit']) || '条'
    
    // 如果没有价格，根据品牌名称估算（简化逻辑）
    let estimatedCost = costPrice
    let estimatedSell = sellPrice
    
    if (productName && estimatedCost === 0 && estimatedSell === 0) {
      // 简单的价格估算逻辑（根据品牌）
      if (productName.includes('中华')) {
        estimatedCost = 500
        estimatedSell = 550
      } else if (productName.includes('南京') || productName.includes('利群')) {
        estimatedCost = 200
        estimatedSell = 220
      } else if (productName.includes('黄金叶') || productName.includes('黄鹤楼')) {
        estimatedCost = 150
        estimatedSell = 165
      } else if (productName.includes('芙蓉王')) {
        estimatedCost = 300
        estimatedSell = 330
      } else {
        // 默认价格
        estimatedCost = 100
        estimatedSell = 110
      }
    }
    
    return {
      product_code: productCode || `P${index + 1}`, // 如果没有编号，用序号
      product_name: productName,
      tier_required: tierRequired,
      cost_price: estimatedCost,
      sell_price: estimatedSell,
      category: category || distributeMethod,
      unit: unit,
      notes: isDistribute === '否' ? '不投放' : null
    }
  }).filter(p => p.product_name && p.product_name !== '商品名称') // 过滤掉表头行和空行
  
  console.log(`[ExcelParser] 解析货源信息: ${products.length} 条`)
  if (products.length > 0) {
    console.log('[ExcelParser] 货源示例:', products[0])
  }
  return products
}

/**
 * 解析信息更变表
 * 这个表包含需要新增或删除的商户完整信息
 */
export function parseChangeSheet(filePath) {
  const { sheets, sheetNames } = parseExcel(filePath)
  
  console.log('[ExcelParser] ===== 信息更变表调试 =====')
  console.log('[ExcelParser] Sheet 数量:', sheetNames.length)
  console.log('[ExcelParser] Sheet 名称:', sheetNames)
  
  const changes = []
  
  // 遍历所有 Sheet
  for (const sheetName of sheetNames) {
    const rows = sheets[sheetName]
    console.log(`[ExcelParser] 处理 Sheet: "${sheetName}", 行数: ${rows.length}`)
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      
      // 获取所有字段的值
      const allValues = Object.values(row)
      
      // 检查是否是标题行（只有一个值，且是"删除"或"增加"）
      const firstValue = allValues[0]
      const nonEmptyValues = allValues.filter(v => v && v.trim && v.trim() !== '')
      
      if (nonEmptyValues.length === 1 && (firstValue === '删除' || firstValue === '增加')) {
        console.log(`[ExcelParser] Sheet "${sheetName}" 第 ${i + 1} 行 - 发现分组标题: "${firstValue}"`)
        continue
      }
      
      // 尝试获取序号和许可证号
      const sequence = findField(row, ['序号', '类型'])
      const licenseNo = findField(row, ['许可证号', '零售户许可证号', '许可证', 'license_no', 'license'])
      
      // 跳过表头行、空行
      if (!licenseNo || sequence === '序号' || sequence === '类型' || sequence === '零售户许可证号') {
        if (sequence || licenseNo) {
          console.log(`[ExcelParser] Sheet "${sheetName}" 第 ${i + 1} 行 - 跳过表头或空行`)
        }
        continue
      }
      
      console.log(`[ExcelParser] Sheet "${sheetName}" 第 ${i + 1} 行 - 处理更变行 - 序号: "${sequence}", 许可证号: "${licenseNo}"`)
      
      // 删除操作（支持多种写法）
      if (sequence === '删除' || sequence === '删' || sequence === 'delete' || sheetName === '删除') {
        changes.push({
          license_no: licenseNo,
          change_type: '删除',
          merchant_data: null
        })
        console.log(`[ExcelParser] -> 识别为删除操作`)
      } 
      // 新增操作（支持多种写法：新增、增加、添加、add）
      else if (sequence === '新增' || sequence === '增加' || sequence === '添加' || sequence === 'add' || sheetName === '增加' || sheetName === '新增') {
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
      } 
      // 其他情况（序号是数字等）- 更新操作
      else if (sequence) {
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
    删除: changes.filter(c => c.change_type === '删除').length,
    新增: changes.filter(c => c.change_type === '新增').length,
    更新: changes.filter(c => c.change_type === '更新').length
  })
  return changes
}

/**
 * 智能查找字段值（支持多种字段名）
 */
function findField(row, possibleNames) {
  for (const name of possibleNames) {
    // 精确匹配
    if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
      return String(row[name]).trim()
    }
    
    // 模糊匹配（忽略大小写、空格）
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

/**
 * 预览 Excel 文件（返回前 10 行）
 */
export function previewExcel(filePath) {
  try {
    const { sheetNames, sheets } = parseExcel(filePath)
    const preview = {}
    
    for (const sheetName of sheetNames) {
      preview[sheetName] = sheets[sheetName].slice(0, 10)
    }
    
    return {
      success: true,
      sheetNames,
      preview
    }
  } catch (err) {
    return {
      success: false,
      error: err.message
    }
  }
}
