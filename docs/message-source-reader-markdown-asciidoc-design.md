# AskUser Popup 消息源阅读器 Markdown / AsciiDoc 双渲染设计

## 目标对象

消息源阅读器是 AskUser Popup 浏览器工作台详情区中用于展示 task 源文本、切换源文本解释器、切换源码/渲染投影、复制源文本、承载历史回复展示的前端人工制品。它消费 task DTO 中的 `markdown` 字段作为消息源文本，并向用户提供 Markdown 和 AsciiDoc 两种确定解释器。

消息源阅读器服务下列用户动作：

- 读取 agent 发来的消息源。
- 将同一消息源按 Markdown 解释。
- 将同一消息源按 AsciiDoc 解释。
- 设置没有当前 task 覆盖的默认解释器。
- 为当前 task 设置浏览器会话内的临时解释器覆盖。
- 在渲染投影和源码投影之间切换。
- 复制消息源原文。
- 查看 completed task 的用户回复。

消息源阅读器不进行标记语言自动识别。解释器选择只由持久阅读设置和当前 task 覆盖共同决定。

## 当前系统基线

当前项目是 `informuser-go`。`popup-mcp` 接收 MCP `AskUser` 工具调用，把任务注册到 `popupd` daemon。`popupd` 持有 SQLite 状态，提供 HTTP API，服务 React 浏览器工作台，并通过 WebSocket 推送任务事件。浏览器工作台包含左侧 task stream、右侧详情阅读区和可展开 reply panel。

当前详情阅读区由 `web/src/features/markdown/MarkdownReader.tsx` 承担。`App.tsx` 从 `readerTask.markdown` 取正文，把它传给 `MarkdownReader`。当前 task DTO、Go domain、HTTP DTO、SQLite schema 和前端 `Task` 类型均使用 `markdown` 字段保存 task 正文。

当前 Markdown 渲染链为：

```ts
ReactMarkdown + remarkGfm + rehypeSanitize
```

该链路已经形成安全边界：Markdown 源文本中的不可信 HTML 不得直接进入最终 DOM。AsciiDoc 渲染必须保持同等级别的 HTML 安全边界。

当前阅读设置保存在 `localStorage` 的 `askuser.markdownSettings`。旧设置结构包含：

```ts
type MarkdownSettings = {
  fontSize: number;
  lineHeight: 'compact' | 'normal' | 'relaxed';
  contentWidth: 'full' | 'reading' | 'narrow';
  raw: boolean;
};
```

该结构把投影模式 `raw` 混入持久阅读设置。消息源阅读器将投影模式从持久阅读设置中移出。投影模式属于当前浏览器阅读姿态，不属于默认解释器和排版设置。

当前 CSS 已由 `.markdown-reader`、`.raw-markdown`、`.reader-scroll` 和 `.reader-width-*` 处理长路径、长 URL、长 hash、宽表格和代码块溢出。新消息源阅读器必须保留这些页面级溢出边界。

## 术语

### 消息源

消息源是 task 中保存的原始正文字符串。当前 HTTP DTO 字段名是 `markdown`。前端 reader 的公共语义名称是 `source`。

前端代码在 reader 边界处完成命名转换：

```ts
const readerSource = readerTask?.markdown ?? fallbackMessage;
```

UI 文案不得把该文本继续称为 Markdown。公共按钮、状态文案和设置文案使用 `source`、`render language`、`reader` 等格式中立术语。

### 解释器

解释器是把消息源转换为渲染投影的语言处理器。解释器枚举封闭为：

```ts
type MarkupLanguage = 'markdown' | 'asciidoc';
```

`markdown` 使用 React Markdown 渲染链。`asciidoc` 使用 Asciidoctor.js 官方处理器。

### 默认解释器

默认解释器是持久阅读设置中的 `defaultLanguage`。它作用于没有当前 task 覆盖的 task。默认解释器保存在 `localStorage` 的 `askuser.readerSettings`。

### 当前 task 覆盖

当前 task 覆盖是当前浏览器运行状态中按 `task_id` 保存的解释器覆盖值。覆盖只存在于 React state，不写入 `localStorage`，不写入后端，不进入 task DTO。

### 投影模式

投影模式决定 reader 显示渲染结果还是源文本。投影模式枚举封闭为：

```ts
type ReaderProjection = 'rendered' | 'source';
```

`rendered` 投影调用当前有效解释器。`source` 投影直接显示消息源原文。

### 阅读设置

阅读设置是消息源阅读器的持久本地配置。阅读设置包含默认解释器和排版参数，不包含当前 task 覆盖，不包含投影模式。

### 源码投影

源码投影是消息源原文的纯文本显示。源码投影不调用 Markdown renderer，不调用 Asciidoctor，不生成 HTML 投影。

