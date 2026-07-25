"use strict";
const electron = require("electron");
const path = require("path");
const utils = require("@electron-toolkit/utils");
const Database = require("better-sqlite3");
const fs = require("fs");
const XLSX = require("xlsx");
const os = require("os");
const express = require("express");
const multer = require("multer");
let db = null;
function initDatabase(options = {}) {
  let dbPath = options.dbPath;
  if (!dbPath) {
    const dbDir = options.dbDir || path.join(process.cwd(), "data");
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    dbPath = path.join(dbDir, "tobacco.db");
  } else {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  console.log("[Database] 数据库路径:", dbPath);
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  createTables();
  return db;
}
function createTables() {
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
  `);
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
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_no TEXT NOT NULL,
      change_type TEXT NOT NULL,
      merchant_data TEXT,
      applied BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("[Database] 数据表创建完成");
}
function clearAllData() {
  db.exec("DELETE FROM merchants");
  db.exec("DELETE FROM products");
  db.exec("DELETE FROM changes");
  console.log("[Database] 所有数据已清空");
}
function insertMerchants(merchants) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO merchants 
    (license_no, customer_name, tier, credit_level, address, contact, budget, notes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
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
      );
    }
  });
  insertMany(merchants);
  console.log(`[Database] 插入 ${merchants.length} 条商户信息`);
}
function insertProducts(products) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO products 
    (product_code, product_name, tier_required, cost_price, sell_price, profit, category, unit, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction((items) => {
    for (const item of items) {
      const profit = (item.sell_price || 0) - (item.cost_price || 0);
      stmt.run(
        item.product_code,
        item.product_name,
        item.tier_required,
        item.cost_price || 0,
        item.sell_price || 0,
        profit,
        item.category,
        item.unit || "条",
        item.notes
      );
    }
  });
  insertMany(products);
  console.log(`[Database] 插入 ${products.length} 条货源信息`);
}
function insertChanges(changes) {
  const stmt = db.prepare(`
    INSERT INTO changes 
    (license_no, change_type, merchant_data, applied)
    VALUES (?, ?, ?, 0)
  `);
  const insertMany = db.transaction((items) => {
    for (const item of items) {
      const merchantDataJson = item.merchant_data ? JSON.stringify(item.merchant_data) : null;
      stmt.run(
        item.license_no,
        item.change_type,
        merchantDataJson
      );
    }
  });
  insertMany(changes);
  console.log(`[Database] 插入 ${changes.length} 条信息更变`);
}
function applyChanges() {
  const changes = db.prepare("SELECT * FROM changes WHERE applied = 0 ORDER BY created_at").all();
  if (changes.length === 0) {
    console.log("[Database] 没有待应用的更变");
    return 0;
  }
  console.log(`[Database] 准备应用 ${changes.length} 条更变`);
  const stats = {
    删除: changes.filter((c) => c.change_type === "删除").length,
    新增: changes.filter((c) => c.change_type === "新增").length,
    更新: changes.filter((c) => c.change_type === "更新").length
  };
  console.log("[Database] 更变类型统计:", stats);
  const beforeCount = db.prepare("SELECT COUNT(*) as count FROM merchants").get().count;
  console.log(`[Database] 应用前商户数量: ${beforeCount}`);
  const markAppliedStmt = db.prepare("UPDATE changes SET applied = 1 WHERE id = ?");
  const deleteStmt = db.prepare("DELETE FROM merchants WHERE license_no = ?");
  const applyAll = db.transaction(() => {
    let count = 0;
    for (const change of changes) {
      try {
        const merchantData = change.merchant_data ? JSON.parse(change.merchant_data) : null;
        if (change.change_type === "删除") {
          const result = deleteStmt.run(change.license_no);
          if (result.changes > 0) {
            console.log(`[Database] ✓ 删除商户: ${change.license_no}`);
            count++;
          } else {
            console.warn(`[Database] ✗ 未找到要删除的商户: ${change.license_no}`);
          }
        } else if (change.change_type === "新增") {
          if (!merchantData) {
            console.warn(`[Database] ✗ 新增商户缺少数据: ${change.license_no}`);
            markAppliedStmt.run(change.id);
            continue;
          }
          const exists = db.prepare("SELECT customer_name FROM merchants WHERE license_no = ?").get(change.license_no);
          if (exists) {
            console.log(`[Database] ⚠ 商户已存在，跳过新增: ${change.license_no} - ${exists.customer_name}`);
            markAppliedStmt.run(change.id);
            continue;
          }
          const insertStmt = db.prepare(`
            INSERT INTO merchants 
            (license_no, customer_name, tier, credit_level, address, contact, budget, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);
          const result = insertStmt.run(
            merchantData.license_no,
            merchantData.customer_name || "",
            merchantData.tier || "",
            merchantData.credit_level || "",
            merchantData.address || "",
            merchantData.contact || "",
            merchantData.budget || 5e4,
            "正常"
          );
          if (result.changes > 0) {
            console.log(`[Database] ✓ 新增商户: ${change.license_no} - ${merchantData.customer_name}`);
            count++;
          }
        } else {
          if (!merchantData) {
            console.warn(`[Database] ✗ 更新商户缺少数据: ${change.license_no}`);
            markAppliedStmt.run(change.id);
            continue;
          }
          const exists = db.prepare("SELECT customer_name FROM merchants WHERE license_no = ?").get(change.license_no);
          if (!exists) {
            console.warn(`[Database] ✗ 商户不存在，无法更新: ${change.license_no}`);
            markAppliedStmt.run(change.id);
            continue;
          }
          const updateFields = [];
          const updateValues = [];
          if (merchantData.customer_name) {
            updateFields.push("customer_name = ?");
            updateValues.push(merchantData.customer_name);
          }
          if (merchantData.tier) {
            updateFields.push("tier = ?");
            updateValues.push(merchantData.tier);
          }
          if (merchantData.credit_level) {
            updateFields.push("credit_level = ?");
            updateValues.push(merchantData.credit_level);
          }
          if (merchantData.address) {
            updateFields.push("address = ?");
            updateValues.push(merchantData.address);
          }
          if (merchantData.contact) {
            updateFields.push("contact = ?");
            updateValues.push(merchantData.contact);
          }
          if (merchantData.budget !== void 0) {
            updateFields.push("budget = ?");
            updateValues.push(merchantData.budget);
          }
          if (updateFields.length > 0) {
            updateFields.push("updated_at = CURRENT_TIMESTAMP");
            updateValues.push(change.license_no);
            const sql = `UPDATE merchants SET ${updateFields.join(", ")} WHERE license_no = ?`;
            const result = db.prepare(sql).run(...updateValues);
            if (result.changes > 0) {
              console.log(`[Database] ✓ 更新商户: ${change.license_no} - ${exists.customer_name} (${updateFields.length - 1} 个字段)`);
              count++;
            }
          }
        }
        markAppliedStmt.run(change.id);
      } catch (err) {
        console.error(`[Database] ✗ 应用更变失败:`, change, err.message);
      }
    }
    return count;
  });
  const applied = applyAll();
  const afterCount = db.prepare("SELECT COUNT(*) as count FROM merchants").get().count;
  console.log(`[Database] 应用后商户数量: ${afterCount} (变化: ${afterCount - beforeCount})`);
  console.log(`[Database] 成功应用 ${applied} 条更变`);
  return applied;
}
function getMerchantByLicense(licenseNo) {
  const merchant = db.prepare("SELECT * FROM merchants WHERE license_no = ?").get(licenseNo);
  return merchant || null;
}
function getProductsByTier(tier) {
  const products = db.prepare(`
    SELECT * FROM products 
    WHERE tier_required = ? OR tier_required IS NULL OR tier_required = ''
    ORDER BY profit DESC
  `).all(tier);
  return products;
}
function getAllMerchants() {
  return db.prepare("SELECT * FROM merchants ORDER BY updated_at DESC").all();
}
function getStats() {
  const merchantCount = db.prepare("SELECT COUNT(*) as count FROM merchants").get().count;
  const productCount = db.prepare("SELECT COUNT(*) as count FROM products").get().count;
  const changeCount = db.prepare("SELECT COUNT(*) as count FROM changes WHERE applied = 0").get().count;
  return {
    merchantCount,
    productCount,
    pendingChangeCount: changeCount
  };
}
function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    console.log("[Database] 数据库已关闭");
  }
}
function parseExcelFromBuffer(buffer) {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const result = {
      sheetNames: workbook.SheetNames,
      sheets: {}
    };
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
      if (data.length > 0) {
        const firstRow = data[0];
        const keys = Object.keys(firstRow);
        const isSpecialFormat = keys.length > 0 && (keys[0].includes("表格数据") || keys[0] === "" || keys[0].startsWith("_") || keys.filter((k) => k === "" || k.startsWith("_") || k.startsWith("__EMPTY")).length > keys.length / 2);
        if (isSpecialFormat) {
          console.log("[ExcelParser] 检测到特殊格式，第一行是表头");
          const newHeaders = Object.values(firstRow);
          const newData = data.slice(1).map((row) => {
            const newRow = {};
            Object.values(row).forEach((value, index) => {
              const header = newHeaders[index];
              if (header) {
                newRow[header] = value;
              }
            });
            return newRow;
          });
          result.sheets[sheetName] = newData;
          console.log("[ExcelParser] 重新解析后的表头:", newHeaders.slice(0, 10));
        } else {
          result.sheets[sheetName] = data;
        }
      } else {
        result.sheets[sheetName] = data;
      }
    }
    return result;
  } catch (err) {
    console.error("[ExcelParser] 解析失败:", err);
    throw new Error(`Excel 解析失败: ${err.message}`);
  }
}
function mapMerchantsFromSheets(sheets) {
  const sheetName = Object.keys(sheets)[0];
  const rows = sheets[sheetName];
  console.log("[ExcelParser] 商户信息表原始数据示例:", rows[0]);
  console.log("[ExcelParser] 商户信息表字段名:", Object.keys(rows[0] || {}));
  const merchants = rows.map((row) => {
    const licenseNo = findField(row, ["许可证号", "零售户许可证号", "许可证", "license_no", "license", "证号"]);
    const customerName = findField(row, ["客户名称", "零售户名称", "商户名称", "名称", "customer_name", "name"]);
    const tier = findField(row, ["档位", "客户档位", "tier", "等级"]);
    const creditLevel = findField(row, ["诚信等级", "信用等级", "credit_level", "credit"]);
    const address = findField(row, ["地址", "address", "详细地址"]);
    const contact = findField(row, ["联系方式", "电话", "contact", "phone", "手机", "客户经理"]);
    const budget = parseFloat(findField(row, ["预算", "budget", "资金"]) || 5e4);
    return {
      license_no: licenseNo,
      customer_name: customerName,
      tier,
      credit_level: creditLevel,
      address,
      contact,
      budget,
      notes: null
    };
  }).filter((m) => m.license_no);
  console.log(`[ExcelParser] 解析商户信息: ${merchants.length} 条`);
  return merchants;
}
function parseMerchantSheetFromBuffer(buffer) {
  const { sheets } = parseExcelFromBuffer(buffer);
  return mapMerchantsFromSheets(sheets);
}
function parseMerchantSheet(filePath) {
  return parseMerchantSheetFromBuffer(fs.readFileSync(filePath));
}
function mapProductsFromSheets(sheets) {
  const sheetName = Object.keys(sheets)[0];
  const rows = sheets[sheetName];
  console.log("[ExcelParser] 货源表原始数据示例:", rows[0]);
  console.log("[ExcelParser] 货源表字段名:", Object.keys(rows[0] || {}));
  const products = rows.map((row, index) => {
    const productCode = findField(row, [
      "序号",
      "货源编号",
      "编号",
      "product_code",
      "code",
      "代码",
      "品牌代码",
      "卷烟代码"
    ]);
    const productName = findField(row, [
      "商品名称",
      "品牌名称",
      "货源名称",
      "名称",
      "product_name",
      "name",
      "品牌",
      "卷烟品牌"
    ]);
    const tierRequired = findField(row, ["档位要求", "档位", "tier_required", "tier", "要求档位", "投放档位"]);
    const isDistribute = findField(row, ["是否投放", "投放"]);
    const distributeMethod = findField(row, ["投放方式"]);
    const costPrice = parseFloat(findField(row, ["成本价", "进价", "cost_price", "cost", "批发价"]) || 0);
    const sellPrice = parseFloat(findField(row, ["售价", "零售价", "sell_price", "price", "建议零售价"]) || 0);
    const category = findField(row, ["分类", "category", "类别", "品类"]);
    const unit = findField(row, ["单位", "unit"]) || "条";
    let estimatedCost = costPrice;
    let estimatedSell = sellPrice;
    if (productName && estimatedCost === 0 && estimatedSell === 0) {
      if (productName.includes("中华")) {
        estimatedCost = 500;
        estimatedSell = 550;
      } else if (productName.includes("南京") || productName.includes("利群")) {
        estimatedCost = 200;
        estimatedSell = 220;
      } else if (productName.includes("黄金叶") || productName.includes("黄鹤楼")) {
        estimatedCost = 150;
        estimatedSell = 165;
      } else if (productName.includes("芙蓉王")) {
        estimatedCost = 300;
        estimatedSell = 330;
      } else {
        estimatedCost = 100;
        estimatedSell = 110;
      }
    }
    return {
      product_code: productCode || `P${index + 1}`,
      product_name: productName,
      tier_required: tierRequired,
      cost_price: estimatedCost,
      sell_price: estimatedSell,
      category: category || distributeMethod,
      unit,
      notes: isDistribute === "否" ? "不投放" : null
    };
  }).filter((p) => p.product_name && p.product_name !== "商品名称");
  console.log(`[ExcelParser] 解析货源信息: ${products.length} 条`);
  if (products.length > 0) {
    console.log("[ExcelParser] 货源示例:", products[0]);
  }
  return products;
}
function parseProductSheetFromBuffer(buffer) {
  const { sheets } = parseExcelFromBuffer(buffer);
  return mapProductsFromSheets(sheets);
}
function parseProductSheet(filePath) {
  return parseProductSheetFromBuffer(fs.readFileSync(filePath));
}
function mapChangesFromSheets(sheets, sheetNames) {
  console.log("[ExcelParser] ===== 信息更变表调试 =====");
  console.log("[ExcelParser] Sheet 数量:", sheetNames.length);
  console.log("[ExcelParser] Sheet 名称:", sheetNames);
  const changes = [];
  for (const sheetName of sheetNames) {
    const rows = sheets[sheetName];
    console.log(`[ExcelParser] 处理 Sheet: "${sheetName}", 行数: ${rows.length}`);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const allValues = Object.values(row);
      const firstValue = allValues[0];
      const nonEmptyValues = allValues.filter((v) => v && v.trim && v.trim() !== "");
      if (nonEmptyValues.length === 1 && (firstValue === "删除" || firstValue === "增加")) {
        console.log(`[ExcelParser] Sheet "${sheetName}" 第 ${i + 1} 行 - 发现分组标题: "${firstValue}"`);
        continue;
      }
      const sequence = findField(row, ["序号", "类型"]);
      const licenseNo = findField(row, ["许可证号", "零售户许可证号", "许可证", "license_no", "license"]);
      if (!licenseNo || sequence === "序号" || sequence === "类型" || sequence === "零售户许可证号") {
        if (sequence || licenseNo) {
          console.log(`[ExcelParser] Sheet "${sheetName}" 第 ${i + 1} 行 - 跳过表头或空行`);
        }
        continue;
      }
      console.log(
        `[ExcelParser] Sheet "${sheetName}" 第 ${i + 1} 行 - 处理更变行 - 序号: "${sequence}", 许可证号: "${licenseNo}"`
      );
      if (sequence === "删除" || sequence === "删" || sequence === "delete" || sheetName === "删除") {
        changes.push({
          license_no: licenseNo,
          change_type: "删除",
          merchant_data: null
        });
        console.log(`[ExcelParser] -> 识别为删除操作`);
      } else if (sequence === "新增" || sequence === "增加" || sequence === "添加" || sequence === "add" || sheetName === "增加" || sheetName === "新增") {
        const customerName = findField(row, ["客户名称", "零售户名称", "商户名称", "名称"]);
        const tier = findField(row, ["档位", "客户档位", "tier", "档位编码"]);
        const creditLevel = findField(row, ["诚信等级", "信用等级", "credit_level"]);
        const address = findField(row, ["地址", "address", "详细地址"]);
        const contact = findField(row, ["联系方式", "电话", "contact", "客户经理"]);
        const budget = parseFloat(findField(row, ["预算", "budget"]) || 5e4);
        changes.push({
          license_no: licenseNo,
          change_type: "新增",
          merchant_data: {
            license_no: licenseNo,
            customer_name: customerName,
            tier,
            credit_level: creditLevel,
            address,
            contact,
            budget
          }
        });
        console.log(`[ExcelParser] -> 识别为新增操作: ${customerName}`);
      } else if (sequence) {
        const customerName = findField(row, ["客户名称", "零售户名称", "商户名称", "名称"]);
        const tier = findField(row, ["档位", "客户档位", "tier", "档位编码"]);
        const creditLevel = findField(row, ["诚信等级", "信用等级", "credit_level"]);
        const address = findField(row, ["地址", "address", "详细地址"]);
        const contact = findField(row, ["联系方式", "电话", "contact", "客户经理"]);
        const budget = parseFloat(findField(row, ["预算", "budget"]) || 5e4);
        changes.push({
          license_no: licenseNo,
          change_type: "更新",
          merchant_data: {
            license_no: licenseNo,
            customer_name: customerName,
            tier,
            credit_level: creditLevel,
            address,
            contact,
            budget
          }
        });
        console.log(`[ExcelParser] -> 识别为更新操作: ${customerName}`);
      }
    }
  }
  console.log(`[ExcelParser] 解析信息更变: ${changes.length} 条`);
  console.log(`[ExcelParser] 更变类型统计:`, {
    删除: changes.filter((c) => c.change_type === "删除").length,
    新增: changes.filter((c) => c.change_type === "新增").length,
    更新: changes.filter((c) => c.change_type === "更新").length
  });
  return changes;
}
function parseChangeSheetFromBuffer(buffer) {
  const { sheets, sheetNames } = parseExcelFromBuffer(buffer);
  return mapChangesFromSheets(sheets, sheetNames);
}
function parseChangeSheet(filePath) {
  return parseChangeSheetFromBuffer(fs.readFileSync(filePath));
}
function findField(row, possibleNames) {
  for (const name of possibleNames) {
    if (row[name] !== void 0 && row[name] !== null && row[name] !== "") {
      return String(row[name]).trim();
    }
    const normalizedName = name.toLowerCase().replace(/\s/g, "");
    for (const key of Object.keys(row)) {
      const normalizedKey = key.toLowerCase().replace(/\s/g, "");
      if (normalizedKey === normalizedName) {
        const value = row[key];
        if (value !== void 0 && value !== null && value !== "") {
          return String(value).trim();
        }
      }
    }
  }
  return null;
}
function previewExcelFromBuffer(buffer) {
  try {
    const { sheetNames, sheets } = parseExcelFromBuffer(buffer);
    const preview = {};
    for (const sheetName of sheetNames) {
      preview[sheetName] = sheets[sheetName].slice(0, 10);
    }
    return {
      success: true,
      sheetNames,
      preview
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}
function previewExcel(filePath) {
  try {
    return previewExcelFromBuffer(fs.readFileSync(filePath));
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}
function optimizeOrder(products, budget, tier) {
  if (!products || products.length === 0) {
    return {
      profitable: [],
      necessary: [],
      totalCost: 0,
      totalProfit: 0,
      remainingBudget: budget,
      summary: "没有可用货源"
    };
  }
  const profitable = products.filter((p) => p.profit > 0).sort((a, b) => b.profit - a.profit);
  const unprofitable = products.filter((p) => p.profit <= 0).sort((a, b) => a.profit - b.profit);
  const selected = [];
  let remainingBudget = budget;
  let totalProfit = 0;
  for (const product of profitable) {
    if (remainingBudget >= product.cost_price) {
      selected.push({
        ...product,
        quantity: 1,
        // 简化：每种货源订 1 单位
        subtotal: product.cost_price,
        profit: product.profit
      });
      remainingBudget -= product.cost_price;
      totalProfit += product.profit;
    }
  }
  const necessary = [];
  const necessaryCount = Math.min(3, unprofitable.length);
  for (let i = 0; i < necessaryCount && i < unprofitable.length; i++) {
    const product = unprofitable[i];
    if (remainingBudget >= product.cost_price) {
      necessary.push({
        ...product,
        quantity: 1,
        subtotal: product.cost_price,
        profit: product.profit,
        reason: "保档位必订"
      });
      remainingBudget -= product.cost_price;
      totalProfit += product.profit;
    }
  }
  const totalCost = budget - remainingBudget;
  return {
    profitable: selected,
    necessary,
    totalCost,
    totalProfit,
    remainingBudget,
    summary: generateSummary(selected, necessary, totalCost, totalProfit, budget)
  };
}
function generateSummary(profitable, necessary, totalCost, totalProfit, budget) {
  const profitableCount = profitable.length;
  const necessaryCount = necessary.length;
  const totalCount = profitableCount + necessaryCount;
  let summary = `本次订货方案：
`;
  summary += `- 总预算：¥${budget.toFixed(2)}
`;
  summary += `- 实际花费：¥${totalCost.toFixed(2)}
`;
  summary += `- 预计利润：¥${totalProfit.toFixed(2)}
`;
  summary += `- 利润率：${(totalProfit / totalCost * 100).toFixed(1)}%

`;
  summary += `订货明细：
`;
  summary += `- 优先订购（赚钱）：${profitableCount} 种
`;
  summary += `- 保档必订（亏损）：${necessaryCount} 种
`;
  summary += `- 合计：${totalCount} 种货源
`;
  return summary;
}
function generateOrderGuide(merchant, products, orderPlan) {
  const guide = {
    merchantInfo: {
      customerName: merchant.customer_name,
      licenseNo: merchant.license_no,
      tier: merchant.tier,
      creditLevel: merchant.credit_level,
      budget: merchant.budget
    },
    orderPlan,
    recommendations: []
  };
  if (orderPlan.profitable.length > 0) {
    guide.recommendations.push({
      type: "success",
      title: "优先订购建议",
      content: `以下 ${orderPlan.profitable.length} 种货源利润较高，建议优先订购：`,
      items: orderPlan.profitable.map((p) => ({
        name: p.product_name,
        profit: p.profit,
        costPrice: p.cost_price,
        sellPrice: p.sell_price
      }))
    });
  }
  if (orderPlan.necessary.length > 0) {
    guide.recommendations.push({
      type: "warning",
      title: "保档位必订",
      content: `为了保持 ${merchant.tier} 档位，建议订购以下货源（虽然利润较低）：`,
      items: orderPlan.necessary.map((p) => ({
        name: p.product_name,
        profit: p.profit,
        costPrice: p.cost_price,
        sellPrice: p.sell_price,
        reason: p.reason
      }))
    });
  }
  if (orderPlan.remainingBudget > 0) {
    guide.recommendations.push({
      type: "info",
      title: "预算结余",
      content: `本次订货后还剩余 ¥${orderPlan.remainingBudget.toFixed(2)}，可用于下次订货或应急周转。`
    });
  }
  return guide;
}
function generateReportHTML(orderGuide) {
  const { merchantInfo, orderPlan } = orderGuide;
  const profitRate = orderPlan.totalCost > 0 ? (orderPlan.totalProfit / orderPlan.totalCost * 100).toFixed(0) : 0;
  const profitableHTML = orderPlan.profitable.map((item) => `
    <div class="product-card">
      <div class="product-icon">📦</div>
      <div class="product-info">
        <div class="product-name">${item.product_name}</div>
        <div class="product-meta">建议 ${item.quantity || 1} 条 · 单价 ¥${item.cost_price || 0}</div>
      </div>
      <div class="product-right">
        <div class="profit-badge positive">+${item.cost_price > 0 ? (item.profit / item.cost_price * 100).toFixed(0) : 0}%</div>
        <div class="product-price">¥${(item.subtotal || item.cost_price || 0).toFixed(0)}</div>
      </div>
    </div>
  `).join("");
  const necessaryHTML = orderPlan.necessary.map((item) => `
    <div class="product-card warning">
      <div class="product-icon">🛡️</div>
      <div class="product-info">
        <div class="product-name">${item.product_name}</div>
        <div class="product-meta">建议 ${item.quantity || 1} 条 · 单价 ¥${item.cost_price || 0}</div>
      </div>
      <div class="product-right">
        <div class="profit-badge negative">${item.cost_price > 0 ? (item.profit / item.cost_price * 100).toFixed(0) : 0}%</div>
        <div class="product-price">¥${(item.subtotal || item.cost_price || 0).toFixed(0)}</div>
      </div>
    </div>
  `).join("");
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>订烟指导报告</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;background:#F5F7FA;padding-bottom:80px}.header{position:sticky;top:0;background:#fff;padding:12px 16px;display:flex;justify-content:space-between;box-shadow:0 2px 8px rgba(0,0,0,.06);z-index:100}.header-title{font-size:18px;font-weight:600;color:#1890FF}.icon-btn{width:36px;height:36px;border-radius:50%;background:#F5F7FA;display:flex;align-items:center;justify-content:center;cursor:pointer}.container{max-width:600px;margin:0 auto;padding:16px}.merchant-card{background:#fff;border-radius:12px;padding:20px;margin-bottom:16px;border:2px solid #1890FF}.merchant-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}.merchant-name{font-size:20px;font-weight:600;margin-bottom:8px}.merchant-license{font-size:13px;color:#8C8C8C}.tier-badge{background:#1890FF;color:#fff;padding:6px 16px;border-radius:12px;font-size:13px;font-weight:500;flex-shrink:0}.merchant-meta{display:flex;gap:16px;font-size:13px;color:#595959}.budget-card{background:linear-gradient(135deg,#1890FF,#0050B3);border-radius:12px;padding:20px;margin-bottom:16px;color:#fff}.budget-row{display:flex;justify-content:space-between;margin-bottom:16px}.budget-value{font-size:28px;font-weight:600}.budget-profit{font-size:20px;color:#52C41A}.progress-bar{height:8px;background:rgba(255,255,255,.3);border-radius:4px;margin-bottom:8px}.progress-fill{height:100%;background:#52C41A;border-radius:4px;transition:width .3s}.section{margin-bottom:16px}.section-header{display:flex;justify-content:space-between;padding:0 4px;margin-bottom:12px}.section-title{font-size:16px;font-weight:600}.product-list{max-height:500px;overflow-y:auto;padding-right:4px}.product-list::-webkit-scrollbar{width:4px}.product-list::-webkit-scrollbar-thumb{background:#D9D9D9;border-radius:2px}.level-tag{background:#FF4D4F;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;margin-bottom:8px;display:inline-block}.level-tag.level2{background:#FA8C16}.product-card{background:#fff;border-radius:8px;padding:14px;margin-bottom:8px;display:flex;gap:12px;border-left:3px solid #52C41A}.product-card.warning{border-left-color:#FA8C16}.product-icon{width:40px;height:40px;background:#F0F9FF;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px}.product-info{flex:1}.product-name{font-size:14px;font-weight:500;margin-bottom:4px}.product-meta{font-size:12px;color:#8C8C8C}.product-right{text-align:right}.profit-badge{font-size:11px;padding:2px 6px;border-radius:4px;margin-bottom:4px;display:inline-block}.profit-badge.positive{background:#F6FFED;color:#52C41A}.profit-badge.negative{background:#FFF7E6;color:#FA8C16}.product-price{font-size:16px;font-weight:600}.analysis-card{background:#fff;border-radius:12px;padding:20px;margin-bottom:16px}.analysis-title{font-size:16px;font-weight:600;margin-bottom:12px}.analysis-content{font-size:14px;line-height:1.8;color:#595959}.highlight{color:#1890FF;font-weight:600}.highlight.success{color:#52C41A}.back-to-top{position:fixed;bottom:90px;right:20px;width:48px;height:48px;background:#1890FF;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;cursor:pointer;box-shadow:0 4px 12px rgba(24,144,255,.4);opacity:0;transition:all .3s}.back-to-top.show{opacity:1}.footer-action{position:fixed;bottom:0;left:0;right:0;background:#fff;padding:12px 16px;box-shadow:0 -2px 8px rgba(0,0,0,.06)}.action-btn{width:100%;max-width:600px;margin:0 auto;display:block;background:linear-gradient(135deg,#1890FF,#0050B3);color:#fff;border:none;border-radius:8px;padding:14px;font-size:16px;font-weight:600;cursor:pointer}@media print{body{background:#fff;padding-bottom:0}.header{position:static;box-shadow:none;page-break-after:avoid}.icon-btn{display:none}.product-list{max-height:none!important;overflow:visible!important}.product-card{page-break-inside:avoid;margin-bottom:6px}.back-to-top,.footer-action{display:none!important}.container{max-width:100%;padding:0}.section{page-break-inside:auto}.section-header{page-break-after:avoid}.level-tag{page-break-after:avoid}.merchant-card,.budget-card,.analysis-card{page-break-inside:avoid;box-shadow:none;margin-bottom:12px}.merchant-card{page-break-after:avoid}.budget-card{page-break-after:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><div class="header"><div class="header-title">📊 订烟指导报告</div><div class="icon-btn" onclick="window.print()">🖨️</div></div><div class="container"><div class="merchant-card"><div class="merchant-header"><div><div class="merchant-name">${merchantInfo.customerName || merchantInfo.customer_name}</div><div class="merchant-license">许可证号：${merchantInfo.licenseNo || merchantInfo.license_no}</div></div><div class="tier-badge">${merchantInfo.tier}</div></div><div class="merchant-meta"><div>📍 ${merchantInfo.creditLevel || merchantInfo.credit_level || "A+"}</div><div>📅 2023 Q4</div></div></div><div class="budget-card"><div style="font-size:14px;margin-bottom:8px">利润最大化方案（推荐） 📈</div><div class="budget-row"><div><div style="font-size:13px;opacity:.9">建议投入预算</div><div class="budget-value">¥${orderPlan.totalCost.toFixed(0)}</div></div><div style="text-align:right"><div style="font-size:13px;opacity:.9">预估毛利润</div><div class="budget-profit">+¥${orderPlan.totalProfit.toFixed(0)}</div></div></div><div class="progress-bar"><div class="progress-fill" style="width:${profitRate}%"></div></div><div style="font-size:12px;text-align:right">预算共计利润率 ${profitRate}%</div></div>${profitableHTML ? `<div class="section"><div class="section-header"><div class="section-title">📋 订购建议清单</div><div style="font-size:13px;color:#1890FF">按毛利排序</div></div><div class="product-list"><div class="level-tag">LEVEL 1</div><div style="font-size:14px;font-weight:600;margin-bottom:12px">高利润货源（盈利本心）</div>${profitableHTML}</div></div>` : ""}${necessaryHTML ? `<div class="section"><div class="product-list"><div class="level-tag level2">LEVEL 2</div><div style="font-size:14px;font-weight:600;margin-bottom:12px">稳档保本货源（市场需求）</div>${necessaryHTML}</div></div>` : ""}<div class="analysis-card"><div class="analysis-title">🎯 策略专家分析</div><div class="analysis-content">本周期由于货源共可选 <span class="highlight">${orderPlan.profitable.length + orderPlan.necessary.length} 种</span>，系统优化后 <span class="highlight success">${orderPlan.profitable.length} 种</span> 纯利润货源，以及 <span class="highlight">${orderPlan.necessary.length} 种</span> 保档货源。预计上档率 <span class="highlight success">${profitRate}%</span>，预计利润 <span class="highlight success">¥${orderPlan.totalProfit.toFixed(0)}</span>。建议优先订购高利润货源，均衡订购保档货源。</div></div></div><div class="back-to-top" id="backToTop" onclick="scrollToTop()">↑</div><div class="footer-action"><button class="action-btn" onclick="window.print()">🖨️ 打印报告</button></div><script>window.addEventListener('scroll',function(){document.getElementById('backToTop').classList.toggle('show',window.scrollY>300)});function scrollToTop(){window.scrollTo({top:0,behavior:'smooth'})}<\/script></body></html>`;
}
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1e3;
let reportsDir = null;
const reportCache = /* @__PURE__ */ new Map();
const expiryTimers = /* @__PURE__ */ new Map();
function initReports(dir) {
  reportsDir = dir;
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  loadPersistedReports();
  return reportsDir;
}
function getReportsDir() {
  return reportsDir;
}
function loadPersistedReports() {
  if (!reportsDir || !fs.existsSync(reportsDir)) return;
  const files = fs.readdirSync(reportsDir).filter((f) => f.endsWith(".html"));
  const now = Date.now();
  for (const file of files) {
    const id = file.replace(/\.html$/, "");
    const filePath = path.join(reportsDir, file);
    try {
      const mtime = fs.statSync(filePath).mtimeMs;
      if (now - mtime > DEFAULT_TTL_MS) {
        fs.unlinkSync(filePath);
        continue;
      }
      const html = fs.readFileSync(filePath, "utf8");
      reportCache.set(id, html);
      scheduleExpiry(id, DEFAULT_TTL_MS - (now - mtime));
    } catch (err) {
      console.warn(`[Reports] 加载报告失败 ${id}:`, err.message);
    }
  }
  console.log(`[Reports] 已加载 ${reportCache.size} 份持久化报告`);
}
function scheduleExpiry(reportId, ttlMs = DEFAULT_TTL_MS) {
  if (expiryTimers.has(reportId)) {
    clearTimeout(expiryTimers.get(reportId));
  }
  const timer = setTimeout(() => {
    reportCache.delete(reportId);
    expiryTimers.delete(reportId);
    if (reportsDir) {
      const filePath = path.join(reportsDir, `${reportId}.html`);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {
        }
      }
    }
    console.log(`[Reports] 报告 ${reportId} 已过期`);
  }, Math.max(ttlMs, 1e3));
  if (typeof timer.unref === "function") {
    timer.unref();
  }
  expiryTimers.set(reportId, timer);
}
function saveReport(html) {
  const reportId = Date.now().toString(36) + Math.random().toString(36).slice(2);
  reportCache.set(reportId, html);
  if (reportsDir) {
    const filePath = path.join(reportsDir, `${reportId}.html`);
    fs.writeFileSync(filePath, html, "utf8");
  }
  scheduleExpiry(reportId);
  console.log(`[Reports] 已保存报告: ${reportId}`);
  return reportId;
}
function getReport(reportId) {
  if (reportCache.has(reportId)) {
    return reportCache.get(reportId);
  }
  if (reportsDir) {
    const filePath = path.join(reportsDir, `${reportId}.html`);
    if (fs.existsSync(filePath)) {
      const html = fs.readFileSync(filePath, "utf8");
      reportCache.set(reportId, html);
      return html;
    }
  }
  return null;
}
function getReportCount() {
  return reportCache.size;
}
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      const family = net.family;
      if ((family === "IPv4" || family === 4) && !net.internal) {
        return net.address;
      }
    }
  }
  return "localhost";
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});
const REPORT_NOT_FOUND_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>报告不存在</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0;padding:20px}
    .container{background:white;padding:40px;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.3);text-align:center;max-width:500px}
    h1{color:#FF4D4F;margin-bottom:20px}p{color:#595959}
  </style>
</head>
<body><div class="container"><h1>报告不存在</h1><p>该报告可能已过期或链接无效</p></div></body>
</html>`;
function createApp(options = {}) {
  const mode = options.mode || "web";
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  const reportsDir2 = getReportsDir();
  if (reportsDir2) {
    app.use("/reports", express.static(reportsDir2));
  }
  app.get("/api/stats", (_req, res) => {
    try {
      res.json({ success: true, stats: getStats() });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app.get("/api/merchants", (_req, res) => {
    try {
      res.json({ success: true, merchants: getAllMerchants() });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app.get("/api/merchants/:licenseNo", (req, res) => {
    try {
      const merchant = getMerchantByLicense(req.params.licenseNo);
      if (!merchant) {
        return res.status(404).json({ success: false, error: "未找到该商户" });
      }
      const products = getProductsByTier(merchant.tier);
      res.json({
        success: true,
        merchant,
        products,
        productCount: products.length
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app.post("/api/orders/plan", (req, res) => {
    try {
      const licenseNo = req.body?.licenseNo;
      if (!licenseNo) {
        return res.status(400).json({ success: false, error: "缺少 licenseNo" });
      }
      const merchant = getMerchantByLicense(licenseNo);
      if (!merchant) {
        return res.status(404).json({ success: false, error: "未找到该商户" });
      }
      const products = getProductsByTier(merchant.tier);
      const orderPlan = optimizeOrder(products, merchant.budget, merchant.tier);
      const orderGuide = generateOrderGuide(merchant, products, orderPlan);
      res.json({ success: true, orderGuide });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app.post("/api/reports/share", (req, res) => {
    try {
      const licenseNo = req.body?.licenseNo;
      if (!licenseNo) {
        return res.status(400).json({ success: false, error: "缺少 licenseNo" });
      }
      const merchant = getMerchantByLicense(licenseNo);
      if (!merchant) {
        return res.status(404).json({ success: false, error: "未找到该商户" });
      }
      const products = getProductsByTier(merchant.tier);
      const orderPlan = optimizeOrder(products, merchant.budget, merchant.tier);
      const orderGuide = generateOrderGuide(merchant, products, orderPlan);
      const html = generateReportHTML(orderGuide);
      const reportId = saveReport(html);
      res.json({
        success: true,
        reportId,
        localIP: getLocalIP()
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app.post("/api/import/:type", upload.single("file"), (req, res) => {
    try {
      const type = req.params.type;
      if (!["merchants", "products", "changes"].includes(type)) {
        return res.status(400).json({ success: false, error: "无效的导入类型" });
      }
      if (!req.file?.buffer) {
        return res.status(400).json({ success: false, error: "未上传文件" });
      }
      const buffer = req.file.buffer;
      const fileName = req.file.originalname || "upload.xlsx";
      let count = 0;
      let changes = null;
      if (type === "merchants") {
        const merchants = parseMerchantSheetFromBuffer(buffer);
        insertMerchants(merchants);
        count = merchants.length;
      } else if (type === "products") {
        const products = parseProductSheetFromBuffer(buffer);
        insertProducts(products);
        count = products.length;
      } else {
        changes = parseChangeSheetFromBuffer(buffer);
        insertChanges(changes);
        count = changes.length;
      }
      const payload = { success: true, count, fileName };
      if (type === "changes") {
        payload.changes = changes;
      }
      res.json(payload);
    } catch (err) {
      console.error("[API] 导入失败:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app.post("/api/excel/preview", upload.single("file"), (req, res) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ success: false, error: "未上传文件" });
      }
      res.json(previewExcelFromBuffer(req.file.buffer));
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app.post("/api/changes/apply", (_req, res) => {
    try {
      const count = applyChanges();
      res.json({ success: true, count });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app.post("/api/data/clear", (_req, res) => {
    try {
      clearAllData();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app.get("/api/server/status", (_req, res) => {
    if (mode === "web") {
      return res.json({
        running: true,
        alwaysOn: true,
        port: Number(process.env.PORT) || 3e3,
        reportCount: getReportCount()
      });
    }
    res.json({
      running: true,
      alwaysOn: false,
      port: Number(process.env.PORT) || 3e3,
      reportCount: getReportCount()
    });
  });
  app.get("/report/:id", (req, res) => {
    const html = getReport(req.params.id);
    if (html) {
      res.type("html").send(html);
    } else {
      res.status(404).type("html").send(REPORT_NOT_FOUND_HTML);
    }
  });
  const staticDir = options.staticDir;
  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      if (req.path.startsWith("/api") || req.path.startsWith("/report")) return next();
      if (req.path.includes(".")) return next();
      res.sendFile(path.join(staticDir, "index.html"), (err) => {
        if (err) next();
      });
    });
  } else if (mode === "web") {
    app.get("/", (_req, res) => {
      res.type("html").send(`<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>烟草订货管理系统</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#F0F2F5}
.box{background:#fff;padding:32px;border-radius:12px;text-align:center;max-width:420px;box-shadow:0 8px 24px rgba(0,0,0,.08)}
h1{color:#1890FF;font-size:22px}p{color:#595959;line-height:1.6}</style></head>
<body><div class="box"><h1>烟草订货管理系统</h1><p>API 服务已启动。请运行 <code>npm run build:web</code> 后使用 <code>npm run start:web</code>，或开发时使用 <code>npm run dev:web</code>。</p></div></body></html>`);
    });
  }
  return app;
}
let server = null;
let serverPort = 3e3;
async function startEmbeddedServer(port = 3e3) {
  if (server) {
    return { success: true, port: serverPort };
  }
  serverPort = port;
  const app = createApp({ mode: "electron" });
  return new Promise((resolve, reject) => {
    const tryListen = (p) => {
      const s = app.listen(p, "0.0.0.0", () => {
        server = s;
        serverPort = p;
        console.log(`[Server] 内嵌服务已启动: http://localhost:${p}`);
        resolve({ success: true, port: p });
      });
      s.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
          console.log(`[Server] 端口 ${p} 被占用，尝试 ${p + 1}`);
          tryListen(p + 1);
        } else {
          reject(err);
        }
      });
    };
    tryListen(port);
  });
}
function stopEmbeddedServer() {
  return new Promise((resolve) => {
    if (!server) {
      resolve({ success: true, message: "服务器未运行" });
      return;
    }
    server.close(() => {
      console.log("[Server] 内嵌服务已停止");
      server = null;
      resolve({ success: true });
    });
  });
}
function getEmbeddedServerStatus() {
  return {
    running: server !== null,
    alwaysOn: false,
    port: serverPort,
    reportCount: getReportCount()
  };
}
let mainWindow = null;
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true
    }
  });
  mainWindow.on("ready-to-show", () => mainWindow.show());
  mainWindow.on("close", () => {
    closeDatabase();
    stopEmbeddedServer();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    electron.shell.openExternal(url);
    return { action: "deny" };
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.ipcMain.handle("open-file-dialog", async (_e, { title, filters }) => {
  const { filePaths, canceled } = await electron.dialog.showOpenDialog(mainWindow, {
    title: title || "选择 Excel 文件",
    filters: filters || [{ name: "Excel 文件", extensions: ["xlsx", "xls"] }],
    properties: ["openFile"]
  });
  if (canceled || filePaths.length === 0) return null;
  return filePaths[0];
});
electron.ipcMain.handle("preview-excel", async (_e, filePath) => {
  try {
    return previewExcel(filePath);
  } catch (err) {
    return { success: false, error: err.message };
  }
});
electron.ipcMain.handle("debug-changes", async (_e, filePath) => {
  try {
    const changes = parseChangeSheet(filePath);
    return { success: true, changes };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
electron.ipcMain.handle("import-merchants", async (_e, filePath) => {
  try {
    const merchants = parseMerchantSheet(filePath);
    insertMerchants(merchants);
    return { success: true, count: merchants.length };
  } catch (err) {
    console.error("[IPC] 导入商户信息失败:", err);
    return { success: false, error: err.message };
  }
});
electron.ipcMain.handle("import-products", async (_e, filePath) => {
  try {
    const products = parseProductSheet(filePath);
    insertProducts(products);
    return { success: true, count: products.length };
  } catch (err) {
    console.error("[IPC] 导入货源表失败:", err);
    return { success: false, error: err.message };
  }
});
electron.ipcMain.handle("import-changes", async (_e, filePath) => {
  try {
    const changes = parseChangeSheet(filePath);
    insertChanges(changes);
    return { success: true, count: changes.length, changes };
  } catch (err) {
    console.error("[IPC] 导入信息更变表失败:", err);
    return { success: false, error: err.message };
  }
});
electron.ipcMain.handle("apply-changes", async () => {
  try {
    const count = applyChanges();
    return { success: true, count };
  } catch (err) {
    console.error("[IPC] 应用更变失败:", err);
    return { success: false, error: err.message };
  }
});
electron.ipcMain.handle("query-merchant", async (_e, licenseNo) => {
  try {
    const merchant = getMerchantByLicense(licenseNo);
    if (!merchant) {
      return { success: false, error: "未找到该商户" };
    }
    const products = getProductsByTier(merchant.tier);
    return {
      success: true,
      merchant,
      products,
      productCount: products.length
    };
  } catch (err) {
    console.error("[IPC] 查询商户失败:", err);
    return { success: false, error: err.message };
  }
});
electron.ipcMain.handle("generate-order-plan", async (_e, { licenseNo }) => {
  try {
    const merchant = getMerchantByLicense(licenseNo);
    if (!merchant) {
      return { success: false, error: "未找到该商户" };
    }
    const products = getProductsByTier(merchant.tier);
    const orderPlan = optimizeOrder(products, merchant.budget, merchant.tier);
    const orderGuide = generateOrderGuide(merchant, products, orderPlan);
    return { success: true, orderGuide };
  } catch (err) {
    console.error("[IPC] 生成订货方案失败:", err);
    return { success: false, error: err.message };
  }
});
electron.ipcMain.handle("share-report", async (_e, { licenseNo }) => {
  try {
    const status = getEmbeddedServerStatus();
    if (!status.running) {
      await startEmbeddedServer();
    }
    const merchant = getMerchantByLicense(licenseNo);
    if (!merchant) {
      return { success: false, error: "未找到该商户" };
    }
    const products = getProductsByTier(merchant.tier);
    const orderPlan = optimizeOrder(products, merchant.budget, merchant.tier);
    const orderGuide = generateOrderGuide(merchant, products, orderPlan);
    const html = generateReportHTML(orderGuide);
    const reportId = saveReport(html);
    const port = getEmbeddedServerStatus().port;
    const localIP = getLocalIP();
    const link = `http://localhost:${port}/report/${reportId}`;
    const networkLink = `http://${localIP}:${port}/report/${reportId}`;
    return {
      success: true,
      reportId,
      link,
      networkLink,
      qrData: networkLink
    };
  } catch (err) {
    console.error("[IPC] 分享报告失败:", err);
    return { success: false, error: err.message };
  }
});
electron.ipcMain.handle("start-server", async () => {
  try {
    return await startEmbeddedServer();
  } catch (err) {
    return { success: false, error: err.message };
  }
});
electron.ipcMain.handle("stop-server", async () => {
  try {
    return await stopEmbeddedServer();
  } catch (err) {
    return { success: false, error: err.message };
  }
});
electron.ipcMain.handle("get-server-status", async () => {
  return getEmbeddedServerStatus();
});
electron.ipcMain.handle("get-stats", async () => {
  try {
    return { success: true, stats: getStats() };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
electron.ipcMain.handle("get-all-merchants", async () => {
  try {
    return { success: true, merchants: getAllMerchants() };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
electron.ipcMain.handle("clear-all-data", async () => {
  try {
    clearAllData();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
electron.app.whenReady().then(() => {
  utils.electronApp.setAppUserModelId("com.tobacco.order");
  electron.app.on("browser-window-created", (_, window) => utils.optimizer.watchWindowShortcuts(window));
  const dbDir = electron.app.isPackaged ? path.join(electron.app.getPath("userData"), "data") : path.join(process.cwd(), "data");
  const reportsDir2 = electron.app.isPackaged ? path.join(electron.app.getPath("userData"), "reports") : path.join(process.cwd(), "data", "reports");
  initDatabase({ dbDir });
  initReports(reportsDir2);
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  electron.app.quit();
});
