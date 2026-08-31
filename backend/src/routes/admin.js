import express from 'express'
import { query, execute, transaction } from '../models/db.js'
import { authMiddleware } from '../middleware/auth.js'
import { upload, handleUploadError } from '../middleware/upload.js'
import { parseMerchantSheet, parseProductSheet, parseChangeSheet, parseStrategySheet, parseSalesSheet } from '../services/excelParser.js'
import { normalizeTier } from '../services/tierUtils.js'

const router = express.Router()

// 所有管理员接口都需要登录
router.use(authMiddleware)

/**
 * GET /api/admin/stats
 * 获取统计数据
 */
router.get('/stats', async (req, res) => {
  try {
    const merchantCount = await query('SELECT COUNT(*) as count FROM merchants')
    const productCount = await query('SELECT COUNT(*) as count FROM products')
    const changeCount = await query('SELECT COUNT(*) as count FROM changes WHERE applied = 0')
    
    res.json({
      success: true,
      stats: {
        merchantCount: merchantCount[0].count,
        productCount: productCount[0].count,
        pendingChangeCount: changeCount[0].count
      }
    })
  } catch (err) {
    console.error('[Admin] 获取统计数据失败:', err)
    res.status(500).json({
      success: false,
      error: '获取统计数据失败'
    })
  }
})

/**
 * GET /api/admin/merchants
 * 商户列表（分页+搜索）
 */