### 渲染投影

渲染投影是当前有效解释器对消息源产生的可阅读投影。Markdown 渲染投影由 React 组件树产生。AsciiDoc 渲染投影由 sanitized HTML 和 Shadow DOM 容器产生。

## 封闭类型

Reader 类型定义放在 `web/src/features/reader/types.ts`。

```ts
export type MarkupLanguage = 'markdown' | 'asciidoc';

export type ReaderProjection = 'rendered' | 'source';

export type ReaderWidth = 'full' | 'reading' | 'narrow';

export type ReaderLineHeight = 'compact' | 'normal' | 'relaxed';

export type ReaderSettings = {
  defaultLanguage: MarkupLanguage;
  fontSize: number;
  lineHeight: ReaderLineHeight;
  contentWidth: ReaderWidth;
};

export type ReaderLanguageOverrides = Record<string, MarkupLanguage>;
```

这些枚举没有 `auto` 值。消息源阅读器不根据文本内容猜测格式。

## 公共行为契约

### 全局阅读设置

阅读设置持久化在：

```text
askuser.readerSettings
```

默认值为：

```ts
export const defaultReaderSettings: ReaderSettings = {
  defaultLanguage: 'markdown',
  fontSize: 15,
  lineHeight: 'normal',
  contentWidth: 'reading',
};
```

修改 `defaultLanguage` 后，所有没有当前 task 覆盖的 reader 立即按新默认解释器重新渲染。修改 `defaultLanguage` 不清除当前 task 覆盖。修改 `defaultLanguage` 不改变投影模式。

修改 `fontSize`、`lineHeight`、`contentWidth` 后，Markdown 渲染投影、AsciiDoc 渲染投影和源码投影均使用新的排版参数。

### 旧设置迁移

启动时执行一次阅读设置归一化。归一化读取 `askuser.readerSettings` 和旧 key `askuser.markdownSettings`，输出唯一有效的 `ReaderSettings`。

归一化规则：

1. `askuser.readerSettings` 存在且结构有效时，使用该值。
2. `askuser.readerSettings` 存在但结构无效时，删除该 key。
3. `askuser.readerSettings` 不存在或已被删除时，读取 `askuser.markdownSettings`。
4. `askuser.markdownSettings` 存在且结构有效时，迁移 `fontSize`、`lineHeight`、`contentWidth`，并把 `defaultLanguage` 设为 `markdown`。
5. `askuser.markdownSettings` 中的 `raw` 不迁移。
6. 两个 key 均不存在或均无效时，使用 `defaultReaderSettings`。
7. 归一化结束后写入 `askuser.readerSettings`。
8. 归一化结束后删除 `askuser.markdownSettings`。

旧 key 是一次性迁移输入。归一化结束后，旧 key 从 localStorage 中删除。

### 当前 task 解释器覆盖

右侧 reader toolbar 的 Markdown / AsciiDoc 切换写入当前浏览器内存状态。覆盖键是 `task_id`。覆盖值是 `MarkupLanguage`。

覆盖规则：

- 当前 reader 没有 task id 时，不创建覆盖。
- 当前 reader 有 task id 时，切换解释器写入 `readerLanguageOverrides[task_id]`。
- 覆盖不写入 `localStorage`。
- 覆盖不写入后端。
- 覆盖不改变 `readerSettings.defaultLanguage`。
- 刷新页面后覆盖消失。
- 覆盖存在时，有效解释器来自覆盖。
- 覆盖不存在时，有效解释器来自 `readerSettings.defaultLanguage`。

有效解释器推导为：

```ts
const effectiveLanguage =
  readerTask?.task_id && readerLanguageOverrides[readerTask.task_id]
    ? readerLanguageOverrides[readerTask.task_id]
    : readerSettings.defaultLanguage;
```

### 投影模式

投影模式由 reader 组件所在页面状态保存。投影模式不写入阅读设置，不写入 task 覆盖，不写入后端。

`rendered` 显示当前有效解释器生成的投影。`source` 显示消息源纯文本。

投影模式切换规则：

- 切换到 `source` 不改变有效解释器。
- 切换到 `rendered` 不改变有效解释器。
- 修改默认解释器不改变投影模式。
- 设置当前 task 覆盖不改变投影模式。

### 复制行为

复制按钮的可见文案和可访问名称为：

```text
Copy source
```

复制内容永远是消息源原文。复制行为不受当前解释器影响，不受投影模式影响，不复制 completed task 的用户回复。

复制成功后按钮进入 `Copied` 状态，状态持续 1400ms。复制失败时使用现有 error banner 表达错误。

### 历史回复

completed task 的 `user_input` 显示在 reader 内容下方。用户回复区域是纯文本投影，不经过 Markdown renderer，不经过 Asciidoctor renderer，不进入 HTML 渲染管线。

