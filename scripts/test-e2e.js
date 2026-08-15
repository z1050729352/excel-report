/**
 * 端到端验证：解析价格表 → 入库 → 按档位查询 → 优化
 * 运行：node --experimental-default-type=module scripts/test-e2e.js
 */
import { readFileSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import {
  initDatabase, clearAllData, insertProducts, insertSegCaps,
  getProductsByTier, getSegCapsByTier, optimizeOrder, normalizeTier, closeDatabase
} from '../src/core/index.js'
import { parseProductSheetFromBuffer } from '../src/core/excelParser.js'

const testDb = join(process.cwd(), 'data', 'test-e2e.db')
if (existsSync(testDb)) rmSync(testDb, { force: true })

initDatabase({ dbPath: testDb })
clearAllData()

// 1. 解析价格表
const buffer = readFileSync('src/烟草进价零售价毛利表.xlsx')
const { products, segCaps } = parseProductSheetFromBuffer(buffer)
console.log(`解析: 货源 ${products.length} 条, 段位总量 ${segCaps.length} 条`)

// 2. 入库
insertProducts(products)
insertSegCaps(segCaps)

// 3. 按档位查询 + 优化（多个场景）
for (const [tier, budget] of [['三十档', 50000], ['八档', 20000], [30, 3000]]) {
  const tInt = normalizeTier(tier)
  const prods = getProductsByTier(tier)
  const sc = getSegCapsByTier(tInt)
  const plan = optimizeOrder(prods, budget, tier, sc)
  console.log(`\n档位=${tier}(${tInt}) 预算=${budget}`)
  console.log(`  可订池:${prods.length} 段位上限:${JSON.stringify(sc)}`)
  console.log(`  入选:${plan.items.length} 成本:${plan.totalCost} 利润:${plan.totalProfit} 利润率:${plan.marginRate}%`)
  console.log(`  前3:`, plan.items.slice(0, 3).map(p => `${p.product_name}×${p.quantity}`).join(', '))
}

closeDatabase()
rmSync(testDb, { force: true })
if (existsSync(testDb + '-wal')) rmSync(testDb + '-wal', { force: true })
if (existsSync(testDb + '-shm')) rmSync(testDb + '-shm', { force: true })
console.log('\n✓ 测试完成，已清理测试库')