router.get('/merchants', async (req, res) => {
  try {
    const { page = 1, pageSize = 10, keyword = '', level = '' } = req.query
    
    const offset = (parseInt(page) - 1) * parseInt(pageSize)
    const limit = parseInt(pageSize)
    
    // 构建查询条件
    let whereClauses = []
    let params = []
    
    if (keyword) {
      whereClauses.push('(customer_name LIKE ? OR license_no LIKE ?)')
      params.push(`%${keyword}%`, `%${keyword}%`)
    }
    
    if (level) {
      whereClauses.push('credit_level = ?')
      params.push(level)
    }
    
    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''
    
    // 查询总数
    const countSQL = `SELECT COUNT(*) as total FROM merchants ${whereSQL}`
    const totalResult = await query(countSQL, params)
    const total = totalResult[0].total
    
    // 查询数据
    const dataSQL = `
      SELECT * FROM merchants 
      ${whereSQL}
      ORDER BY created_at DESC 
      LIMIT ${limit} OFFSET ${offset}
    `
    const merchants = await query(dataSQL, params)
    
    res.json({
      success: true,
      data: merchants,
      pagination: {
        page: parseInt(page),
        pageSize: limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (err) {
    console.error('[Admin] 查询商户列表失败:', err)
    res.json({
      success: true,
      data: [],
      pagination: {
        page: 1,
        pageSize: parseInt(req.query.pageSize || 10),
        total: 0,
        totalPages: 0
      }
    })
  }
})

/**
 * GET /api/admin/products
 * 商品列表（分页+搜索）
 */
router.get('/products', async (req, res) => {
  try {
    const { page = 1, pageSize = 10, keyword = '', seg = '' } = req.query
    
    const offset = (parseInt(page) - 1) * parseInt(pageSize)
    const limit = parseInt(pageSize)
    
    // 构建查询条件
    let whereClauses = []
    let params = []
    
    if (keyword) {
      whereClauses.push('(product_name LIKE ? OR product_code LIKE ?)')
      params.push(`%${keyword}%`, `%${keyword}%`)
    }
    
    if (seg) {
      whereClauses.push('seg = ?')
      params.push(seg)
    }
    
    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''
    
    // 查询总数
    const countSQL = `SELECT COUNT(*) as total FROM products ${whereSQL}`
    const totalResult = await query(countSQL, params)
    const total = totalResult[0].total
    
    // 查询数据
    const dataSQL = `
      SELECT * FROM products 
      ${whereSQL}
      ORDER BY product_code 
      LIMIT ${limit} OFFSET ${offset}
    `
    const products = await query(dataSQL, params)
    
    res.json({
      success: true,
      data: products,
      pagination: {
        page: parseInt(page),
        pageSize: limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (err) {
    console.error('[Admin] 查询商品列表失败:', err)
    res.json({
      success: true,
      data: [],
      pagination: {
        page: 1,
        pageSize: parseInt(req.query.pageSize || 10),
        total: 0,
        totalPages: 0
      }
    })
  }
})

/**
 * GET /api/admin/changes
 * 获取待应用更变列表
 */
router.get('/changes', async (req, res) => {
  try {
    const changes = await query(
      'SELECT * FROM changes WHERE applied = 0 ORDER BY created_at DESC'
    )
    
    // MySQL JSON 字段已自动解析，无需手动 JSON.parse
    const parsedChanges = changes.map(c => ({
      ...c,
      merchant_data: c.merchant_data || null
    }))
    
    res.json({
      success: true,
      changes: parsedChanges,
      count: parsedChanges.length
    })
  } catch (err) {
    console.error('[Admin] 获取更变列表失败:', err)
    res.status(500).json({
      success: false,
      error: '获取更变列表失败'
    })
  }
})

/**
 * GET /api/admin/changes
 * 获取待应用更变列表
 */
/**
 * POST /api/admin/import/merchants
 * 上传商户信息表（全量替换）
 */
router.post('/import/merchants', upload.single('file'), handleUploadError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '未上传文件'
      })
    }
    
    // 解析 Excel
    const merchants = parseMerchantSheet(req.file.buffer)
    
    if (merchants.length === 0) {
      return res.status(400).json({
        success: false,
        error: '未解析到有效的商户数据'
      })
    }
    
    // 使用事务：清空 + 插入
    await transaction(async (conn) => {
      await conn.execute('DELETE FROM merchants')
      
      const insertSQL = `
        INSERT INTO merchants 
        (license_no, customer_name, company, legal_person, customer_status, contact,
         district, market_dept, sales_line, address, business_scope, shop_name,
         market_type, market_type_sub, business_type, business_scale, business_circle,
         order_cycle, order_day, order_method, payment_method, online_payment,
         credit_level, tier_code, tier, join_date, terminal_level, terminal_type,
         terminal_type_sub, cigar_tier, cigar_terminal_type, sample_type,
         budget, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      
      for (const m of merchants) {
        await conn.execute(insertSQL, [
          m.license_no, m.customer_name, m.company || null, m.legal_person || null,
          m.customer_status || null, m.contact || null,
          m.district || null, m.market_dept || null, m.sales_line || null,
          m.address || null, m.business_scope || null, m.shop_name || null,
          m.market_type || null, m.market_type_sub || null, m.business_type || null,
          m.business_scale || null, m.business_circle || null,
          m.order_cycle || null, m.order_day || null, m.order_method || null,
          m.payment_method || null, m.online_payment || null,
          m.credit_level || null, m.tier_code || null, m.tier || null,
          m.join_date || null, m.terminal_level || null, m.terminal_type || null,
          m.terminal_type_sub || null, m.cigar_tier || null,
          m.cigar_terminal_type || null, m.sample_type || null,
          m.budget || 50000, m.notes || null
        ])
      }
    })
    
    console.log(`[Admin] 成功导入商户信息: ${merchants.length} 条`)
    
    res.json({
      success: true,
      count: merchants.length,
      message: `成功导入 ${merchants.length} 条商户信息`
    })
  } catch (err) {
    console.error('[Admin] 导入商户信息失败:', err)
    res.status(500).json({
      success: false,
      error: `导入失败: ${err.message}`
    })
  }
})

/**
 * POST /api/admin/import/products
 * 上传货源表（全量替换）
 */
router.post('/import/products', upload.single('file'), handleUploadError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '未上传文件'
      })
    }
    
    // 解析 Excel
    const { products, segCaps } = parseProductSheet(req.file.buffer)
    
    if (products.length === 0) {
      return res.status(400).json({
        success: false,
        error: '未解析到有效的货源数据'
      })
    }
    
    // 使用事务：清空 + 插入
    await transaction(async (conn) => {
      await conn.execute('DELETE FROM products')
      await conn.execute('DELETE FROM seg_caps')
      
      const insertProductSQL = `
        INSERT INTO products 
        (product_code, product_name, mode, seg, cost_price, sell_price, profit, caps_json, unit, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      
      for (const p of products) {
        const profit = (p.sell_price || 0) - (p.cost_price || 0)
        await conn.execute(insertProductSQL, [
          p.product_code,
          p.product_name,
          p.mode,
          p.seg,
          p.cost_price,
          p.sell_price,
          profit,
          JSON.stringify(p.caps),
          p.unit,
          p.notes
        ])
      }
      
      // 插入段位总量上限
      if (segCaps.length > 0) {
        const insertSegCapSQL = 'INSERT INTO seg_caps (seg, tier, cap) VALUES (?, ?, ?)'
        for (const sc of segCaps) {
          await conn.execute(insertSegCapSQL, [sc.seg, sc.tier, sc.cap])
        }
      }
    })
    
    console.log(`[Admin] 成功导入货源: ${products.length} 条，段位配额: ${segCaps.length} 条`)
    
    res.json({
      success: true,
      count: products.length,
      segCapCount: segCaps.length,
      message: `成功导入 ${products.length} 条货源信息`
    })
  } catch (err) {
    console.error('[Admin] 导入货源失败:', err)
    res.status(500).json({
      success: false,
      error: `导入失败: ${err.message}`
    })
  }
})

/**
 * POST /api/admin/import/changes
 * 上传信息更变表
 */
router.post('/import/changes', upload.single('file'), handleUploadError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '未上传文件'
      })
    }
    
    // 解析 Excel
    const changes = parseChangeSheet(req.file.buffer)
    
    if (changes.length === 0) {
      return res.status(400).json({
        success: false,
        error: '未解析到有效的更变数据'
      })
    }
    
    // 插入更变记录
    const insertSQL = `
      INSERT INTO changes (license_no, change_type, merchant_data, applied)
      VALUES (?, ?, ?, 0)
    `
    
    for (const c of changes) {
      const merchantDataJson = c.merchant_data ? JSON.stringify(c.merchant_data) : null
      await execute(insertSQL, [c.license_no, c.change_type, merchantDataJson])
    }
    
    console.log(`[Admin] 成功导入信息更变: ${changes.length} 条`)
    
    res.json({
      success: true,
      count: changes.length,
      changes,
      message: `成功导入 ${changes.length} 条信息更变`
    })
  } catch (err) {
    console.error('[Admin] 导入信息更变失败:', err)
    res.status(500).json({
      success: false,
      error: `导入失败: ${err.message}`
    })
  }
})