用户回复区域保留现有视觉边界：它在 assistant source 之后展示，并用单独标题标识为用户回复。

## 状态模型

`App.tsx` 持有阅读器的应用级状态：

```ts
const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() =>
  loadReaderSettings(),
);

const [readerLanguageOverrides, setReaderLanguageOverrides] =
  useState<ReaderLanguageOverrides>({});

const [readerProjection, setReaderProjection] =
  useState<ReaderProjection>('rendered');
```

`readerSettings` 是持久状态。`readerLanguageOverrides` 是浏览器运行状态。`readerProjection` 是当前阅读姿态状态。

持久化 effect 只监听 `readerSettings`：

```ts
useEffect(() => {
  saveReaderSettings(readerSettings);
}, [readerSettings]);
```

该 effect 不写入 `readerLanguageOverrides`，不写入 `readerProjection`。

## 控制流

### 初始化阅读设置

初始化控制流：

1. 调用 `loadReaderSettings()`。
2. `loadReaderSettings()` 按旧设置迁移规则归一化 localStorage。
3. 初始化 `readerSettings`。
4. 初始化 `readerLanguageOverrides` 为空对象。
5. 初始化 `readerProjection` 为 `rendered`。
6. 根据当前 `readerTask` 和 `readerSettings.defaultLanguage` 推导 `effectiveLanguage`。

### 修改默认解释器

用户在 Reader settings dialog 中修改默认解释器时：

1. `ReaderSettingsDialog` 调用 `onSettingsChange`。
2. `App.tsx` 更新 `readerSettings.defaultLanguage`。
3. 持久化 effect 写入 `askuser.readerSettings`。
4. 删除旧 key 的责任已由初始化归一化承担。
5. 当前 task 没有覆盖时，`effectiveLanguage` 变为新的默认解释器。
6. 当前 task 有覆盖时，`effectiveLanguage` 保持覆盖值。

### 设置当前 task 覆盖

用户在 reader toolbar 中切换 Markdown / AsciiDoc 时：

1. `MessageReader` 要求存在 `taskId`。
2. `MessageReader` 调用 `onLanguageOverrideChange(taskId, language)`。
3. `App.tsx` 更新 `readerLanguageOverrides[taskId]`。
4. `App.tsx` 不修改 `readerSettings`。
5. `App.tsx` 不写 localStorage。
6. 当前 reader 按覆盖解释器重新渲染。

### 切换投影模式

用户在 reader toolbar 中切换 Rendered / Source 时：

1. `MessageReader` 调用 `onProjectionChange(projection)`。
2. `App.tsx` 更新 `readerProjection`。
3. `App.tsx` 不修改 `readerSettings`。
4. `App.tsx` 不修改 `readerLanguageOverrides`。
5. `readerProjection === 'source'` 时显示源码投影。
6. `readerProjection === 'rendered'` 时显示当前有效解释器渲染投影。

### 选择 task

用户在 task list 中选择 task 时：

1. 当前 `readerTask` 更新。
2. `readerProjection` 保持当前值。
3. `effectiveLanguage` 按新 `task_id` 查询 `readerLanguageOverrides`。
4. 新 task 有覆盖时使用覆盖解释器。
5. 新 task 无覆盖时使用 `readerSettings.defaultLanguage`。

## 文件与组件边界

Reader 相关代码位于：

```text
web/src/features/reader/
  MessageReader.tsx
  ReaderSettingsDialog.tsx
  ReaderLanguageControl.tsx
  MarkdownRenderer.tsx
  AsciiDocRenderer.tsx
  adoc-renderer.ts
  asciidoctor-default-css.ts
  settings.ts
  types.ts
```

### `types.ts`

`types.ts` 只定义 reader 类型、封闭枚举和共享 props 类型。它不读写 localStorage，不引用 React，不引用 Asciidoctor。

### `settings.ts`

`settings.ts` 只定义默认设置、localStorage key、读取、归一化、迁移、保存函数。

导出对象：

```ts
export const readerSettingsKey = 'askuser.readerSettings';
export const legacyMarkdownSettingsKey = 'askuser.markdownSettings';
export const defaultReaderSettings: ReaderSettings = {
  defaultLanguage: 'markdown',
  fontSize: 15,
  lineHeight: 'normal',
  contentWidth: 'reading',
};
export function loadReaderSettings(): ReaderSettings;
export function saveReaderSettings(settings: ReaderSettings): void;
```

`loadReaderSettings()` 负责删除旧 key。其他文件不得直接读取 `askuser.markdownSettings`。

### `MessageReader.tsx`

`MessageReader.tsx` 组合 reader toolbar、状态 banner、投影区域和历史回复区域。它不直接调用 Asciidoctor。它不直接读写 localStorage。

