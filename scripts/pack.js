/**
 * scripts/pack.js — 生成分发 zip（含 node_modules，用户解压即用）
 *
 * 产物：dist/tinkerdesk-plugin-speech-sherpa.zip
 * 包内顶层目录：speech-sherpa/
 */
const { execFileSync } = require('child_process')
const { mkdirSync, existsSync, rmSync } = require('fs')
const { join } = require('path')

const root = join(__dirname, '..')
const dist = join(root, 'dist')
const staging = join(dist, 'speech-sherpa')

// 1. 校验依赖已安装
const nm = join(root, 'node_modules')
if (!existsSync(nm) || !existsSync(join(nm, 'sherpa-onnx-node'))) {
  console.error('❌ 先执行 npm install（sherpa-onnx-node 未安装）')
  process.exit(1)
}

// 2. 清理并准备暂存目录
rmSync(dist, { recursive: true, force: true })
mkdirSync(staging, { recursive: true })

// 3. 拷贝插件文件 + node_modules（排除 dev 脚本/源码 map）
for (const name of ['index.js', 'manifest.json', 'README.md', 'LICENSE']) {
  execFileSync('cp', ['-r', join(root, name), join(staging, name)])
}
execFileSync('cp', ['-r', join(root, 'lib'), join(staging, 'lib')])
execFileSync('cp', ['-r', join(nm), join(staging, 'node_modules')])

// 4. 压缩（Windows 10+ 自带 tar 支持 zip）
const zipPath = join(dist, 'tinkerdesk-plugin-speech-sherpa.zip')
rmSync(zipPath, { force: true })
execFileSync('tar', ['-a', '-cf', zipPath, '-C', dist, 'speech-sherpa'])
rmSync(staging, { recursive: true, force: true })

console.log(`✅ 打包完成: ${zipPath}`)
