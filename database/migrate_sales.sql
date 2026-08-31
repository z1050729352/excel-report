-- 商户当月销量字段迁移
-- 用于存储"商户订货表(多指标销售汇总)"导入的销量数据
ALTER TABLE merchants
  ADD COLUMN monthly_sales DECIMAL(12,2) DEFAULT NULL COMMENT '当月销量(条)',
  ADD COLUMN sales_amount DECIMAL(14,2) DEFAULT NULL COMMENT '当月含税销额(元)',
  ADD COLUMN box_value DECIMAL(12,2) DEFAULT NULL COMMENT '单箱值(元)',
  ADD COLUMN sales_month VARCHAR(20) DEFAULT NULL COMMENT '销量所属月份';