核心 props：

```ts
type MessageReaderProps = {
  source: string;
  taskId?: string;
  userInput?: string;
  canReply?: boolean;
  statusMessage?: string;
  settings: ReaderSettings;
  effectiveLanguage: MarkupLanguage;
  projection: ReaderProjection;
  hasLanguageOverride: boolean;
  onSettingsChange: (settings: ReaderSettings) => void;
  onLanguageOverrideChange: (taskId: string, language: MarkupLanguage) => void;
  onProjectionChange: (projection: ReaderProjection) => void;
  onOpenReply?: () => void;
  onOpenReplacement?: () => void;
  onCopySource?: (source: string) => Promise<void>;
};
```

### `ReaderSettingsDialog.tsx`

`ReaderSettingsDialog.tsx` 只编辑持久阅读设置。它包含默认解释器、字体、行高、内容宽度。它不编辑当前 task 覆盖，不编辑投影模式。

### `ReaderLanguageControl.tsx`

`ReaderLanguageControl.tsx` 只表达当前 task 的临时解释器切换。它接收 `effectiveLanguage` 和 `hasLanguageOverride`，并通过 `@radix-ui/react-toggle-group` 状态表达当前值。

### `MarkdownRenderer.tsx`

`MarkdownRenderer.tsx` 只负责 Markdown 源文本到 React 投影。它保留 `react-markdown`、`remark-gfm`、`rehype-sanitize`。

### `AsciiDocRenderer.tsx`

`AsciiDocRenderer.tsx` 只负责 AsciiDoc 渲染投影的 DOM 宿主、Shadow DOM、样式注入和 sanitized HTML 写入。它不读取全局 settings，不计算有效解释器。

### `adoc-renderer.ts`

`adoc-renderer.ts` 只负责 Asciidoctor 转换和 HTML sanitizer 调用。它输出 sanitized HTML 和官方 CSS 字符串。

导出形状：

```ts
export type AsciiDocRenderResult = {
  bodyHtml: string;
  styles: string;
};

export function renderAsciiDoc(source: string): AsciiDocRenderResult;
```

### `asciidoctor-default-css.ts`

`asciidoctor-default-css.ts` 只导出官方默认 CSS 字符串：

```ts
export const officialAsciidoctorDefaultCss = "/*! Asciidoctor default stylesheet | MIT License | https://asciidoctor.org */\n";
```

文件头注释必须包含：

```ts
// Generated from @asciidoctor/core <resolved-version> dist/css/asciidoctor.css.
// Do not edit this stylesheet by hand.
```

CSS 字符串不手工编辑。

## Markdown 渲染契约

Markdown renderer 使用：

```ts
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
```

渲染规则：

- 使用 `ReactMarkdown` 渲染。
- 启用 `remarkGfm`。
- 启用 `rehypeSanitize`。
- 不使用 `dangerouslySetInnerHTML`。
- 保留 GFM 表格渲染。
- 保留当前代码块内部横向滚动。
- 保留当前宽表格内部横向滚动。
- 保留长 token 的 `overflow-wrap: anywhere` 行为。

Markdown renderer 接收统一 reader style：

```ts
type RendererStyle = {
  '--reader-font-size': string;
  '--reader-line-height': number;
};
```

Markdown renderer 的根元素使用 `.markdown-reader`。

## AsciiDoc 渲染契约

### 依赖

`web/package.json` 增加生产依赖：

```json
{
  "dependencies": {
    "@asciidoctor/core": "3.0.4",
    "@radix-ui/react-toggle-group": "1.1.13",
    "dompurify": "3.4.11"
  }
}
```

`pnpm-lock.yaml` 是依赖解析的精确来源。`@asciidoctor/core` 的实际解析版本必须是 `3.0.4`。`asciidoctor-default-css.ts` 文件头注释中的版本必须是 `3.0.4`。

### Asciidoctor 处理器

`adoc-renderer.ts` 创建单例 processor：

```ts
import Asciidoctor from '@asciidoctor/core';

const processor = Asciidoctor();
```

转换调用：

```ts
const html = processor.convert(source, {
  safe: 'secure',
  standalone: false,
  attributes: { showtitle: '' },
}) as string;
```

`standalone: false` 使 Asciidoctor 返回正文片段，而不是完整 HTML 文档。消息源阅读器在应用面板内嵌入该片段，不接收完整 HTML 文档。

`safe: 'secure'` 降低 Asciidoctor 处理器权限。它不替代 DOM sanitizer。AsciiDoc passthrough 仍可能产生 HTML 片段，渲染器必须在写入 DOM 前执行 sanitizer。

### HTML sanitizer

AsciiDoc HTML 输出进入 DOM 前必须经过 DOM sanitizer。

