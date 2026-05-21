/**
 * 报告生成模块
 * 生成 HTML 格式的订货指导报告
 */

/**
 * 生成报告 HTML
 */
export function generateReportHTML(orderGuide) {
  const { merchantInfo, orderPlan, recommendations } = orderGuide
  
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>订货指导报告 - ${merchantInfo.customerName}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
      color: #333;
    }
    
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      overflow: hidden;
    }
    
    .header {
      background: linear-gradient(135deg, #1890FF 0%, #0050B3 100%);
      color: white;
      padding: 30px 20px;
      text-align: center;
    }
    
    .header h1 {
      font-size: 24px;
      margin-bottom: 10px;
    }
    
    .header p {
      font-size: 14px;
      opacity: 0.9;
    }
    
    .merchant-info {
      padding: 20px;
      background: #E6F7FF;
      border-bottom: 1px solid #91D5FF;
    }
    
    .merchant-info h2 {
      font-size: 18px;
      color: #0050B3;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
    }
    
    .merchant-info h2::before {
      content: "📋";
      margin-right: 8px;
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }
    
    .info-item {
      display: flex;
      flex-direction: column;
    }
    
    .info-label {
      font-size: 12px;
      color: #8C8C8C;
      margin-bottom: 4px;
    }
    
    .info-value {
      font-size: 14px;
      color: #262626;
      font-weight: 500;
    }
    
    .summary {
      padding: 20px;
      background: #FFF7E6;
      border-left: 4px solid #FA8C16;
    }
    
    .summary h2 {
      font-size: 18px;
      color: #D46B08;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
    }
    
    .summary h2::before {
      content: "💰";
      margin-right: 8px;
    }
    
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
    }
    
    .summary-item {
      background: white;
      padding: 15px;
      border-radius: 8px;
      text-align: center;
    }
    
    .summary-label {
      font-size: 12px;
      color: #8C8C8C;
      margin-bottom: 8px;
    }
    
    .summary-value {
      font-size: 24px;
      font-weight: bold;
      color: #262626;
    }
    
    .summary-value.profit {
      color: #52C41A;
    }
    
    .summary-value.cost {
      color: #1890FF;
    }
    
    .section {
      padding: 20px;
      border-bottom: 1px solid #F0F0F0;
    }
    
    .section:last-child {
      border-bottom: none;
    }
    
    .section h2 {
      font-size: 18px;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
    }
    
    .section.success h2 {
      color: #52C41A;
    }
    
    .section.success h2::before {
      content: "🔥";
      margin-right: 8px;
    }
    
    .section.warning h2 {
      color: #FA8C16;
    }
    
    .section.warning h2::before {
      content: "⚠️";
      margin-right: 8px;
    }
    
    .section.info h2 {
      color: #1890FF;
    }
    
    .section.info h2::before {
      content: "ℹ️";
      margin-right: 8px;
    }
    
    .product-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    
    .product-card {
      background: #FAFAFA;
      border-radius: 8px;
      padding: 15px;
      border-left: 4px solid #52C41A;
    }
    
    .product-card.warning {
      border-left-color: #FA8C16;
    }
    
    .product-name {
      font-size: 16px;
      font-weight: 500;
      color: #262626;
      margin-bottom: 8px;
    }
    
    .product-details {
      display: flex;
      justify-content: space-between;
      font-size: 14px;
      color: #8C8C8C;
    }
    
    .product-profit {
      font-weight: bold;
    }
    
    .product-profit.positive {
      color: #52C41A;
    }
    
    .product-profit.negative {
      color: #FF4D4F;
    }
    
    .footer {
      padding: 20px;
      text-align: center;
      background: #FAFAFA;
      color: #8C8C8C;
      font-size: 12px;
    }
    
    @media (max-width: 600px) {
      body {
        padding: 10px;
      }
      
      .info-grid,
      .summary-grid {
        grid-template-columns: 1fr;
      }
      
      .header h1 {
        font-size: 20px;
      }
      
      .summary-value {
        font-size: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 订货指导报告</h1>
      <p>智能分析 · 利润最大化</p>
    </div>
    
    <div class="merchant-info">
      <h2>商户信息</h2>
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">客户名称</div>
          <div class="info-value">${merchantInfo.customerName || '-'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">许可证号</div>
          <div class="info-value">${merchantInfo.licenseNo || '-'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">档位</div>
          <div class="info-value">${merchantInfo.tier || '-'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">诚信等级</div>
          <div class="info-value">${merchantInfo.creditLevel || '-'}</div>
        </div>
      </div>
    </div>
    
    <div class="summary">
      <h2>订货方案摘要</h2>
      <div class="summary-grid">
        <div class="summary-item">
          <div class="summary-label">总预算</div>
          <div class="summary-value">¥${merchantInfo.budget.toFixed(0)}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">实际花费</div>
          <div class="summary-value cost">¥${orderPlan.totalCost.toFixed(0)}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">预计利润</div>
          <div class="summary-value profit">¥${orderPlan.totalProfit.toFixed(0)}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">利润率</div>
          <div class="summary-value profit">${((orderPlan.totalProfit / orderPlan.totalCost) * 100).toFixed(1)}%</div>
        </div>
      </div>
    </div>
    
    ${recommendations.map(rec => `
      <div class="section ${rec.type}">
        <h2>${rec.title}</h2>
        <p style="margin-bottom: 15px; color: #595959;">${rec.content}</p>
        ${rec.items ? `
          <div class="product-list">
            ${rec.items.map(item => `
              <div class="product-card ${rec.type === 'warning' ? 'warning' : ''}">
                <div class="product-name">${item.name}</div>
                <div class="product-details">
                  <span>成本: ¥${item.costPrice.toFixed(2)}</span>
                  <span>售价: ¥${item.sellPrice.toFixed(2)}</span>
                  <span class="product-profit ${item.profit > 0 ? 'positive' : 'negative'}">
                    利润: ${item.profit > 0 ? '+' : ''}¥${item.profit.toFixed(2)}
                  </span>
                </div>
                ${item.reason ? `<div style="margin-top: 8px; font-size: 12px; color: #FA8C16;">💡 ${item.reason}</div>` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `).join('')}
    
    <div class="footer">
      <p>报告生成时间：${new Date().toLocaleString('zh-CN')}</p>
      <p style="margin-top: 8px;">本报告由烟草订货管理系统自动生成</p>
    </div>
  </div>
</body>
</html>
  `
  
  return html
}
