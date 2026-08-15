import bcrypt from 'bcrypt'

const password = 'admin123'
const hash = '$2b$10$N9qo8uLOickgx2ZMRZoMye5pvsF8x0HIzXJXfQHGVXOKqBvMZZ7S2'

console.log('测试密码:', password)
console.log('数据库hash:', hash)

bcrypt.compare(password, hash).then(result => {
  console.log('验证结果:', result)
  process.exit(0)
})