Sanitizer 必须删除：

- `<script>` 标签。
- 事件属性，例如 `onclick`、`onerror`。
- `javascript:` URL。
- 其他浏览器可执行脚本入口。

Sanitizer 必须保留 Asciidoctor 文档结构所需的普通 HTML 表达：

- `h1` 到 `h6`
- `p`
- `div`
- `span`
- `a`
- `ul`
- `ol`
- `li`
- `dl`
- `dt`
- `dd`
- `table`
- `thead`
- `tbody`
- `tfoot`
- `tr`
- `th`
- `td`
- `pre`
- `code`
- `blockquote`
- `strong`
- `em`
- `hr`
- `br`
- `sup`
- `sub`
- `img`
- `class`
- `id`
- `href`
- `src`
- `alt`
- `title`
- `colspan`
- `rowspan`
- `style`

`style` 属性只允许在 sanitizer 的 CSS 安全规则下保留。若 sanitizer 配置不能保证 CSS 安全，`style` 属性不得保留。Asciidoctor 表格列宽可在缺少 inline style 时保持可读，安全边界优先于列宽还原。

### Shadow DOM

AsciiDoc 渲染投影必须使用 Shadow DOM。

`AsciiDocRenderer.tsx` 创建宿主：

```tsx
<div ref={shadowHostRef} className="asciidoc-reader-host" />
```

写入 Shadow DOM：

```ts
const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
shadowRoot.innerHTML = `
  <style>${officialAsciidoctorDefaultCss}</style>
  <style>${embeddedReaderCss}</style>
  <article class="asciidoc-render">
    ${bodyHtml}
  </article>
`;
```

`bodyHtml` 是 sanitizer 处理后的 HTML。未处理的 Asciidoctor 输出不得进入该模板。

官方 Asciidoctor CSS 不得注入 `document.head`，不得放入 `App.css`，不得通过全局 CSS import 加载。官方 CSS 内含 `body`、`#content`、`#header`、`table`、`h1` 等广泛选择器；全局注入会污染工作台壳层和 task list。

### Shadow DOM 内部适配 CSS

Shadow DOM 内部追加一段嵌入适配 CSS。该 CSS 只处理 reader 容器边界，不把官方主题改写为应用主题。

```css
:host {
  display: block;
  min-width: 0;
  color: #222;
  background: #fff;
}

.asciidoc-render {
  box-sizing: border-box;
  min-width: 0;
  font-size: var(--reader-font-size);
  line-height: var(--reader-line-height);
  overflow-wrap: anywhere;
}

#header,
#content,
#footnotes,
#footer {
  box-sizing: border-box;
  max-width: none;
  padding-left: 0;
  padding-right: 0;
}

#content {
  margin-top: 0;
}

pre,
table {
  max-width: 100%;
  overflow-x: auto;
}
```

`--reader-font-size` 和 `--reader-line-height` 设置在 host 元素上，进入 Shadow DOM 后由内部 `.asciidoc-render` 容器读取。

### 官方 CSS 生成

官方 CSS 来源为：

```text
node_modules/@asciidoctor/core/dist/css/asciidoctor.css
```

生成脚本读取该文件，把内容 JSON-stringify 后写入：

```text
web/src/features/reader/asciidoctor-default-css.ts
```

生成文件只包含注释和导出常量。生成文件不包含构建脚本逻辑。

生成文件中的版本号来自 `node_modules/@asciidoctor/core/package.json` 的 `version` 字段。由于该 package 的 `exports` 不暴露 `package.json`，脚本通过文件系统路径读取实际 package 文件。

## UI 与人因工程契约

### Reader toolbar

Reader toolbar 左侧显示：

```text
Task detail
Rendered as Markdown
```

副标题状态由 `projection`、`effectiveLanguage`、`hasLanguageOverride` 推导：

- `projection === 'source'`：`Source`
- `projection === 'rendered' && effectiveLanguage === 'markdown' && !hasLanguageOverride`：`Rendered as Markdown`
- `projection === 'rendered' && effectiveLanguage === 'asciidoc' && !hasLanguageOverride`：`Rendered as AsciiDoc`
- `projection === 'rendered' && effectiveLanguage === 'markdown' && hasLanguageOverride`：`Rendered as Markdown · Temporary`
- `projection === 'rendered' && effectiveLanguage === 'asciidoc' && hasLanguageOverride`：`Rendered as AsciiDoc · Temporary`

Reader toolbar 右侧动作顺序固定为：

1. `Reply`
2. `Copy source`
3. Markdown / AsciiDoc segmented control
4. Rendered / Source segmented control
5. Reader settings icon button

`Reply` 只在 pending task 上显示。`Copy source` 在存在 source 时显示。两个 segmented control 始终显示。Reader settings 始终显示。

