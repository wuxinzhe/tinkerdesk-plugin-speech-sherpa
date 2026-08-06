# 语音识别/合成（Sherpa-ONNX）安装引导

## 前置依赖
- 无外部软件依赖（纯 Node 实现，基于 sherpa-onnx-node 原生模块，已随插件打包）
- 模型由插件配置页自动下载（国内镜像多源回退）

## 环境要求
- 无 GPU 要求，CPU 可运行
- Node 运行时由 TinkerDesk 应用提供

## 对接方式
- 系统开放接口：`voice.stt`（语音识别）、`voice.tts`（语音合成）
- 配置页完成模型下载后启用，语音设置选择绑定即可

## 安装步骤
1. 安装插件（zip 或插件文件夹）
2. 进入插件配置页，点击「下载模型」（STT ~126MB + TTS ~30MB）
3. 等待下载完成后点击「启用」

## 常见路径
- 模型目录：`%APPDATA%/tinkerdesk/plugins/speech-sherpa/models/`
- 下载镜像：ghfast.top → gh-proxy → GitHub（自动回退）
