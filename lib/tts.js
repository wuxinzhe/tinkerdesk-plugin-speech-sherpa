/**
 * lib/tts.js — 语音合成（TTS）：VITS 中文 → wav base64 → renderer Audio 播放
 *
 * 生成 wav（16kHz 单声道 16bit PCM）后返回 data URL / base64，
 * 由 renderer 侧 Audio 播放——避免引入 speaker 原生依赖。
 */
const sherpa_onnx = require('sherpa-onnx-node')
const { join } = require('path')

function createTts(modelDir) {
  const config = {
    model: {
      vits: {
        model: join(modelDir, 'model.onnx'),
        tokens: join(modelDir, 'tokens.txt'),
        lexicon: join(modelDir, 'lexicon.txt'),
      },
      debug: false,
      numThreads: 1,
      provider: 'cpu',
    },
    maxNumSentences: 1,
    ruleFsts: [
      join(modelDir, 'date.fst'),
      join(modelDir, 'phone.fst'),
      join(modelDir, 'number.fst'),
      join(modelDir, 'new_heteronym.fst'),
    ].join(','),
    ruleFars: join(modelDir, 'rule.far'),
  }
  return sherpa_onnx.OfflineTts.createSync(config)
}

/**
 * 合成语音 → wav base64
 * @param {object} opts { modelDir, text, speed?, sid? }
 */
async function synthesize({ modelDir, text, speed = 1.0, sid = 88 }) {
  const tts = createTts(modelDir)
  const generationConfig = new sherpa_onnx.GenerationConfig({ sid, speed, silenceScale: 0.2 })
  const audio = await tts.generateAsync({ text, generationConfig })
  return wavToBase64(audio.samples, audio.sampleRate)
}

/** Float32 samples → wav base64（16bit PCM，WAV 头） */
function wavToBase64(samples, sampleRate) {
  const bytesPerSample = 2
  const dataSize = samples.length * bytesPerSample
  const buffer = Buffer.alloc(44 + dataSize)
  // RIFF header
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16) // fmt chunk size
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(1, 22) // mono
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28) // byte rate
  buffer.writeUInt16LE(bytesPerSample, 32) // block align
  buffer.writeUInt16LE(16, 34) // bits per sample
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  // PCM data
  for (let i = 0; i < samples.length; ++i) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    const v = s < 0 ? s * 0x8000 : s * 0x7fff
    buffer.writeInt16LE(Math.round(v), 44 + i * 2)
  }
  return `data:audio/wav;base64,${buffer.toString('base64')}`
}

module.exports = { synthesize }
