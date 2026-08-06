/**
 * lib/stt.js — 语音识别（STT）：纯识别能力（不负责录音——录音是应用固有功能）
 *
 * 输入：Float32Array（16kHz 单声道 PCM，由应用侧采集/重采样后传入）
 * 输出：识别文本
 *
 * 模型：streaming-zipformer-zh（流式 transducer，OnlineRecognizer）
 * 一次性喂入整段音频 + 尾部静音 → 循环 decode → 取结果。
 */
const sherpa_onnx = require('sherpa-onnx-node')
const { join } = require('path')

function createRecognizer(modelDir) {
  const config = {
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      transducer: {
        encoder: join(modelDir, 'encoder.int8.onnx'),
        decoder: join(modelDir, 'decoder.onnx'),
        joiner: join(modelDir, 'joiner.int8.onnx'),
      },
      tokens: join(modelDir, 'tokens.txt'),
      numThreads: 2,
      provider: 'cpu',
      debug: 0,
    },
  }
  return new sherpa_onnx.OnlineRecognizer(config)
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
  stream.acceptWaveform({ sampleRate: 16000, samples })
  // 尾部补 0.4s 静音，让流式解码器 flush 出最后的内容
  stream.acceptWaveform({ sampleRate: 16000, samples: new Float32Array(6400) })
  while (recognizer.isReady(stream)) {
    recognizer.decode(stream)
  }
  const result = recognizer.getResult(stream)
  return (result && result.text ? String(result.text) : '').trim()
}

module.exports = { transcribe }
