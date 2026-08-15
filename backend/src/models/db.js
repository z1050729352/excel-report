import mysql from 'mysql2/promise'
import config from '../config/index.js'

let pool = null

/**
 * 初始化数据库连接池
 */
export function initDB() {
  if (pool) return pool

  pool = mysql.createPool(config.db)
  
  console.log('[Database] MySQL连接池已创建')
  console.log(`[Database] 连接地址: ${config.db.host}:${config.db.port}`)
  console.log(`[Database] 数据库: ${config.db.database}`)
  
  // 测试连接
  pool.getConnection()
    .then(conn => {
      console.log('[Database] ✓ 数据库连接成功')
      conn.release()
    })
    .catch(err => {
      console.error('[Database] ✗ 数据库连接失败:', err.message)
      console.error('[Database] 请确保 MySQL 已启动: docker-compose up -d')
    })
  
  return pool
}

/**
 * 获取数据库连接池
 */
export function getDB() {
  if (!pool) {
    throw new Error('数据库未初始化，请先调用 initDB()')
  }
  return pool
}

/**
 * 执行查询
 */
export async function query(sql, params = []) {
  const db = getDB()
  const [rows] = await db.execute(sql, params)
  return rows
}

/**
 * 执行插入/更新/删除
 */
export async function execute(sql, params = []) {
  const db = getDB()
  const [result] = await db.execute(sql, params)
  return result
}

/**
 * 事务执行
 */
export async function transaction(callback) {
  const db = getDB()
  const connection = await db.getConnection()
  
  try {
    await connection.beginTransaction()
    const result = await callback(connection)
    await connection.commit()
    return result
  } catch (err) {
    await connection.rollback()
    throw err
  } finally {
    connection.release()
  }
}

/**
 * 关闭连接池
 */
export async function closeDB() {
  if (pool) {
    await pool.end()
    pool = null
    console.log('[Database] 数据库连接池已关闭')
  }
}
