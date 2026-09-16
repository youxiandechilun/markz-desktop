# Markz Desktop

> Electron + TypeScript Markdown 桌面客户端，同时提供可集成的 Vanilla / React SDK。Markdown 源文本是唯一存储真值。

Markz 是一个 Markdown 原生的 Electron 桌面编辑器，使用 TypeScript、CodeMirror 6 和 unified / mdast。Markdown 源文本是唯一真值；编辑器、预览、索引和 AI 修改都从源文本派生。

## 当前能力

- Electron + TypeScript 桌面应用结构；
- CodeMirror 6 Markdown 编辑；
- CommonMark / GFM 解析与 HTML 预览；
- 源码、内联、分栏、阅读四种模式；
- 文档大纲与本地索引统计；
- 本地 Markdown 文件打开与保存 IPC；
- 中文 / English 界面，默认中文；
- 浅色 / 深色主题；
- AI 服务地址、协议、模型与能力配置；文本固定开启，图像由用户按模型勾选；
- 无 API Key 时仍可离线编辑、预览与导出；
- AI 写作提案、差异查看和文本应用流程；
- Markdown 解析、GFM 任务列表和安全 HTML 渲染测试。

当前修复版为 **0.1.1**。Windows 可运行客户端：`C:\Users\32761\Desktop\markz\release\0.1.1\win-unpacked\Markz.exe`。请保留 `win-unpacked` 完整目录。旧的 `release/win-unpacked/` 和 0.1.0 便携版不包含本次修复。

同目录已生成便携版 `Markz-0.1.1-portable.exe` 和 NSIS 安装版 `Markz-0.1.1-win-x64.exe`，可按使用习惯选择。

本次修复 DeepSeek Anthropic Base URL 的模型列表与生成路由；详见 [0.1.1 验证记录](docs/03_验收/0.1.1_AI配置修复.md)。

AI 真实云服务需要用户在设置中提供 API Key；没有 Key 时编辑、索引、预览、文件保存和 HTML 导出仍可离线运行。三协议、取消、冲突和鉴权失败已用本地 HTTP 服务覆盖；真实模型响应尚未用用户凭据验证。

## 开发

```powershell
pnpm install
pnpm dev
```

检查和构建：

```powershell
pnpm typecheck
pnpm test
pnpm build
```

当前运行环境如果无法下载 Electron 桌面二进制，可以先执行：

```powershell
pnpm install --ignore-scripts
pnpm typecheck
pnpm test
pnpm build
```

这可以完成 TypeScript、单元测试和生产构建；真正启动桌面窗口仍需要 Electron 二进制可用。

## 目录

```text
electron/              主进程与 preload 安全桥接
src/renderer/          React 渲染层、编辑器、预览、AI 面板
docs/01_需求/          正式需求规格说明书
discuss/               产品决策和历史讨论
```

正式需求见：`C:\Users\32761\Desktop\markz\docs\01_需求\需求规格说明书.md`。