/**
 * POST /api/admin/import/strategy
 * 上传货源投放策略（覆盖商品配额 + 段位总量上限，不改价格）
 * 若商品名称在 products 表中有匹配，则更新其 caps_json；
 * 若无匹配，跳过（价格数据以毛利表为准）。
 * 解析失败/格式错误时保留旧配额，返回警告。
 */
router.post('/import/strategy', upload.single('file'), handleUploadError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '未上传文件' })
    }

    const { productCaps, segCaps } = parseStrategySheet(req.file.buffer)

    if (productCaps.length === 0 && segCaps.length === 0) {
      return res.status(400).json({
        success: false,
        error: '未能从投放策略文件中解析到有效数据，请检查文件格式。当前配额保持不变。'
      })
    }

    // 查出所有产品
    const allProducts = await query('SELECT id, product_name FROM products')
    // 建立名称 → id 映射（忽略大小写、全半角空格）
    const nameMap = {}
    for (const p of allProducts) {
      nameMap[p.product_name.replace(/\s/g, '').toLowerCase()] = p.id
    }

    let updatedCount = 0
    let skippedCount = 0

    await transaction(async (conn) => {
      // 1. 按商品名更新 caps_json
      for (const pc of productCaps) {
        const key = pc.product_name.replace(/\s/g, '').toLowerCase()
        const productId = nameMap[key]
        if (!productId) {
          skippedCount++
          continue
        }
        await conn.execute(
          'UPDATE products SET caps_json = ? WHERE id = ?',
          [JSON.stringify(pc.caps), productId]
        )
        updatedCount++
      }

      // 2. 覆盖段位总量上限
      if (segCaps.length > 0) {
        await conn.execute('DELETE FROM seg_caps')
        const insertSegCapSQL = 'INSERT INTO seg_caps (seg, tier, cap) VALUES (?, ?, ?)'
        for (const sc of segCaps) {
          await conn.execute(insertSegCapSQL, [sc.seg, sc.tier, sc.cap])
        }
      }
    })

    console.log(`[Admin] 投放策略导入: 更新商品 ${updatedCount} 条，跳过 ${skippedCount} 条，段位配额 ${segCaps.length} 条`)

    res.json({
      success: true,
      updatedCount,
      skippedCount,
      segCapCount: segCaps.length,
      message: `投放策略导入成功：更新 ${updatedCount} 种商品配额，${skippedCount} 种商品在系统中不存在（已跳过），段位总量上限 ${segCaps.length} 条`
    })
  } catch (err) {
    console.error('[Admin] 导入投放策略失败:', err)
    res.status(500).json({
      success: false,
      error: `导入失败: ${err.message}`
    })
  }
})

