export const starterMarkdown = `# 把想法，写成文字

欢迎来到 Markz。一个安静的写作空间，留给思考，也留给你的 Markdown。

## 从一段文字开始

在左侧编辑原文，右侧查看结果。每一处空白、换行和标记，都属于你的文件。

> 好的工具让你专注内容，而不是工具本身。

## 让结构清晰起来

- [x] 原生 Markdown，本地保存
- [x] 通过大纲快速找到章节
- [ ] 连接你的 AI 写作服务

选中一段文字，再请 AI 润色、翻译或续写。修改会先展示给你，接受后才写入文档。

### 代码也能自在表达

\`\`\`typescript
function greet(name: string) {
  return \`你好，\${name}\`
}
\`\`\`

| 快捷键 | 操作 |
| --- | --- |
| Ctrl + S | 保存文档 |
| Ctrl + F | 查找与替换 |

## 接下来

打开一份已有的 .md 文件，或新建一页，开始写作。
`

export function htmlDocument(body: string, locale: string): string {
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https:"><title>Markdown document</title><style>body{max-width:780px;margin:56px auto;padding:0 24px;font:17px/1.8 system-ui,sans-serif;color:#263236}pre{background:#f2f4f3;padding:20px;overflow:auto;border-radius:8px}code{font-family:Consolas,monospace}blockquote{margin-left:0;border-left:3px solid #429477;padding-left:20px;color:#63716a}table{border-collapse:collapse;width:100%}th,td{padding:9px;border:1px solid #ddd}img{max-width:100%}a{color:#247658}</style></head><body>${body}</body></html>`
}
