/**
 * reportTemplates.js - 预设报告模板配置
 * 每个模板定义了包含哪些 section、配色、详略程度
 */

export const TEMPLATES = {
  executive: {
    id: 'executive',
    name: '商务简报',
    icon: '💼',
    description: '适合给领导/客户汇报，突出核心指标和结论',
    pages: '3-4 页',
    sections: [
      { type: 'cover', style: 'gradient' },
      { type: 'kpi_cards', metrics: ['sum', 'avg', 'count', 'quality_score'] },
      { type: 'trend_chart', granularity: 'monthly', showGrowth: true },
      { type: 'category_pie', topN: 5 },
      { type: 'ai_narrative', focus: 'executive_summary' },
      { type: 'conclusion', showOutliers: false }
    ],
    colorScheme: 'corporate_blue',
    detailLevel: 'brief'
  },

  detailed: {
    id: 'detailed',
    name: '详细报告',
    icon: '📊',
    description: '完整分析报告，包含所有图表和明细数据',
    pages: '8-9 页',
    sections: [
      { type: 'cover', style: 'gradient' },
      { type: 'overview_quality' },
      { type: 'statistics_full' },
      { type: 'distribution' },
      { type: 'trend_chart', granularity: 'both', showGrowth: true },
      { type: 'category_analysis', showCross: true },
      { type: 'correlation' },
      { type: 'detail_tables' },
      { type: 'conclusion', showOutliers: true }
    ],
    colorScheme: 'corporate_blue',
    detailLevel: 'full'
  },

  dashboard: {
    id: 'dashboard',
    name: '数据看板',
    icon: '📈',
    description: '一页纸看全貌，高信息密度，适合打印张贴',
    pages: '1-2 页',
    sections: [
      { type: 'cover', style: 'minimal' },
      { type: 'dashboard_grid' }
    ],
    colorScheme: 'vibrant',
    detailLevel: 'compact'
  },

  minimal: {
    id: 'minimal',
    name: '极简摘要',
    icon: '📝',
    description: '纯文字为主，快速浏览关键数字和结论',
    pages: '2 页',
    sections: [
      { type: 'cover', style: 'clean' },
      { type: 'kpi_cards', metrics: ['sum', 'avg', 'mom'] },
      { type: 'ai_narrative', focus: 'brief_summary' },
      { type: 'conclusion', showOutliers: false }
    ],
    colorScheme: 'monochrome',
    detailLevel: 'minimal'
  }
}

/**
 * 获取所有模板列表（供前端展示）
 */
export function getTemplateList() {
  return Object.values(TEMPLATES).map(t => ({
    id: t.id,
    name: t.name,
    icon: t.icon,
    description: t.description,
    pages: t.pages
  }))
}

/**
 * 获取指定模板配置
 */
export function getTemplate(templateId) {
  return TEMPLATES[templateId] || TEMPLATES.detailed
}