### Segmented controls

互斥选项使用 `@radix-ui/react-toggle-group` 实现 segmented control。每个选项必须具备可访问名称和当前状态。

解释器 segmented control：

```text
Markdown | AsciiDoc
```

投影 segmented control：

```text
Rendered | Source
```

解释器 segmented control 写入当前 task 覆盖。投影 segmented control 写入 `readerProjection`。

两个 segmented control 不共享状态。两个 segmented control 不合并为一个四态控件。

### Reader settings dialog

Reader settings 使用 Dialog，不使用现有 280px popover。该 surface 承担持久阅读配置，内容超过单个小弹层控件集合。

Dialog 标题：

```text
Reader settings
```

Dialog 分组：

```text
Default render language
Reading layout
```

`Default render language` 包含 Markdown / AsciiDoc segmented control。该控件写入 `readerSettings.defaultLanguage`。

`Reading layout` 包含：

- Font size range，范围 `13` 到 `22`。
- Line height segmented control，值为 `compact`、`normal`、`relaxed`。
- Width segmented control，值为 `full`、`reading`、`narrow`。

Dialog 中不出现当前 task 临时解释器切换。当前 task 临时切换属于 reader toolbar。

Dialog 使用即时生效。Dialog 不提供 Save/Cancel。关闭 Dialog 不回滚已修改设置。

### Button text

原 `Copy Markdown` 改为：

```text
Copy source
```

原 raw/rendered 单按钮替换为 Rendered / Source segmented control。

原 `Markdown reading settings` tooltip 改为：

```text
Reader settings
```

### 可访问性

所有新增交互控件必须通过 role/name 定位。icon-only 按钮必须具备 `aria-label`。当前选项必须通过 Radix state attribute 表达。

键盘行为：

- Reader settings button 可通过键盘打开 Dialog。
- Dialog 打开后焦点进入 Dialog。
- `Escape` 关闭 Dialog。
- Segmented control 的选项可通过键盘聚焦和激活。

### 窄宽度行为

Reader toolbar 在窄宽度下允许换行，不允许文字覆盖控件，不允许控件溢出 reader 容器。控件最小宽度由内容决定，toolbar 使用 `display: flex` 和 `flex-wrap: wrap`。

按钮和 segmented control 的文本不得在控件内重叠。若宽度不足，toolbar 换行；不得通过缩小字体到不可读来维持单行。

## CSS 与布局契约

应用全局 CSS 负责工作台壳层、toolbar、Markdown 投影、source 投影和 Shadow DOM host。官方 Asciidoctor CSS 只在 Shadow DOM 内存在。

Reader 根结构：

```tsx
<section className="reader">
  <div className="reader-toolbar">
    <div className="reader-title" />
    <div className="reader-actions" />
  </div>
  <div className={`reader-scroll reader-width-${settings.contentWidth}`}>
    <article />
  </div>
</section>
```

投影根元素：

- Markdown：`.markdown-reader`
- AsciiDoc host：`.asciidoc-reader-host`
- Source：`.source-reader`

宽度规则：

```css
.reader-width-reading .markdown-reader,
.reader-width-reading .asciidoc-reader-host,
.reader-width-reading .source-reader {
  max-width: 900px;
}

.reader-width-narrow .markdown-reader,
.reader-width-narrow .asciidoc-reader-host,
.reader-width-narrow .source-reader {
  max-width: 720px;
}
```

三个投影根元素均 `margin: 0 auto`。`reader-width-full` 不设置 max-width。

源码投影使用 monospace：

```css
.source-reader {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: var(--mono);
  font-size: var(--reader-font-size);
  line-height: var(--reader-line-height);
}
```

AsciiDoc host 必须接受 reader CSS variables：

```css
.asciidoc-reader-host {
  min-width: 0;
  margin: 0 auto;
  font-size: var(--reader-font-size);
  line-height: var(--reader-line-height);
}
```

页面级横向滚动不得由 reader 内容产生。长 token、宽表、代码块只能在 reader 滚动区域或元素内部滚动。

## 后端和 API 边界

本设计不改变 Go domain、SQLite schema、HTTP DTO 和 MCP tool 的字段名。

后端保持：

```go
Markdown string `json:"markdown"`
```

HTTP create request 保持 `content` 与 `markdown` fallback 规则：

```go
markdown := r.Markdown
if markdown == "" {
    markdown = r.Content
}
```

前端在 reader 边界把 `task.markdown` 命名为 `source`。这是 UI 和前端 reader 语义转换，不是后端迁移。

MCP `AskUser` 输入仍使用 `content` 表达正文。外部调用方不需要提供格式字段。格式由用户在浏览器工作台手动控制。

## 错误与降级契约

### Markdown 渲染错误

