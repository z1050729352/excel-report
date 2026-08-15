import multer from 'multer'
import config from '../config/index.js'

/**
 * 文件上传中间件配置
 * 使用内存存储，文件作为 Buffer 存储在 req.file.buffer
 */
const storage = multer.memoryStorage()

export const upload = multer({
  storage,
  limits: {
    fileSize: config.upload.maxSize
  },
  fileFilter: (req, file, cb) => {
    // 检查文件类型
    const allowedMimes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream'
    ]
    
    const allowedExts = ['.xlsx', '.xls']
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'))
    
    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error('只支持 Excel 文件格式（.xlsx, .xls）'))
    }
  }
})

/**
 * 错误处理中间件
 */
export function handleUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: `文件大小超过限制（最大 ${Math.floor(config.upload.maxSize / 1024 / 1024)}MB）`
      })
    }
    return res.status(400).json({
      success: false,
      error: `文件上传失败: ${err.message}`
    })
  }
  
  if (err) {
    return res.status(400).json({
      success: false,
      error: err.message
    })
  }
  
  next()
}
