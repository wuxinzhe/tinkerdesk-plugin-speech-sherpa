/**
 * tinkerdesk-plugin-speech-sherpa/index.js — TinkerDesk 语音插件入口（CommonJS）
 *
 * 契约：module.exports = { init(ctx) => PluginApi }
 *
 * 能力：
 *   stt:start            → 开始录音识别（VAD 切句 → 文本事件 stt:on-text）
 *   stt:stop             → 停止录音
 *   stt:status           → 录音状态
 *   tts:speak {text}     → 合成并播放（返回 audio data URL）
 *   models:status        → 模型就绪状态
 *   models:download      → 下载缺失模型（进度事件 models:progress）
 *
 * 事件：
 *   stt:on-text {text}   识别文本（逐句）
 *   stt:state {running}  录音状态变化
 *   models:progress {kind, phase, percent}
 */
const { join } = require('path')
const models = require('./lib/models')
const { startStt } = require('./lib/stt')
const { synthesize } = require('./lib/tts')

module.exports = {
  init(ctx) {
    let sttSession = null
    let running = false

    // ── STT ──
    ctx.registerIpc('stt:start', () => {
      if (running) return { running: true }
      if (!models.isModelReady(ctx.configDir, 'stt') || !models.isModelReady(ctx.configDir, 'vad')) {
        throw new Error('STT 模型未就绪，请先在插件设置中下载模型')
      }
      sttSession = startStt({
        modelDir: join(ctx.configDir, 'models', 'stt'),
        vadModelDir: join(ctx.configDir, 'models', 'vad'),
        onText: (text) => ctx.emit('stt:on-text', { text }),
        onState: (state) => {
          running = !!state.running
          ctx.emit('stt:state', state)
        },
      })
      return { running: true }
    })

    ctx.registerIpc('stt:stop', () => {
      sttSession?.stop()
      sttSession = null
      return { running: false }
    })

    ctx.registerIpc('stt:status', () => ({ running }))

    // ── TTS ──
    ctx.registerIpc('tts:speak', async (payload) => {
      const text = payload && typeof payload.text === 'string' ? payload.text.trim() : ''
      if (!text) throw new Error('tts:speak 需要 text')
      if (!models.isModelReady(ctx.configDir, 'tts')) {
        throw new Error('TTS 模型未就绪，请先在插件设置中下载模型')
      }
      const cfg = ctx.getConfig()
      const audio = await synthesize({
        modelDir: join(ctx.configDir, 'models', 'tts'),
        text,
        speed: Number(cfg.voiceRate ?? 1.0),
        sid: Number(cfg.sid ?? 88),
      })
      return { audio, text }
    })

    // ── 模型管理 ──
    ctx.registerIpc('models:status', () => ({
      stt: models.isModelReady(ctx.configDir, 'stt'),
      vad: models.isModelReady(ctx.configDir, 'vad'),
      tts: models.isModelReady(ctx.configDir, 'tts'),
      allReady: models.allReady(ctx.configDir),
    }))

    ctx.registerIpc('models:download', async (payload) => {
      const kinds = payload && Array.isArray(payload.kinds) ? payload.kinds : Object.keys(models.MODELS)
      const manifest = ctx.getManifest()
      const results = {}
      for (const kind of kinds) {
        results[kind] = await models.downloadModel(ctx.configDir, kind, manifest, (evt) => ctx.emit('models:progress', evt))
      }
      return results
    })

    return {
      start() {
        ctx.emit('ready', { models: models.allReady(ctx.configDir) })
      },
      stop() {
        sttSession?.stop()
        sttSession = null
        running = false
      },
      dispose() {
        sttSession?.stop()
        sttSession = null
      },
      getStatus() {
        return {
          loaded: true,
          enabled: true,
          detail: `模型 ${models.allReady(ctx.configDir) ? '已就绪' : '未下载（' + ['stt', 'vad', 'tts'].filter((k) => !models.isModelReady(ctx.configDir, k)).join('/') + '）'}`,
        }
      },
      getConfigSchema() {
        return {
          type: 'object',
          properties: {
            voiceRate: {
              type: 'number',
              title: '语速',
              min: 0.5,
              max: 2,
              step: 0.1,
              default: 1.0,
            },
            sid: {
              type: 'select',
              title: '音色',
              options: [
                { label: '女声 88', value: 88 },
                { label: '女声 90', value: 90 },
                { label: '男声 92', value: 92 },
                { label: '男声 94', value: 94 },
              ],
              default: 88,
            },
            autoSpeak: {
              type: 'boolean',
              title: '自动朗读回复',
              default: false,
              description: 'AI 回复完成后自动朗读（需聊天页接入）',
            },
          },
        }
      },
    }
  },
}
