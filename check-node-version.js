#!/usr/bin/env node

/**
 * 检查 Node 版本是否符合要求
 * 如果版本不对，提示用户切换
 */

const fs = require('fs')
const path = require('path')

const requiredVersion = fs.readFileSync(path.join(__dirname, '.nvmrc'), 'utf-8').trim()
const currentVersion = process.version.replace('v', '')

const [requiredMajor] = requiredVersion.split('.')
const [currentMajor] = currentVersion.split('.')

if (currentMajor !== requiredMajor) {
  console.error('\x1b[31m%s\x1b[0m', '❌ Node 版本不匹配！')
  console.error('\x1b[33m%s\x1b[0m', `   当前版本: v${currentVersion}`)
  console.error('\x1b[33m%s\x1b[0m', `   需要版本: v${requiredVersion}`)
  console.error('')
  console.error('\x1b[36m%s\x1b[0m', '请运行以下命令切换版本：')
  console.error('\x1b[32m%s\x1b[0m', `   nvm use ${requiredMajor}`)
  console.error('')
  process.exit(1)
}

console.log('\x1b[32m%s\x1b[0m', `✓ Node 版本正确: v${currentVersion}`)
