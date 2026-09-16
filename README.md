# Markz Desktop

> Electron + TypeScript Markdown 桌面客户端，同时提供可集成的 Vanilla / React SDK。Markdown 源文本是唯一存储真值。

## 考题

> 请为以下开源项目提交一个 pull request，开放命题，根据自身能力自行决定 PR 难度。
> 项目地址：<https://github.com/floatboatai/Nexus-Editor>

我认为这个项目做的不很好，自己总结了一下项目的特点，然后自己根据原有项目的功能重写了一个项目。使用的是 codex 进行编写。但是近期 chatgpt 风控严格，并且服务模型经常过载，时间紧张，就写到这里了。AI 功能还有很多问题，我也很喜欢这个项目，后面会进行更新的。

这个仓库就是这份答卷：不是给 Nexus-Editor 提一个局部 PR，而是把它的核心主张——Markdown 源文本为唯一真值、编辑器/预览/索引/AI 全部从源文本派生——用 Electron + TypeScript 重新实现了一遍。

## 这是什么

Markz 是一个 Markdown 原生的 Electron 桌面编辑器，使用 TypeScript、CodeMirror 6 和 unified / mdast。Markdown 源文本是唯一真值；编辑器、预览、索引和 AI 修改都从源文本派生。同一套渲染与编辑能力也被编译成 SDK，供其他 Web 项目嵌入。

分工上是「作者在本地写作，开发者可以复用编译与编辑能力」。协作、账户、插件市场、移动端、复杂输出和完整 WYSIWYG 都不在范围内——正式边界以 [需求规格说明书](docs/01_需求/需求规格说明书.md) 为准。

## 当前能力

- Electron + TypeScript 桌面应用结构，主进程 / preload / 渲染层三段隔离；
- CodeMirror 6 Markdown 编辑，源码、内联、分栏、阅读四种模式；
- 格式工具栏：粗体、斜体、删除线、行内代码、链接、三级标题、引用、无序 / 有序 / 任务列表、代码块、分隔线、表格，共 14 个命令；
- CommonMark / GFM 解析与 HTML 预览，安全 HTML 渲染（rehype-sanitize）；
- 文档大纲与本地索引统计；
- 工作区目录浏览、本地 Markdown 文件打开与保存 IPC、草稿恢复与自动保存；
- 中文 / English 界面，默认中文；浅色 / 深色主题；
- AI 服务地址、协议、模型与能力配置；文本能力固定开启，图像能力由用户按模型勾选；
- 「获取模型」把服务返回的模型直接合并进列表（按 ID 去重、保留已设能力、自动选中第一个），并读取上下文长度；
- 连接测试支持逐个模型探测、行内状态徽标与「测试全部模型」汇总；配置级失败（鉴权 / 超时 / 404）会立即停止后续探测；
- 流式生成，提案头部实时显示已接收字符数；差异查看与文本应用 / 撤销流程；
- 无 API Key 时仍可离线编辑、预览、导出与保存；
- 单元测试覆盖 Markdown 解析、GFM 任务列表、安全渲染、AI 三协议端点、流式传输与格式命令。

## 当前状态

版本 **0.1.2**。这一版的主要改动是模型列表自动加入、逐模型连接测试与流式诊断，详见 [0.1.2 验证记录](docs/03_验收/0.1.2_模型添加与逐个测试.md)；0.1.1 修的是 DeepSeek Anthropic Base URL 的模型列表与生成路由，见 [0.1.1 验证记录](docs/03_验收/0.1.1_AI配置修复.md)。

已验证：TypeScript 类型检查、全部单元测试（9 个文件、73 项）、生产构建、三套 Electron 冒烟测试（通用 / 格式 / AI / 设置）、SDK 构建，以及用 SDK 产物直接请求真实服务端点（仅鉴权失败路径，本机没有可用 Key）。

尚有问题，未做完：

- **真实 Key 下的成功路径未验证**。真实流式生成、仅推理模型的输出、额度与限流后的表现，都还没有用真实凭据跑通。
- **一次客户端闪退的根因没有复现**。日志时间线里没有 JS 层异常，因此这一版只补齐了日志证据链（未捕获异常、子进程退出、渲染进程崩溃、生成请求终态），没有声称修好了根因。
- **`/models` 端点路由属于防御性加固**。哪个候选路径对 DeepSeek 真正可用，仍没有实证，只是把已尝试路径写进了日志方便定位。
- **打包产物仍是 0.1.1**，这一版没有重新运行 electron-builder。

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

如果当前环境无法下载 Electron 桌面二进制，可以先执行：

```powershell
pnpm install --ignore-scripts
pnpm typecheck
pnpm test
pnpm build
```

这可以完成 TypeScript、单元测试和生产构建；真正启动桌面窗口仍需要 Electron 二进制可用。

冒烟测试与 SDK：

```powershell
pnpm desktop:smoke     # 通用桌面流程
pnpm format:smoke      # 格式工具栏
pnpm ai:smoke          # AI 提案 / 应用 / 冲突 / 取消
pnpm settings:smoke    # 设置页与模型列表
pnpm build:sdk         # 产出 dist-sdk/
```

## 目录

```text
electron/              主进程与 preload 安全桥接
src/ai/                三协议 AI 传输层（OpenAI / Anthropic / 兼容）
src/renderer/          React 渲染层、编辑器、预览、格式工具栏、AI 面板
src/shared/            主进程与渲染层共享的类型契约
scripts/               冒烟测试与基准脚本
tests/                 单元测试
docs/01_需求/          正式需求规格说明书
docs/02_开发/          SDK API 文档
docs/03_验收/          各版本验证记录
discuss/               产品决策和历史讨论
```

## 文档

- [需求规格说明书](docs/01_需求/需求规格说明书.md) — 正式范围与边界，含与 Nexus-Editor、MarkText 的对照
- [SDK API](docs/02_开发/SDK_API.md)
- [交付与验证](docs/03_验收/交付与验证.md)
- [0.1.2 模型添加与逐个测试](docs/03_验收/0.1.2_模型添加与逐个测试.md)
- [0.1.1 AI 配置修复](docs/03_验收/0.1.1_AI配置修复.md)

## 后续

AI 功能还有很多问题，这个项目我也很喜欢，后面会继续更新：先把真实 Key 下的成功路径跑通并补上验证记录，再处理闪退取证和打包。