Markdown renderer 抛出异常时，MessageReader 显示源码投影，并在现有 error banner 中显示错误。错误状态不得导致整个工作台崩溃。

### AsciiDoc 转换错误

Asciidoctor 转换抛出异常时，MessageReader 显示源码投影，并在现有 error banner 中显示错误。未完成转换的 HTML 不得进入 DOM。

### Sanitizer 不可用

Sanitizer 不可用时，AsciiDoc 渲染不得显示 unsanitized HTML。MessageReader 显示源码投影，并在现有 error banner 中显示错误。

### CSS 注入错误

官方 CSS 常量为空字符串时，AsciiDoc renderer 报错并显示源码投影。官方 CSS 常量非空时，renderer 将其注入 Shadow DOM。测试必须证明 CSS 常量包含 `Asciidoctor default stylesheet` 和 `.sect1`。

### Copy source 错误

`navigator.clipboard.writeText` 失败时，使用现有 error banner 显示错误。复制失败不改变 reader 状态。

## 测试契约

### Settings 单元测试

`settings.ts` 测试覆盖：

1. 无 localStorage 值时返回 `defaultReaderSettings` 并写入 `askuser.readerSettings`。
2. `askuser.readerSettings` 有效时返回该值。
3. `askuser.readerSettings` 无效时删除该 key。
4. `askuser.markdownSettings` 有效时迁移 `fontSize`、`lineHeight`、`contentWidth`。
5. 旧 `raw` 不进入迁移结果。
6. 迁移成功后删除 `askuser.markdownSettings`。
7. 两个 key 均无效时删除两个 key 并写入默认 settings。
8. `saveReaderSettings` 只写 `askuser.readerSettings`。

### Effective language 单元测试

有效解释器推导测试覆盖：

1. 无 task 覆盖时使用 `readerSettings.defaultLanguage`。
2. task 覆盖存在时使用覆盖值。
3. 修改默认解释器不改变已有 task 覆盖的有效解释器。
4. 不同 task id 的覆盖互不影响。

### Markdown renderer 测试

Markdown renderer 测试覆盖：

1. `# Title` 渲染为 heading。
2. GFM table 渲染为 table。
3. `<script>alert(1)</script>` 不进入 DOM。
4. inline code 使用 Markdown code 样式。
5. code block 保留代码文本。

### AsciiDoc renderer 单元测试

`adoc-renderer.ts` 测试覆盖：

1. `= Title` 渲染为 heading。
2. `NOTE: body` 渲染为 admonition block。
3. AsciiDoc table 渲染为 table。
4. source block 渲染为 `pre` / `code`。
5. `pass:[<img src=x onerror=alert(1)>]` 经过 sanitizer 后没有 `onerror`。
6. `pass:[<a href="javascript:alert(1)">bad</a>]` 经过 sanitizer 后没有 `javascript:` URL。
7. `<script>alert(1)</script>` 不进入 sanitized HTML。
8. `styles` 包含 `Asciidoctor default stylesheet`。
9. `styles` 包含 `.sect1`。

### AsciiDoc renderer 组件测试

`AsciiDocRenderer.tsx` 测试覆盖：

1. 渲染后 host 存在 shadowRoot。
2. shadowRoot 中存在 `.asciidoc-render`。
3. shadowRoot 中存在官方 CSS `<style>`。
4. shadowRoot 中存在嵌入适配 CSS `<style>`。
5. shadowRoot 中包含渲染后的 heading 文本。
6. document head 中不存在 Asciidoctor 官方 CSS。
7. 全局 document 查询不到 shadowRoot 内部 heading。

### MessageReader 组件测试

MessageReader 测试覆盖：

1. toolbar 显示 `Copy source`。
2. 点击 `Copy source` 调用 `onCopySource(source)`。
3. 点击 Markdown 选项调用 `onLanguageOverrideChange(taskId, 'markdown')`。
4. 点击 AsciiDoc 选项调用 `onLanguageOverrideChange(taskId, 'asciidoc')`。
5. 当前无 task id 时解释器切换不写覆盖。
6. 点击 Rendered 调用 `onProjectionChange('rendered')`。
7. 点击 Source 调用 `onProjectionChange('source')`。
8. `projection === 'source'` 时显示 `.source-reader`。
9. `projection === 'rendered' && effectiveLanguage === 'markdown'` 时使用 Markdown renderer。
10. `projection === 'rendered' && effectiveLanguage === 'asciidoc'` 时使用 AsciiDoc renderer。
11. completed task 的 `userInput` 显示为纯文本。
12. user reply 不参与 `Copy source`。

### App 集成测试

`App.test.tsx` 覆盖：

