/**
 * lib/stt.js — 语音识别（STT）：Silero VAD 检测说话段 + Zipformer 流式识别
 *
 * 流程：node-cpal 采集麦克风 → LinearResampler(→16k) → Vad 切句 → OfflineRecognizer 识别
 * 识别文本通过 onText 回调（插件 ctx.emit('stt:on-text')）逐句输出。
 */
const sherpa_onnx = require('sherpa-onnx-node')
const cpal = require('node-cpal')
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

function createVad(modelDir) {
  const config = {
    sileroVad: {
      model: join(modelDir, 'silero_vad.onnx'),
      threshold: 0.5,
      minSpeechDuration: 0.25,
      minSilenceDuration: 0.5,
      windowSize: 512,
    },
    sampleRate: 16000,
    debug: false,
    numThreads: 1,
  }
  const bufferSizeInSeconds = 60
  return new sherpa_onnx.Vad(config, bufferSizeInSeconds)
}

/**
 * 启动录音识别（阻塞直到 stop() 被调用）
 * @param {object} opts { modelDir, vadModelDir, onText(text), onState(state) }
 * @returns {{ stop: () => void }}
 */
function startStt({ modelDir, vadModelDir, onText, onState }) {
  const recognizer = createRecognizer(modelDir)
  const vad = createVad(vadModelDir)

  const bufferSizeInSeconds = 30
  const buffer = new sherpa_onnx.CircularBuffer(bufferSizeInSeconds * vad.config.sampleRate)

  const inputDevice = cpal.getDefaultInputDevice()
  const deviceConfig = cpal.getDefaultInputConfig(inputDevice.deviceId)
  const nativeSampleRate = deviceConfig.sampleRate
  const targetSampleRate = vad.config.sampleRate
  const resampler = new sherpa_onnx.LinearResampler(nativeSampleRate, targetSampleRate)

  let stopped = false
  const inputStream = cpal.createStream(
    inputDevice.deviceId,
    true,
    deviceConfig.sampleRate,
    deviceConfig.sampleFormat,
    deviceConfig.channels
  )

  inputStream.on('data', (data) => {
    const samples = new Float32Array(data.buffer, data.byteOffset, data.byteLength / 4)
    const resampled = resampler.resample(samples)
    buffer.push(resampled)
    while (!stopped && buffer.size() >= vad.config.windowSize) {
      const window = buffer.get(vad.config.windowSize)
      vad.acceptWaveform(window)
      if (vad.isSpeechDetected()) {
        const result = recognizer.decode(vad.front())
        const text = result.text.trim()
        if (text) onText(text)
        vad.pop()
      }
    }
  })
  inputStream.on('error', (err) => {
    onState({ running: false, error: err.message })
  })

  onState({ running: true })
  return {
    stop() {
      stopped = true
      try {
        inputStream.destroy()
      } catch {
        // 忽略销毁异常
      }
      onState({ running: false })
    },
  }
}

module.exports = { startStt }