/**
 * POST /api/admin/import/sales
 * 上传商户订货表（多指标销售汇总），按客户编码=许可证号关联到商户，
 * 更新其当月销量 / 含税销额 / 单箱值 / 销量月份。
 * 只更新已存在的商户，不新增商户。
 */
router.post('/import/sales', upload.single('file'), handleUploadError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '未上传文件' })
    }

    const { records, salesMonth } = parseSalesSheet(req.file.buffer)

    if (records.length === 0) {
      return res.status(400).json({
        success: false,
        error: '未解析到有效的销量数据，请检查文件格式'
      })
    }

    let updatedCount = 0
    let skippedCount = 0

    await transaction(async (conn) => {
      for (const r of records) {
        const [result] = await conn.execute(
          `UPDATE merchants
           SET monthly_sales = ?, sales_amount = ?, box_value = ?, sales_month = ?
           WHERE license_no = ?`,
          [r.monthly_sales, r.sales_amount, r.box_value, salesMonth, r.license_no]
        )
        if (result.affectedRows > 0) updatedCount++
        else skippedCount++
      }
    })

    console.log(`[Admin] 销量导入: 更新 ${updatedCount} 条，未匹配 ${skippedCount} 条，月份 ${salesMonth}`)

    res.json({
      success: true,
      updatedCount,
      skippedCount,
      salesMonth,
      total: records.length,
      message: `销量导入成功：更新 ${updatedCount} 个商户${skippedCount ? `，${skippedCount} 条未匹配到商户（已跳过）` : ''}${salesMonth ? `，数据月份 ${salesMonth}` : ''}`
    })
  } catch (err) {
    console.error('[Admin] 导入销量失败:', err)
    res.status(500).json({
      success: false,
      error: `导入失败: ${err.message}`
    })
  }
})