1. 初始化读取 `askuser.readerSettings`。
2. 初始化时迁移并删除 `askuser.markdownSettings`。
3. 默认解释器改成 AsciiDoc 后，未覆盖 task 按 AsciiDoc 渲染。
4. 当前 task 临时切回 Markdown 后，`askuser.readerSettings.defaultLanguage` 保持 AsciiDoc。
5. 选择另一个无覆盖 task 时使用默认 AsciiDoc。
6. Source 投影显示原文，Markdown renderer 和 AsciiDoc renderer 均不调用。
7. Copy source 复制 task markdown 原文。
8. error banner 显示复制失败。

### Playwright 验证

Playwright 覆盖：

1. 桌面宽度下 reader toolbar 控件不重叠。
2. 窄屏下 reader toolbar 换行后控件不溢出。
3. Reader settings dialog 可打开、切换默认解释器、关闭。
4. 设置默认 AsciiDoc 后，包含 `= Title` 的 task 以 AsciiDoc heading 显示。
5. 当前 task 临时切 Markdown 后，该 task 不再以 AsciiDoc heading 显示。
6. 切换另一个 task 后使用默认 AsciiDoc。
7. Source 投影显示原始 `= Title` 文本。
8. AsciiDoc 宽表不造成页面级横向滚动。
9. AsciiDoc 长代码块在 reader 内部滚动。
10. Markdown 长 URL 不造成页面级横向滚动。

### 验证命令

完成实现后运行：

```bash
pnpm --dir web check
pnpm --dir web test
pnpm --dir web build
pnpm --dir web test:e2e
```

若实现改动 Go 侧公共契约，运行：

```bash
go test ./...
```

## 代码注释要求

下列位置必须写注释：

- Shadow DOM 注入官方 CSS 的位置。注释说明官方 Asciidoctor CSS 含全局选择器，reader 使用 Shadow DOM 限定作用域。
- DOM sanitizer 调用位置。注释说明 Asciidoctor safe mode 不删除所有 passthrough HTML。
- 旧 settings 迁移位置。注释说明 `raw` 不迁移，因为投影模式不是持久阅读设置。
- 当前 task override 写入位置。注释说明 override 表达当前浏览器阅读动作，不是 task 元数据。
- `task.markdown` 到 `source` 的命名转换位置。注释说明后端字段保持既有 API，reader 公共语义不再限定 Markdown。

不得写解释代码表面行为的注释，例如“点击按钮时设置语言”。

## 验收标准

用户打开 AskUser Popup 后，右侧详情区默认使用 `askuser.readerSettings.defaultLanguage` 渲染 task 消息源。默认解释器初始值为 Markdown。用户在 Reader settings 中把默认解释器改为 AsciiDoc 后，没有当前 task 覆盖的 task 立即按 AsciiDoc 渲染；之后选择的无覆盖 task 也按 AsciiDoc 渲染。

用户在当前 task toolbar 中切换 Markdown / AsciiDoc 时，只改变该 task 在当前浏览器会话中的解释器覆盖。该覆盖不改变 Reader settings，不写入后端，不写入 localStorage。刷新页面后覆盖消失，默认解释器继续来自 Reader settings。

Rendered / Source 切换只改变投影模式。Source 投影永远显示消息源原文。Rendered 投影永远使用当前有效解释器。投影模式不改变默认解释器，不改变当前 task 覆盖。

Markdown 渲染继续支持 GFM 表格，并继续使用 `rehype-sanitize`。AsciiDoc 渲染使用 `@asciidoctor/core`，转换结果经过 DOM sanitizer 后进入 Shadow DOM。官方 Asciidoctor 默认 CSS 只存在于 Shadow DOM，不进入全局 CSS。危险 passthrough HTML 不得在最终 DOM 中保留事件属性、脚本标签和 `javascript:` URL。

`Copy source` 永远复制原始消息源，不受解释器和投影模式影响。completed task 的用户回复永远显示为纯文本，并且不进入复制内容。

所有新增控件在桌面和窄屏下不重叠、不撑破页面、不造成页面级横向滚动，并且具备可访问名称。测试覆盖阅读设置归一化、旧设置删除、有效解释器推导、当前 task 覆盖、源码/渲染投影、Markdown 安全渲染、AsciiDoc 安全渲染、Shadow DOM 样式隔离和浏览器布局。

## 依据

- Asciidoctor.js 官方文档：`https://docs.asciidoctor.org/asciidoctor.js/latest/`
- Asciidoctor 默认 stylesheet 文档：`https://docs.asciidoctor.org/asciidoctor/latest/html-backend/default-stylesheet/`
- Asciidoctor stylesheet modes 文档：`https://docs.asciidoctor.org/asciidoctor/latest/html-backend/stylesheet-modes/`
- Asciidoctor safe modes 文档：`https://docs.asciidoctor.org/asciidoctor/latest/safe-modes/`
