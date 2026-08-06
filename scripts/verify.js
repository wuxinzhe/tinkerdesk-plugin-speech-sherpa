/**
 * scripts/verify.js — 插件加载校验：模拟 TinkerDesk PluginManager 加载本插件
 */
const { existsSync } = require('fs')
const { join } = require('path')

const root = join(__dirname, '..')
const sherpa = join(root, 'node_modules', 'sherpa-onnx-node')
if (!existsSync(sherpa)) {
  console.error('❌ 未安装依赖：先执行 npm install')
  process.exit(1)
}

const manifest = require(join(root, 'manifest.json'))
const entry = require(join(root, manifest.entry))

// 模拟 PluginContext
let ipcCount = 0
const ctx = {
  pluginId: manifest.id,
  configDir: root,
  getManifest: () => manifest,
  emit: (event, data) => console.log(`  [event] ${event}`, data ?? ''),
  registerIpc: (channel) => {
    ipcCount++
    console.log(`  [ipc] plugin:${manifest.id}:${channel}`)
  },
  getConfig: () => ({}),
  setConfig: () => {},
}

const api = entry.init(ctx)
const schema = api.getConfigSchema()
const fields = Object.keys(schema.properties)
const status = api.getStatus()

console.log(`✅ 插件入口加载成功: ${manifest.name} v${manifest.version}`)
console.log(`   能力: ${manifest.capabilities.join(', ')}`)
console.log(`   配置项: ${fields.join(', ')}`)
console.log(`   注册 IPC: ${ipcCount} 个`)
console.log(`   状态: ${JSON.stringify(status)}`)
console.log(`   模型: ${JSON.stringify(api.getStatus())}`)

if (api.dispose) api.dispose()
console.log('✅ verify 通过')
