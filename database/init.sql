-- 烟草订货管理系统 - 数据库初始化脚本

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- 1. 管理员表
-- ----------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL COMMENT '用户名',
  `password` varchar(255) NOT NULL COMMENT '密码(bcrypt加密)',
  `role` varchar(20) DEFAULT 'admin' COMMENT '角色',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='管理员表';

-- 插入默认管理员 (密码: admin123)
INSERT INTO `users` (`username`, `password`, `role`) VALUES 
('admin', '$2b$10$N9qo8uLOickgx2ZMRZoMye5pvsF8x0HIzXJXfQHGVXOKqBvMZZ7S2', 'admin');

-- ----------------------------
-- 2. 商户信息表
-- ----------------------------
DROP TABLE IF EXISTS `merchants`;
CREATE TABLE `merchants` (
  `id` int NOT NULL AUTO_INCREMENT,
  `license_no` varchar(50) NOT NULL COMMENT '许可证号',
  `customer_name` varchar(100) DEFAULT NULL COMMENT '客户名称',
  `company` varchar(100) DEFAULT NULL COMMENT '公司',
  `legal_person` varchar(50) DEFAULT NULL COMMENT '法人',
  `customer_status` varchar(20) DEFAULT NULL COMMENT '客户状态',
  `contact` varchar(50) DEFAULT NULL COMMENT '联系电话',
  `district` varchar(50) DEFAULT NULL COMMENT '区县',
  `market_dept` varchar(50) DEFAULT NULL COMMENT '市场部',
  `sales_line` varchar(50) DEFAULT NULL COMMENT '营销线',
  `address` varchar(200) DEFAULT NULL COMMENT '经营地址',
  `business_scope` text COMMENT '经营范围',
  `shop_name` varchar(100) DEFAULT NULL COMMENT '店铺门头名称',
  `market_type` varchar(50) DEFAULT NULL COMMENT '市场类型',
  `market_type_sub` varchar(50) DEFAULT NULL COMMENT '市场类型细分',
  `business_type` varchar(50) DEFAULT NULL COMMENT '业态',
  `business_scale` varchar(50) DEFAULT NULL COMMENT '经营规模',
  `business_circle` varchar(50) DEFAULT NULL COMMENT '商圈',
  `order_cycle` varchar(50) DEFAULT NULL COMMENT '订货周期类型',
  `order_day` varchar(50) DEFAULT NULL COMMENT '订货日',
  `order_method` varchar(50) DEFAULT NULL COMMENT '订货方式',
  `payment_method` varchar(50) DEFAULT NULL COMMENT '结算方式',
  `online_payment` varchar(10) DEFAULT NULL COMMENT '是否允许网上结算',
  `credit_level` varchar(10) DEFAULT NULL COMMENT '诚信等级',
  `tier_code` varchar(20) DEFAULT NULL COMMENT '档位编码',
  `tier` varchar(20) DEFAULT NULL COMMENT '档位',
  `join_date` varchar(50) DEFAULT NULL COMMENT '入网日期',
  `terminal_level` varchar(50) DEFAULT NULL COMMENT '终端层级',
  `terminal_type` varchar(50) DEFAULT NULL COMMENT '终端类别',
  `terminal_type_sub` varchar(50) DEFAULT NULL COMMENT '终端类型细分',
  `cigar_tier` varchar(20) DEFAULT NULL COMMENT '雪茄烟档位',
  `cigar_terminal_type` varchar(50) DEFAULT NULL COMMENT '雪茄烟终端类型',
  `sample_type` varchar(50) DEFAULT NULL COMMENT '自动采集样本户类型',
  `budget` decimal(10,2) DEFAULT 50000.00 COMMENT '默认预算',
  `status` enum('正常','停用') DEFAULT '正常' COMMENT '状态',
  `notes` text COMMENT '备注',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_license_no` (`license_no`),
  KEY `idx_name` (`customer_name`),
  KEY `idx_tier` (`tier`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商户信息表';

-- ----------------------------
-- 3. 货源表
-- ----------------------------
DROP TABLE IF EXISTS `products`;
CREATE TABLE `products` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_code` varchar(50) NOT NULL COMMENT '货源编码',
  `product_name` varchar(100) NOT NULL COMMENT '货源名称',
  `mode` varchar(20) DEFAULT NULL COMMENT '模式',
  `seg` varchar(20) DEFAULT NULL COMMENT '段位: 5段/6段/7段',
  `cost_price` decimal(10,2) DEFAULT 0.00 COMMENT '进价',
  `sell_price` decimal(10,2) DEFAULT 0.00 COMMENT '零售价',
  `profit` decimal(10,2) DEFAULT 0.00 COMMENT '毛利',
  `caps_json` json DEFAULT NULL COMMENT '各档位配额 {"30":10,"35":15}',
  `unit` varchar(10) DEFAULT '条' COMMENT '单位',
  `notes` text COMMENT '备注',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_product_code` (`product_code`),
  KEY `idx_seg` (`seg`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='货源表';

-- ----------------------------
-- 4. 段位总量上限表
-- ----------------------------
DROP TABLE IF EXISTS `seg_caps`;
CREATE TABLE `seg_caps` (
  `id` int NOT NULL AUTO_INCREMENT,
  `seg` varchar(20) NOT NULL COMMENT '段位',
  `tier` int NOT NULL COMMENT '档位',
  `cap` int DEFAULT 0 COMMENT '总量上限',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_seg_tier` (`seg`,`tier`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='段位总量上限表';

-- ----------------------------
-- 5. 信息更变表
-- ----------------------------
DROP TABLE IF EXISTS `changes`;
CREATE TABLE `changes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `license_no` varchar(50) NOT NULL COMMENT '商户号',
  `change_type` enum('新增','修改','删除') NOT NULL COMMENT '更变类型',
  `merchant_data` json DEFAULT NULL COMMENT '商户数据',
  `applied` tinyint(1) DEFAULT 0 COMMENT '是否已应用',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_license` (`license_no`),
  KEY `idx_applied` (`applied`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='信息更变表';

-- ----------------------------
-- 6. 查询日志表 (可选)
-- ----------------------------
DROP TABLE IF EXISTS `query_logs`;
CREATE TABLE `query_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `license_no` varchar(50) DEFAULT NULL COMMENT '商户号',
  `budget` decimal(10,2) DEFAULT NULL COMMENT '查询预算',
  `query_time` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '查询时间',
  `ip_address` varchar(50) DEFAULT NULL COMMENT 'IP地址',
  PRIMARY KEY (`id`),
  KEY `idx_license` (`license_no`),
  KEY `idx_time` (`query_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='查询日志表';

SET FOREIGN_KEY_CHECKS = 1;