router.post('/changes/apply', async (req, res) => {
  try {
    const changes = await query(
      'SELECT * FROM changes WHERE applied = 0 ORDER BY created_at'
    )
    
    if (changes.length === 0) {
      return res.json({
        success: true,
        count: 0,
        message: '没有待应用的更变'
      })
    }
    
    let appliedCount = 0
    
    await transaction(async (conn) => {
      for (const change of changes) {
        // MySQL2 已自动解析 JSON 字段，兼容对象和字符串两种情况
        const merchantData = !change.merchant_data ? null
          : typeof change.merchant_data === 'string' ? JSON.parse(change.merchant_data)
          : change.merchant_data
        
        if (change.change_type === '删除') {
          const result = await conn.execute(
            'DELETE FROM merchants WHERE license_no = ?',
            [change.license_no]
          )
          if (result.affectedRows > 0) {
            appliedCount++
            console.log(`[Admin] 删除商户: ${change.license_no}`)
          }
        } else if (change.change_type === '新增') {
          if (!merchantData) continue
          
          // 检查是否已存在
          const [existing] = await conn.execute(
            'SELECT id FROM merchants WHERE license_no = ?',
            [change.license_no]
          )
          
          if (existing.length === 0) {
            await conn.execute(
              `INSERT INTO merchants 
              (license_no, customer_name, tier, credit_level, address, contact, budget, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                merchantData.license_no,
                merchantData.customer_name || '',
                merchantData.tier || '',
                merchantData.credit_level || '',
                merchantData.address || '',
                merchantData.contact || '',
                merchantData.budget || 50000,
                '正常'
              ]
            )
            appliedCount++
            console.log(`[Admin] 新增商户: ${change.license_no}`)
          }
        } else if (change.change_type === '更新') {
          if (!merchantData) continue
          
          // 动态构建更新语句
          const updateFields = []
          const updateValues = []
          
          if (merchantData.customer_name) {
            updateFields.push('customer_name = ?')
            updateValues.push(merchantData.customer_name)
          }
          if (merchantData.tier) {
            updateFields.push('tier = ?')
            updateValues.push(merchantData.tier)
          }
          if (merchantData.credit_level) {
            updateFields.push('credit_level = ?')
            updateValues.push(merchantData.credit_level)
          }
          if (merchantData.address) {
            updateFields.push('address = ?')
            updateValues.push(merchantData.address)
          }
          if (merchantData.contact) {
            updateFields.push('contact = ?')
            updateValues.push(merchantData.contact)
          }
          if (merchantData.budget !== undefined) {
            updateFields.push('budget = ?')
            updateValues.push(merchantData.budget)
          }
          
          if (updateFields.length > 0) {
            updateFields.push('updated_at = CURRENT_TIMESTAMP')
            updateValues.push(change.license_no)
            
            const sql = `UPDATE merchants SET ${updateFields.join(', ')} WHERE license_no = ?`
            const result = await conn.execute(sql, updateValues)
            
            if (result.affectedRows > 0) {
              appliedCount++
              console.log(`[Admin] 更新商户: ${change.license_no}`)
            }
          }
        }
        
        // 标记为已应用
        await conn.execute('UPDATE changes SET applied = 1 WHERE id = ?', [change.id])
      }
    })
    
    res.json({
      success: true,
      count: appliedCount,
      message: `成功应用 ${appliedCount} 条更变`
    })
  } catch (err) {
    console.error('[Admin] 应用更变失败:', err)
    res.status(500).json({
      success: false,
      error: `应用更变失败: ${err.message}`
    })
  }
})

/**
 * DELETE /api/admin/changes
 * 取消更变（清空未应用的更变）
 */
router.delete('/changes', async (req, res) => {
  try {
    const result = await execute('DELETE FROM changes WHERE applied = 0')
    
    res.json({
      success: true,
      count: result.affectedRows,
      message: `已清空 ${result.affectedRows} 条待应用更变`
    })
  } catch (err) {
    console.error('[Admin] 清空更变失败:', err)
    res.status(500).json({
      success: false,
      error: '清空更变失败'
    })
  }
})

export default router
