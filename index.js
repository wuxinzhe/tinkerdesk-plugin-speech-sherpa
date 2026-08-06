/**
 * index.js — tinkerdesk-plugin-speech-sherpa 入口（CommonJS）
 *
 * 职责边界：插件只提供 STT（语音转文本）和 TTS（文本转语音）纯能力。
 * 录音（麦克风采集）是 TinkerDesk 应用固有功能——应用启动时检测本插件是否可用，
 * 决定是否显示语音输入按钮；录音完成后把音频交给本插件的 stt:transcribe 转文本。
 *
 * 契约：module.exports = { init(ctx) => PluginApi }
 *
 * 能力：
 *   stt:transcribe {samples, sampleRate} → {text}   整段音频转文本
 *   tts:speak {text} → {audio}                       文本合成语音（data URL）
 *   models:status → 模型就绪状态
 *   models:download {kinds} → 下载缺失模型（进度事件 models:progress）
 *
 * 事件：models:progress {kind, phase, percent}
 */
const { join } = require('path')
const models = require('./lib/models')
const { transcribe } = require('./lib/stt')
const { synthesize } = require('./lib/tts')

module.exports = {
  init(ctx) {
    // ── STT：应用录音完成后调此接口转文本 ──
    ctx.registerIpc('stt:transcribe', (payload) => {
      if (!models.isModelReady(ctx.configDir, 'stt')) {
        throw new Error('STT 模型未就绪，请先在插件设置中下载模型')
      }
      const samples = payload && payload.samples
      if (!(samples instanceof Float32Array) || samples.length === 0) {
        throw new Error('stt:transcribe 需要 samples（Float32Array 16kHz）')
      }
      const text = transcribe({ modelDir: join(ctx.configDir, 'models', 'stt'), samples })
      return { text }
    })

    // ── TTS：文本合成语音（返回 audio data URL，renderer Audio 播放） ──
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
      tts: models.isModelReady(ctx.configDir, 'tts'),
      allReady: models.allReady(ctx.configDir),
    }))

    ctx.registerIpc('models:download', async (payload) => {
      const kinds = payload && Array.isArray(payload.kinds) ? payload.kinds : Object.keys(models.MODELS)
      const manifest = ctx.getManifest()
      const results = {}
      for (const kind of kinds) {
        results[kind] = await models.downloadModel(ctx.configDir, kind, manifest, (evt) =>
          ctx.emit('models:progress', evt)
        )
      }
      return results
    })

    return {
      /** 启用前自检（协议 v1 强制）：模型就绪检查 */
      check() {
        const sttOk = models.isModelReady(ctx.configDir, 'stt')
        const ttsOk = models.isModelReady(ctx.configDir, 'tts')
        const checks = [
          {
            name: 'STT 模型',
            ok: sttOk,
            hint: sttOk ? undefined : '语音输入模型未下载（约 126MB）',
            action: sttOk ? undefined : 'download-models',
          },
          {
            name: 'TTS 模型',
            ok: ttsOk,
            hint: ttsOk ? undefined : '朗读模型未下载（约 30MB）',
            action: ttsOk ? undefined : 'download-models',
          },
        ]
        return { ok: sttOk && ttsOk, checks }
      },
      start() {
        ctx.emit('ready', { models: models.allReady(ctx.configDir) })
      },
      stop() {},
      dispose() {},
      getStatus() {
        return {
          loaded: true,
          enabled: true,
          detail: `模型 ${models.allReady(ctx.configDir) ? '已就绪' : '未下载（' + ['stt', 'tts'].filter((k) => !models.isModelReady(ctx.configDir, k)).join('/') + '）'}`,
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
