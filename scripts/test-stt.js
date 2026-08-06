// 验证 STT 模型就绪 + 真实识别（用 zipformer 自带测试音频）
const { join } = require('path')
const { readdirSync, readFileSync } = require('fs')
const models = require('../lib/models')
const { transcribe } = require('../lib/stt')

const tmp = join(process.env.APPDATA, 'tinkerdesk', 'plugins', 'speech-sherpa')
console.log('stt ready:', models.isModelReady(tmp, 'stt'))
console.log('tts ready:', models.isModelReady(tmp, 'tts'))

const wavDir = join(tmp, 'models', 'stt', 'test_wavs')
const wavs = readdirSync(wavDir).filter((f) => f.endsWith('.wav'))
console.log('测试音频:', wavs[0])

const buf = readFileSync(join(wavDir, wavs[0]))
const sr = buf.readUInt32LE(24)
const data = buf.subarray(44)
const samples = new Float32Array(data.length / 2)
for (let i = 0; i < samples.length; i++) samples[i] = data.readInt16LE(i * 2) / 32768
console.log('采样率:', sr, '时长:', (samples.length / sr).toFixed(1) + 's')

const text = transcribe({ modelDir: join(tmp, 'models', 'stt'), samples })
console.log('🎤 识别结果:', JSON.stringify(text))
