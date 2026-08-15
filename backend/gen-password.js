import bcrypt from 'bcrypt'

const password = 'admin123'

bcrypt.hash(password, 10).then(hash => {
  console.log('密码:', password)
  console.log('Hash:', hash)
  console.log('\nSQL更新语句:')
  console.log(`UPDATE users SET password = '${hash}' WHERE username = 'admin';`)
  process.exit(0)
})
