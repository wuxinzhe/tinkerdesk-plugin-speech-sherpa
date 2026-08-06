# tinkerdesk-plugin-speech-sherpa

TinkerDesk 插件：本地离线语音（STT 语音输入 + TTS 朗读），基于 [Sherpa-ONNX](https://github.com/k2-fsa/sherpa-onnx)。

- 全本地离线，不联网、不收费
- CPU 即可运行
- STT：Silero VAD 说话检测 + Zipformer 中文流式识别（边说边出字）
- TTS：VITS 中文（AISHELL3）多音色

## 安装

1. 下载本仓库 Release 的 `tinkerdesk-plugin-speech-sherpa.zip`
2. 解压到 TinkerDesk 插件目录：`%APPDATA%/tinkerdesk/plugins/speech-sherpa/`
3. 重启 TinkerDesk
4. 系统设置 → 插件设置 → 启用"本地语音（Sherpa-ONNX）"
5. 点「配置」→ 首次使用需下载模型（约 157MB，插件设置内一键下载，支持断点续传）

## 模型

| 模型 | 用途 | 体积 |
|:--|:--|:--|
| streaming-zipformer-zh-int8-2025-06-30 | 中文语音识别 | 126MB |
| silero_vad.onnx | 说话检测 | 0.6MB |
| vits-icefall-zh-aishell3 | 中文语音合成 | 30MB |

下载完成后存放在插件目录 `models/` 下，不占应用空间。

## 插件 API

| IPC | 说明 |
|:--|:--|
| `stt:start` | 开始录音识别 |
| `stt:stop` | 停止录音 |
| `stt:status` | 录音状态 |
| `tts:speak` | 合成并返回音频 data URL（`{text}`）|
| `models:status` | 模型就绪状态 |
| `models:download` | 下载缺失模型 |

事件：`stt:on-text`（识别文本）、`stt:state`（录音状态）、`models:progress`（下载进度）。

## 开发

```bash
npm install          # sherpa-onnx-node + node-cpal（Windows 平台包自动安装）
node scripts/verify.js   # 加载校验
npm run pack         # 生成分发 zip（含 node_modules）
```

## 配置项

| 字段 | 类型 | 说明 |
|:--|:--|:--|
| voiceRate | number | 语速 0.5~2.0 |
| sid | select | 音色（AISHELL3 说话人）|
| autoSpeak | boolean | 自动朗读回复 |

## 协议

插件协议 v1（apiVersion: 1），依赖 TinkerDesk 插件系统（应用版本需包含 `plugin:list` 等 IPC）。
