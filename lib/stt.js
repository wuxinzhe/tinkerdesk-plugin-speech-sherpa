/**
 * lib/stt.js — 语音识别（STT）：纯识别能力（不负责录音——录音是应用固有功能）
 *
 * 输入：Float32Array（16kHz 单声道 PCM，由应用侧采集/重采样后传入）
 * 输出：识别文本
 */
const sherpa_onnx = require('sherpa-onnx-node')
const { join } = require('path')

function createRecognizer(modelDir) {
  const config = {
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      zipformer: {
        model: join(modelDir, 'model.int8.onnx'),
      },
      tokens: join(modelDir, 'tokens.txt'),
      numThreads: 2,
      provider: 'cpu',
      debug: 0,
    },
  }
  return new sherpa_onnx.OfflineRecognizer(config)
}

/**
 * 一次性整段转写（按住说话 → 松开 → 应用把音频送来）
 * @param {object} opts { modelDir, samples: Float32Array }
 * @returns {string} 识别文本
 */
function transcribe({ modelDir, samples }) {
  if (!samples || samples.length === 0) return ''
  const recognizer = createRecognizer(modelDir)
  const stream = recognizer.createStream()
  stream.acceptWaveform(samples)
  recognizer.decode(stream)
  return stream.result.text.trim()
}

module.exports = { transcribe }
