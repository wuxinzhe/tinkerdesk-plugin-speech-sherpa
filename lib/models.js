/**
 * lib/models.js — 模型管理：状态检查 + 下载（GitHub Release 直链，断点续传）
 *
 * 模型目录（相对插件目录）：
 *   models/stt/   STT Zipformer 中文 int8（tar.bz2 需解压）
 *   models/vad/   silero_vad.onnx
 *   models/tts/   VITS 中文 AISHELL3（tar.bz2 需解压）
 */
const { existsSync, mkdirSync, createWriteStream } = require('fs')
const { join } = require('path')
const { execFileSync } = require('child_process')
const { pipeline } = require('stream/promises')
const https = require('https')

/** Windows 解压工具：优先 System32 自带 bsdtar（Electron 系统 PATH 保证可用） */
function tarBin() {
  return process.platform === 'win32'
    ? (process.env.SystemRoot ? process.env.SystemRoot + '\\System32\\tar.exe' : 'C:\\Windows\\System32\\tar.exe')
    : 'tar'
}

const MODELS = {
  stt: {
    archive: 'sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30.tar.bz2',
    // zipformer 流式模型是 encoder/decoder/joiner 三件套（无 model.int8.onnx）
    required: ['encoder.int8.onnx', 'decoder.onnx', 'joiner.int8.onnx', 'tokens.txt'],
  },
  tts: {
    archive: 'vits-icefall-zh-aishell3.tar.bz2',
    required: ['model.onnx', 'tokens.txt', 'lexicon.txt'],
  },
}

/** 模型是否就绪（解压后必需文件存在） */
function isModelReady(configDir, kind) {
  const spec = MODELS[kind]
  const dir = join(configDir, 'models', kind)
  if (!existsSync(dir)) return false
  if (spec.file) return existsSync(join(dir, spec.file))
  return spec.required.every((f) => existsSync(join(dir, f)))
}

/** 全部模型就绪 */
function allReady(configDir) {
  return Object.keys(MODELS).every((k) => isModelReady(configDir, k))
}

/** 下载并解压模型（emit 进度事件）；已就绪直接返回 */
async function downloadModel(configDir, kind, manifest, emit) {
  const spec = MODELS[kind]
  if (isModelReady(configDir, kind)) return { ok: true, skipped: true }

  const dep = (manifest.modelDeps || []).find((d) => d.dest === `models/${kind}`)
  const url = dep?.url
  if (!url) throw new Error(`模型 ${kind} 未在 manifest 声明下载地址`)

  const targetDir = join(configDir, 'models', kind)
  mkdirSync(targetDir, { recursive: true })
  emit('models:progress', { kind, phase: 'download', percent: 0 })

  // 下载（断点续传 -C - 语义：用 range 头）
  const tmpFile = join(targetDir, spec.archive ? spec.archive : spec.file)
  await downloadWithProgress(url, tmpFile, (percent) => {
    emit('models:progress', { kind, phase: 'download', percent })
  })

  if (spec.archive) {
    emit('models:progress', { kind, phase: 'extract', percent: 100 })
    // Windows 10+ 自带 tar（支持 bz2）；解压后目录为解压包内顶层目录，把内容平铺到 targetDir
    execFileSync(tarBin(), ['-xjf', tmpFile, '-C', targetDir], { stdio: 'ignore' })
    // 平铺：解压出的子目录内容移到 targetDir 根
    const { readdirSync, renameSync, rmSync } = require('fs')
    for (const name of readdirSync(targetDir)) {
      const sub = join(targetDir, name)
      if (name.endsWith('.tar.bz2')) continue
      const st = require('fs').statSync(sub)
      if (st.isDirectory()) {
        for (const inner of readdirSync(sub)) {
          renameSync(join(sub, inner), join(targetDir, inner))
        }
        rmSync(sub, { recursive: true, force: true })
      }
    }
    rmSync(tmpFile, { force: true })
  }

  if (!isModelReady(configDir, kind)) {
    throw new Error(`模型 ${kind} 解压后缺少必需文件`)
  }
  emit('models:progress', { kind, phase: 'done', percent: 100 })
  return { ok: true }
}

/** 带进度的 HTTP 下载（Range 断点续传 + 重定向跟随） */
function downloadWithProgress(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    let downloaded = 0
    const fileSize = 0

    const request = (targetUrl, start) => {
      const headers = start > 0 ? { Range: `bytes=${start}-` } : {}
      https
        .get(targetUrl, { headers }, (res) => {
          const status = res.statusCode
          if (status === 301 || status === 302 || status === 303 || status === 307 || status === 308) {
            res.resume()
            const next = res.headers.location
            if (!next) {
              reject(new Error(`重定向缺少 Location: ${targetUrl}`))
              return
            }
            // 跟随重定向（用新 URL，继续断点语义）
            request(new URL(next, targetUrl).toString(), start)
            return
          }
          if (status !== 200 && status !== 206) {
            reject(new Error(`下载失败 HTTP ${status}: ${targetUrl}`))
            return
          }
          const size = parseInt(res.headers['content-length'] || '0', 10) + (status === 206 ? start : 0)
          const ws = createWriteStream(dest, { flags: start > 0 ? 'a' : 'w' })
          ws.on('error', reject)
          res.on('data', (chunk) => {
            downloaded += chunk.length
            if (size > 0) onProgress(Math.min(99, Math.round((downloaded / size) * 100)))
          })
          pipeline(res, ws).then(resolve).catch(reject)
        })
        .on('error', reject)
    }
    request(url, existsSync(dest) ? require('fs').statSync(dest).size : 0)
  })
}

module.exports = { isModelReady, allReady, downloadModel, MODELS }
