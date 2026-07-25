/**
 * 数据库模块 - SQLite
 * 管理商户信息、货源、信息更变
 */

import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { existsSync, mkdirSync } from 'fs'

let db = null

/**
 * 初始化数据库
 * @param {{ dbPath?: string, dbDir?: string }} [options]
 */
export function initDatabase(options = {}) {
  let dbPath = options.dbPath

  if (!dbPath) {
    const dbDir = options.dbDir || join(process.cwd(), 'data')
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true })
    }
    dbPath = join(dbDir, 'tobacco.db')
  } else {
    const dir = dirname(dbPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }

  console.log('[Database] 数据库路径:', dbPath)

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  createTables()

  return db
}

/**
 * 创建数据库表
 */
function createTables() {
  // 商户信息表
  db.exec(`
    CREATE TABLE IF NOT EXISTS merchants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_no TEXT UNIQUE NOT NULL,
      customer_name TEXT,
      tier TEXT,
      credit_level TEXT,
      address TEXT,
      contact TEXT,
      budget REAL DEFAULT 0,
      status TEXT DEFAULT '正常',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
  
  // 货源表
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_code TEXT UNIQUE NOT NULL,
      product_name TEXT NOT NULL,
      tier_required TEXT,
      cost_price REAL DEFAULT 0,
      sell_price REAL DEFAULT 0,
      profit REAL DEFAULT 0,
      category TEXT,
      unit TEXT DEFAULT '条',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
  
  // 信息更变表（存储完整的商户信息）
  db.exec(`
    CREATE TABLE IF NOT EXISTS changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_no TEXT NOT NULL,
      change_type TEXT NOT NULL,
      merchant_data TEXT,
      applied BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
  
  console.log('[Database] 数据表创建完成')
}

/**
 * 获取数据库实例
 */
export function getDatabase() {
  if (!db) {
    throw new Error('数据库未初始化')
  }
  return db
}

/**
 * 清空所有数据（重新导入时使用）
 */
export function clearAllData() {
  db.exec('DELETE FROM merchants')
  db.exec('DELETE FROM products')
  db.exec('DELETE FROM changes')
  console.log('[Database] 所有数据已清空')
}

/**
 * 批量插入商户信息
 */
export function insertMerchants(merchants) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO merchants 
    (license_no, customer_name, tier, credit_level, address, contact, budget, notes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `)
  
  const insertMany = db.transaction((items) => {
    for (const item of items) {
      stmt.run(
        item.license_no,
        item.customer_name,
        item.tier,
        item.credit_level,
        item.address,
        item.contact,
        item.budget || 0,
        item.notes
      )
    }
  })
  
  insertMany(merchants)
  console.log(`[Database] 插入 ${merchants.length} 条商户信息`)
}

/**
 * 批量插入货源信息
 */
export function insertProducts(products) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO products 
    (product_code, product_name, tier_required, cost_price, sell_price, profit, category, unit, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  
  const insertMany = db.transaction((items) => {
    for (const item of items) {
      const profit = (item.sell_price || 0) - (item.cost_price || 0)
      stmt.run(
        item.product_code,
        item.product_name,
        item.tier_required,
        item.cost_price || 0,
        item.sell_price || 0,
        profit,
        item.category,
        item.unit || '条',
        item.notes
      )
    }
  })
  
  insertMany(products)
  console.log(`[Database] 插入 ${products.length} 条货源信息`)
}

/**
 * 批量插入信息更变
 */
export function insertChanges(changes) {
  const stmt = db.prepare(`
    INSERT INTO changes 
    (license_no, change_type, merchant_data, applied)
    VALUES (?, ?, ?, 0)
  `)
  
  const insertMany = db.transaction((items) => {
    for (const item of items) {
      // 将商户数据序列化为 JSON
      const merchantDataJson = item.merchant_data ? JSON.stringify(item.merchant_data) : null
      stmt.run(
        item.license_no,
        item.change_type,
        merchantDataJson
      )
    }
  })
  
  insertMany(changes)
  console.log(`[Database] 插入 ${changes.length} 条信息更变`)
}

/**
 * 应用信息更变到商户表
 */
export function applyChanges() {
  // 获取未应用的更变
  const changes = db.prepare('SELECT * FROM changes WHERE applied = 0 ORDER BY created_at').all()
  
  if (changes.length === 0) {
    console.log('[Database] 没有待应用的更变')
    return 0
  }
  
  console.log(`[Database] 准备应用 ${changes.length} 条更变`)
  
  // 统计更变类型
  const stats = {
    删除: changes.filter(c => c.change_type === '删除').length,
    新增: changes.filter(c => c.change_type === '新增').length,
    更新: changes.filter(c => c.change_type === '更新').length
  }
  console.log('[Database] 更变类型统计:', stats)
  
  // 应用前的商户数量
  const beforeCount = db.prepare('SELECT COUNT(*) as count FROM merchants').get().count
  console.log(`[Database] 应用前商户数量: ${beforeCount}`)
  
  const markAppliedStmt = db.prepare('UPDATE changes SET applied = 1 WHERE id = ?')
  const deleteStmt = db.prepare('DELETE FROM merchants WHERE license_no = ?')
  
  const applyAll = db.transaction(() => {
    let count = 0
    for (const change of changes) {
      try {
        const merchantData = change.merchant_data ? JSON.parse(change.merchant_data) : null
        
        if (change.change_type === '删除') {
          // 删除商户
          const result = deleteStmt.run(change.license_no)
          if (result.changes > 0) {
            console.log(`[Database] ✓ 删除商户: ${change.license_no}`)
            count++
          } else {
            console.warn(`[Database] ✗ 未找到要删除的商户: ${change.license_no}`)
          }
        } else if (change.change_type === '新增') {
          // 新增商户
          if (!merchantData) {
            console.warn(`[Database] ✗ 新增商户缺少数据: ${change.license_no}`)
            markAppliedStmt.run(change.id)
            continue
          }
          
          // 先检查商户是否已存在
          const exists = db.prepare('SELECT customer_name FROM merchants WHERE license_no = ?').get(change.license_no)
          if (exists) {
            console.log(`[Database] ⚠ 商户已存在，跳过新增: ${change.license_no} - ${exists.customer_name}`)
            markAppliedStmt.run(change.id)
            continue
          }
          
          const insertStmt = db.prepare(`
            INSERT INTO merchants 
            (license_no, customer_name, tier, credit_level, address, contact, budget, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `)
          const result = insertStmt.run(
            merchantData.license_no,
            merchantData.customer_name || '',
            merchantData.tier || '',
            merchantData.credit_level || '',
            merchantData.address || '',
            merchantData.contact || '',
            merchantData.budget || 50000,
            '正常'
          )
          if (result.changes > 0) {
            console.log(`[Database] ✓ 新增商户: ${change.license_no} - ${merchantData.customer_name}`)
            count++
          }
        } else {
          // 更新商户（只更新更变表里有的字段）
          if (!merchantData) {
            console.warn(`[Database] ✗ 更新商户缺少数据: ${change.license_no}`)
            markAppliedStmt.run(change.id)
            continue
          }
          
          // 检查商户是否存在
          const exists = db.prepare('SELECT customer_name FROM merchants WHERE license_no = ?').get(change.license_no)
          if (!exists) {
            console.warn(`[Database] ✗ 商户不存在，无法更新: ${change.license_no}`)
            markAppliedStmt.run(change.id)
            continue
          }
          
          // 动态构建 UPDATE 语句（只更新有值的字段）
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
            const result = db.prepare(sql).run(...updateValues)
            
            if (result.changes > 0) {
              console.log(`[Database] ✓ 更新商户: ${change.license_no} - ${exists.customer_name} (${updateFields.length - 1} 个字段)`)
              count++
            }
          }
        }
        
        // 标记为已应用
        markAppliedStmt.run(change.id)
      } catch (err) {
        console.error(`[Database] ✗ 应用更变失败:`, change, err.message)
      }
    }
    return count
  })
  
  const applied = applyAll()
  
  // 应用后的商户数量
  const afterCount = db.prepare('SELECT COUNT(*) as count FROM merchants').get().count
  console.log(`[Database] 应用后商户数量: ${afterCount} (变化: ${afterCount - beforeCount})`)
  console.log(`[Database] 成功应用 ${applied} 条更变`)
  
  return applied
}

/**
 * 根据许可证号查询商户信息
 */
export function getMerchantByLicense(licenseNo) {
  const merchant = db.prepare('SELECT * FROM merchants WHERE license_no = ?').get(licenseNo)
  return merchant || null
}

/**
 * 根据档位查询可用货源
 */
export function getProductsByTier(tier) {
  // 简单逻辑：档位匹配或不限档位
  const products = db.prepare(`
    SELECT * FROM products 
    WHERE tier_required = ? OR tier_required IS NULL OR tier_required = ''
    ORDER BY profit DESC
  `).all(tier)
  
  return products
}

/**
 * 获取所有商户（用于列表展示）
 */
export function getAllMerchants() {
  return db.prepare('SELECT * FROM merchants ORDER BY updated_at DESC').all()
}

/**
 * 获取统计信息
 */
export function getStats() {
  const merchantCount = db.prepare('SELECT COUNT(*) as count FROM merchants').get().count
  const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get().count
  const changeCount = db.prepare('SELECT COUNT(*) as count FROM changes WHERE applied = 0').get().count
  
  return {
    merchantCount,
    productCount,
    pendingChangeCount: changeCount
  }
}

/**
 * 关闭数据库
 */
export function closeDatabase() {
  if (db) {
    db.close()
    db = null
    console.log('[Database] 数据库已关闭')
  }
}
