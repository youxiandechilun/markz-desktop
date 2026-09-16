# Markz SDK API

Markz 的核心编辑器可以独立运行在浏览器、Electron 或其他 DOM 容器中，不依赖 Electron API。

## Vanilla

```ts
import { createEditor, livePreview } from './src/sdk'
const editor = createEditor({ parent: element, value: '# Hello', extensions: [livePreview()] })
editor.onChange((source, compilation) => console.log(compilation.index.headings))
```

`NexusEditor` 提供 `value`、`ast`、`index`、`diagnostics`、`revisionNumber`、`getSelectedText()`、`setValue()`、`toHTML()`、`focus()` 和 `destroy()`。

## React

```tsx
import { Editor } from './src/sdk/react'
<Editor value="# Hello" onReady={(editor) => console.log(editor.index)} />
```

## 精确补丁

使用 `patchForNode` 生成带 `expectedText`、`expectedHash` 和 `expectedRevision` 的补丁，再交给 `applyPatch`。文档发生变化时会返回错误，不会覆盖用户输入。

## 插件与 Widget

编辑插件提供 CodeMirror `Extension`，语法插件提供 unified `Plugin`，渲染插件可变换 AST 并声明 Widget。Widget 通过 `widgetExtension` 挂载到编辑器视图。
