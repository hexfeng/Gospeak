# Local-first AI Voice Input App PRD & Technical Architecture

## 0. 文档概述

### 0.1 产品定位

本产品是一款 **local-first、open-source、BYOK-first** 的 AI 语音输入应用。用户可以在任意桌面应用中按快捷键录音，系统自动完成语音转文字、AI 清理润色、格式化、语气改写，并将结果粘贴到当前光标位置。

产品目标不是完整复制 Typeless 的商业化体系，而是在个人使用和开源场景下，以更低成本实现其核心体验：

```text
按快捷键录音
→ STT 语音识别
→ AI 清理 / 润色 / 格式化
→ 根据 App / 模式调整语气
→ 粘贴到当前应用
```

### 0.2 产品原则

1. **Local-first**：本地 SQLite 是主数据源，应用离线可运行。
2. **BYOK-first**：用户使用自己的 OpenAI / Groq / Deepgram / Gemini / 本地模型配置。
3. **Privacy-first**：API Key、音频、输入历史默认不参与同步。
4. **Desktop-first**：优先支持 macOS / Windows，暂不做移动端输入法。
5. **Config-sync only**：可选同步用户词典、Prompt Profile、App Rules、模板和偏好设置。
6. **Open-source friendly**：不依赖强账号系统，不绑定自有云服务。
7. **Extensible provider architecture**：STT 和 LLM 均采用 Provider Adapter 设计。

---

# 1. 产品目标

## 1.1 核心目标

构建一个开源个人 AI 语音输入工具，实现：

* 快捷键录音；
* 语音转写；
* AI 自动清理口语；
* 去 filler words；
* 去重复；
* 自动标点；
* 自动段落格式化；
* 中英混合支持；
* 个人词典纠错；
* Prompt Profile；
* App-specific 输出风格；
* 选中文本后语音编辑；
* 本地配置管理；
* 可选配置同步。

## 1.2 非目标

MVP 阶段不做：

* 移动端 AI keyboard；
* 商业订阅系统；
* 用户账号系统；
* 团队管理；
* 云端历史记录；
* 音频同步；
* 实时多人协作；
* 完整 SaaS 后台；
* 浏览器插件；
* 复杂 CRDT 实时同步。

---

# 2. 目标用户

## 2.1 核心用户

### A. 高频办公用户

典型场景：

* 写邮件；
* 写 Slack / Teams 消息；
* 写 Notion 文档；
* 写会议纪要；
* 写 ChatGPT / Claude prompt。

核心需求：

* 更快输入；
* 自动润色；
* 输出更专业；
* 减少键盘输入成本。

### B. 开发者 / 技术用户

典型场景：

* 在 Cursor / VS Code 中通过语音描述代码修改；
* 在 ChatGPT / Claude Code 中生成结构化 prompt；
* 快速写 issue、commit message、PR description；
* 中英混合技术表达。

核心需求：

* 支持技术术语；
* 支持自定义 prompt profile；
* 支持 BYOK；
* 支持本地优先和隐私控制。

### C. 中英混合办公用户

典型场景：

* 中文思考，英文输出；
* 中英混合会议纪要；
* 中英混合术语保留；
* 中文语音生成英文邮件。

核心需求：

* 保留专有名词；
* 支持翻译模式；
* 支持个人词典；
* 支持不同输出语言。

---

# 3. 使用场景

## 3.1 普通语音输入

用户在任意 App 中按快捷键，说一段话，松开后自动转写、清理并插入当前光标位置。

示例：

用户说：

```text
嗯帮我写一下这个邮件就是说我今天下午可能晚一点到然后如果会议可以推迟到三点就更好
```

输出：

```text
Hi,

I may arrive a bit later this afternoon. If possible, could we move the meeting to 3:00 PM?

Thanks.
```

## 3.2 中英混合输入

用户说：

```text
帮我整理一下这个AI Agent security project的next steps，主要包括permission control，runtime monitoring，还有risk assessment framework
```

输出：

```text
Next steps for the AI Agent Security project:

1. Define the permission control mechanism.
2. Design the runtime monitoring workflow.
3. Build the risk assessment framework.
```

## 3.3 Prompt Mode

用户在 ChatGPT / Claude 中说：

```text
帮我分析这个personal finance dashboard的技术方案，重点看SimpleFIN Bridge，market data API，还有valuation engine
```

输出：

```text
Analyze the technical architecture for a personal finance dashboard.

Focus areas:
1. SimpleFIN Bridge integration for bank and credit card data.
2. Market data API design for stocks, ETFs, and gold.
3. Valuation engine for daily net worth and return calculation.

Please evaluate feasibility, architecture, risks, and implementation roadmap.
```

## 3.4 选中文本后语音编辑

用户选中一段文本，然后按快捷键说：

```text
缩短一点，更适合发给hiring manager
```

系统读取选中文本，调用 LLM 改写，并替换原文本。

## 3.5 App-aware 输出

不同 App 使用不同默认 Profile：

| App               | 默认 Profile            |
| ----------------- | --------------------- |
| Gmail / Outlook   | Professional Email    |
| Slack / Teams     | Concise Work Chat     |
| ChatGPT / Claude  | Structured Prompt     |
| Cursor / VS Code  | Technical Instruction |
| Notion / Obsidian | Clean Notes           |
| Browser Input     | General Writing       |

---

# 4. MVP 功能范围

## 4.1 MVP 功能列表

### P0：必须实现

| 模块                  | 功能        | 说明                                          |
| ------------------- | --------- | ------------------------------------------- |
| Global Hotkey       | 全局快捷键录音   | 按住录音 / 再按停止，两种模式可配置                         |
| Audio Capture       | 麦克风录音     | 支持 macOS / Windows                          |
| STT Adapter         | 语音转文字     | 支持至少一个云 STT Provider                        |
| AI Rewrite          | 文本清理润色    | 去 filler、去重复、标点、格式化                         |
| Clipboard Injection | 粘贴到当前 App | 通过剪贴板粘贴到光标位置                                |
| Prompt Profile      | 输出模式      | Normal / Email / Prompt / Translate         |
| Personal Dictionary | 个人词典      | 用户可维护术语映射                                   |
| Local Storage       | 本地存储      | SQLite                                      |
| API Key Storage     | 本地密钥存储    | macOS Keychain / Windows Credential Manager |
| Settings UI         | 设置页面      | Provider、快捷键、Profile、隐私                     |
| Export / Import     | 配置导入导出    | JSON 文件，不包含 API key                         |

### P1：MVP+ 推荐实现

| 模块             | 功能              | 说明                |
| -------------- | --------------- | ----------------- |
| VAD            | 静音检测            | 自动停止录音或截断音频       |
| App Context    | 前台 App 检测       | 根据 App 选择 Profile |
| Speak to Edit  | 选中文本语音编辑        | 读取选中文本，按语音命令改写    |
| Cost Dashboard | 成本统计            | 统计 STT / LLM 调用成本 |

### P2：后续版本

| 模块                    | 功能        | 说明                    |
| --------------------- | --------- | --------------------- |
| Local Whisper         | 本地 STT fallback | 隐私模式或离线模式         |
| Sync Folder           | 加密 sync.json | 用户选择同步文件夹         |
| WebDAV Sync           | WebDAV 同步 | Nextcloud / NAS / 自托管 |
| Streaming STT         | 流式转写      | 降低体感延迟                |
| Native Text Injection | 原生文本注入    | 替代剪贴板粘贴               |
| Mobile Companion      | 移动端辅助 App | 不是输入法，先同步配置           |
| Plugin Profiles       | App 专用扩展  | Gmail、Cursor、Notion 等 |

---

# 5. 用户流程

## 5.1 首次启动流程

```text
启动应用
→ 请求麦克风权限
→ 请求 Accessibility / Automation 权限
→ 设置全局快捷键
→ 选择 STT Provider
→ 输入 API Key
→ 选择默认 LLM Provider
→ 进入主界面
```

## 5.2 普通语音输入流程

```text
用户聚焦任意输入框
→ 按快捷键开始录音
→ 系统显示浮动录音窗口
→ 用户说话
→ 松开快捷键 / 点击停止
→ STT 转写
→ AI 后处理
→ 复制结果到剪贴板
→ 自动粘贴
→ 恢复用户原剪贴板内容，可选
```

## 5.3 语音编辑流程

```text
用户选中一段文本
→ 按快捷键
→ 说出编辑指令
→ 系统读取选中文本
→ STT 识别编辑指令
→ LLM 基于选中文本和指令改写
→ 替换选中文本
```

## 5.4 配置同步流程

```text
用户开启 Sync Folder
→ 选择本地同步文件夹
→ 设置同步加密密码
→ 系统导出 encrypted sync.json
→ 云盘 / Syncthing 负责传输
→ 其他设备读取 sync.json
→ 用户输入同一同步密码
→ 合并到本地 SQLite
```

---

# 6. 功能需求详情

## 6.1 全局快捷键

### 功能说明

用户可以设置一个全局快捷键，在任意应用内触发录音。

### 支持模式

| 模式           | 说明            |
| ------------ | ------------- |
| Push-to-talk | 按住录音，松开结束     |
| Toggle       | 按一次开始，再按一次结束  |
| Manual Stop  | 按快捷键开始，点击浮窗停止 |

### 默认配置

```text
macOS: Option + Space
Windows: Alt + Space
```

需要允许用户修改，因为容易和系统快捷键冲突。

---

## 6.2 录音与 VAD

### MVP

MVP 可以先做手动停止录音。

### MVP+

加入 VAD：

```text
检测连续 800–1200ms 静音
→ 自动结束录音
```

### 音频格式

推荐内部统一为：

```text
16kHz / 24kHz
mono
wav or flac
```

---

## 6.3 STT Provider

### Provider Interface

```ts
interface STTProvider {
  id: string;
  name: string;
  transcribe(input: {
    audioPath: string;
    language?: string;
    prompt?: string;
    model?: string;
  }): Promise<{
    text: string;
    language?: string;
    durationMs: number;
    cost?: number;
    raw?: unknown;
  }>;
}
```

### 首批支持

| Provider          | 用途               |
| ----------------- | ---------------- |
| OpenAI Transcribe | 高质量通用转写          |
| Groq Whisper      | 低成本低延迟           |
| Deepgram          | 可选流式能力           |
| Local Whisper     | 隐私 / 离线 fallback |

### Provider Router

```text
普通短音频 → Groq Whisper
高准确率 → OpenAI Transcribe
实时/流式 → Deepgram
隐私模式 → Local Whisper
```

MVP 可先只接入 OpenAI 或 Groq。

---

## 6.4 LLM Rewrite Engine

### 功能

对 STT 输出文本进行后处理：

* 去口头禅；
* 去重复；
* 补标点；
* 分段；
* bullet points 格式化；
* 邮件格式化；
* 翻译；
* 语气调整；
* 保留专业术语；
* 结合用户词典纠错。

### Provider Interface

```ts
interface RewriteProvider {
  id: string;
  name: string;
  rewrite(input: {
    transcript: string;
    profile: PromptProfile;
    dictionaryTerms?: DictionaryTerm[];
    appContext?: AppContext;
    selectedText?: string;
    instruction?: string;
  }): Promise<{
    text: string;
    cost?: number;
    raw?: unknown;
  }>;
}
```

### 默认 Profiles

#### Normal

用于普通输入：

```text
Clean the transcript into natural written text.
Remove filler words, false starts, and repetitions.
Preserve the user's meaning exactly.
Add punctuation and paragraph breaks.
Do not add new facts.
Preserve mixed Chinese-English terms.
```

#### Email

用于邮件：

```text
Rewrite the transcript as a concise professional email.
Preserve all factual details.
Use a polite but direct tone.
If action items exist, format them clearly.
Do not make the message overly formal.
```

#### Prompt

用于 AI prompt：

```text
Convert the transcript into a clear instruction for an AI assistant.
Structure it with goal, context, constraints, and expected output.
Preserve technical terms.
Do not over-explain.
```

#### Translate

用于翻译：

```text
Translate the transcript into the target language.
Preserve proper nouns and technical terms.
Use natural professional wording.
Do not add new information.
```

---

## 6.5 个人词典

### 目标

提升专有名词、公司名、项目名、人名、技术术语识别质量。

### 示例

```json
{
  "spoken": "图灵研究所",
  "written": "Turing Research Center",
  "aliases": ["TRC", "滑铁卢图灵研究所"],
  "tags": ["work", "research"]
}
```

### 词典应用方式

两层处理：

1. **Prompt 注入**：把相关词典项传入 LLM rewrite prompt；
2. **规则替换**：对明显错误的词做 deterministic replacement。

### UI 功能

* 新增词条；
* 编辑词条；
* 删除词条；
* 标签分类；
* 导入导出；
* 启用 / 禁用某条词典项。

---

## 6.6 App-aware Rules

### 目标

根据当前前台应用自动选择 Profile。

### App Context

```ts
interface AppContext {
  appName: string;
  bundleId?: string;
  processName?: string;
  windowTitle?: string;
  url?: string;
}
```

### Rule 示例

```json
{
  "app_identifier": "Gmail",
  "match_type": "window_title_contains",
  "pattern": "Gmail",
  "default_profile_id": "profile_email_professional"
}
```

### MVP 实现

先只检测：

* macOS app bundle ID；
* Windows process name；
* 当前窗口标题。

暂不做深度 DOM / 浏览器插件。

---

## 6.7 选中文本语音编辑

### 功能

用户选中一段文本，说出修改指令，系统替换选中文本。

### 流程

```text
保存当前剪贴板
→ 模拟 Copy
→ 获取选中文本
→ 录音获取用户修改指令
→ STT
→ LLM 根据 selectedText + instruction 改写
→ 粘贴替换
→ 可选恢复原剪贴板
```

### 示例

选中文本：

```text
Looking forward, I would like to share our vision and mission for Turing research center will all of you.
```

用户说：

```text
优化一下语法，保持正式但不要太长
```

输出：

```text
Looking ahead, I would like to share our vision and mission for the Turing Research Center with all of you.
```

---

## 6.8 配置导入导出

### 导出内容

```text
dictionary
prompt_profiles
app_rules
templates
preferences
```

### 不导出内容

```text
api_keys
raw_audio
transcript_history
logs
device_tokens
```

### 文件格式

```json
{
  "schema_version": 1,
  "exported_at": "2026-06-10T12:00:00Z",
  "device_id": "device_macbook_xxx",
  "data": {
    "dictionary_terms": [],
    "prompt_profiles": [],
    "app_rules": [],
    "templates": [],
    "preferences": []
  }
}
```

---

## 6.9 可选同步

### 同步原则

```text
Local DB = source of truth
Sync file = exchange artifact
Cloud drive / WebDAV = transport layer
```

### 同步内容

同步：

```text
用户词典
Prompt Profile
App Rules
模板
非敏感偏好
```

不默认同步：

```text
API Key
原始音频
转写历史
日志
```

### 同步方式

#### V1：Sync Folder

```text
用户选择一个本地文件夹
→ 应用生成 encrypted sync.json
→ iCloud / Google Drive / OneDrive / Dropbox / Syncthing 负责同步
```

#### V2：WebDAV

```text
应用连接 WebDAV URL
→ 下载 encrypted sync.json
→ 合并本地 SQLite
→ 上传更新后的 sync.json
```

### 加密

推荐默认加密：

```text
Passphrase
→ Argon2id KDF
→ XChaCha20-Poly1305 / AES-GCM
→ encrypted sync payload
```

---

# 7. 非功能需求

## 7.1 性能

| 指标             | 目标                 |
| -------------- | ------------------ |
| 普通输入端到端延迟      | 2–5 秒              |
| 短音频 STT 延迟     | < 2 秒，取决于 provider |
| LLM Rewrite 延迟 | < 2 秒              |
| 应用冷启动          | < 3 秒              |
| 设置页响应          | < 200ms            |
| 本地 DB 查询       | < 100ms            |

## 7.2 隐私

默认策略：

```text
No audio saved.
No transcript history synced.
No API key synced.
No server-side account required.
```

必须提供：

* History Off；
* Local-only Mode；
* Cloud Provider Warning；
* Clear Local Data；
* Export / Delete Config。

## 7.3 安全

* API Key 使用系统安全存储；
* 配置同步文件默认加密；
* 日志不得记录 API Key；
* 日志不得默认记录音频路径和完整转写文本；
* Provider 请求失败时不得把敏感内容写入 crash report。

## 7.4 可用性

* 支持快捷键冲突检测；
* 权限缺失时给出明确引导；
* STT / LLM 失败时提供 retry；
* 粘贴失败时将结果保留在剪贴板；
* 用户可查看最近一次 raw transcript 和 polished text；
* 支持撤销最近一次粘贴，若技术上可行。

---

# 8. MVP 架构

## 8.1 MVP 总体架构

```text
┌─────────────────────────────────────────────────────────────┐
│                       Desktop App                           │
│                 Tauri / Electron / Native                   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     Interaction Layer                       │
│  Global Hotkey │ Floating Recorder │ Settings UI │ Tray UI   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                       Audio Layer                           │
│        Microphone Capture │ Audio Encoding │ VAD             │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                         STT Layer                           │
│     OpenAI Adapter │ Groq Adapter │ Deepgram │ Local Whisper │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Rewrite Engine Layer                     │
│  Prompt Profile │ Dictionary Injection │ App Context Rules   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     Text Injection Layer                    │
│        Clipboard Paste │ Selection Replace │ Fallback Copy   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      Storage Layer                          │
│       SQLite │ OS Keychain │ Config Export │ Sync JSON       │
└─────────────────────────────────────────────────────────────┘
```

## 8.2 MVP 请求链路

```text
1. User presses global hotkey
2. App starts recording audio
3. User releases hotkey
4. Audio saved to temporary local file
5. STT Provider transcribes audio
6. Rewrite Engine loads:
   - selected profile
   - dictionary terms
   - app context
7. LLM returns polished text
8. Text Injection Layer pastes result
9. Local usage stats updated
10. Temporary audio deleted
```

## 8.3 MVP 关键模块

### Desktop Shell

职责：

* 系统托盘；
* 快捷键监听；
* 设置页面；
* 权限管理；
* 浮动录音状态。

### Audio Service

职责：

* 麦克风采集；
* 音频编码；
* 临时文件管理；
* VAD；
* 音频删除。

### STT Service

职责：

* Provider 路由；
* 语音转写；
* 错误重试；
* 成本统计；
* provider 配置管理。

### Rewrite Service

职责：

* Prompt Profile 管理；
* 词典注入；
* App Rule 匹配；
* LLM 调用；
* 输出校验。

### Injection Service

职责：

* 粘贴结果；
* 替换选中文本；
* 恢复剪贴板；
* 粘贴失败 fallback。

### Storage Service

职责：

* SQLite CRUD；
* API Key 安全存储；
* 导入导出；
* sync.json 生成和合并。

---

# 9. 技术架构

## 9.1 推荐技术栈

### 首选方案：Tauri

| 层             | 技术                                   |
| ------------- | ------------------------------------ |
| Desktop Shell | Tauri                                |
| UI            | React + TypeScript                   |
| Backend       | Rust                                 |
| Local DB      | SQLite                               |
| Key Storage   | keyring crate / OS Keychain          |
| Audio         | CPAL / rodio / platform API          |
| Hotkey        | tauri-plugin-global-shortcut         |
| Clipboard     | tauri clipboard plugin / native API  |
| HTTP Client   | reqwest                              |
| Encryption    | age / libsodium / ring               |
| Local Whisper | whisper.cpp / faster-whisper sidecar |

优点：

* 体积小；
* 性能好；
* 跨平台；
* 适合开源分发；
* 本地能力较强。

缺点：

* 系统权限和音频处理需要更多 native 处理；
* Rust 学习成本高于 Electron。

### 备选方案：Electron

| 层             | 技术                          |
| ------------- | --------------------------- |
| Desktop Shell | Electron                    |
| UI            | React + TypeScript          |
| Backend       | Node.js                     |
| Local DB      | better-sqlite3              |
| Key Storage   | keytar                      |
| Audio         | node-record-lpcm16 / ffmpeg |
| Hotkey        | globalShortcut              |
| Clipboard     | Electron clipboard          |
| HTTP Client   | fetch / axios               |

优点：

* 开发快；
* 生态丰富；
* JS/TS 全栈统一。

缺点：

* App 体积大；
* 内存占用高；
* 系统级体验不如 native；
* 开源桌面工具质感略差。

### 推荐结论

如果目标是个人快速验证：**Electron 更快**。
如果目标是长期维护的开源桌面应用：**Tauri 更优**。

建议：

```text
Prototype: Electron
Production Open-source App: Tauri
```

---

## 9.2 Provider Adapter 架构

### STT Adapter

```ts
export interface STTProvider {
  id: string;
  displayName: string;
  supportedModels: string[];

  transcribe(input: STTInput): Promise<STTResult>;
}

export interface STTInput {
  audioPath: string;
  language?: string;
  model?: string;
  prompt?: string;
}

export interface STTResult {
  text: string;
  language?: string;
  durationMs: number;
  usage?: {
    audioSeconds: number;
    estimatedCost?: number;
  };
  raw?: unknown;
}
```

### LLM Adapter

```ts
export interface LLMProvider {
  id: string;
  displayName: string;
  supportedModels: string[];

  complete(input: LLMInput): Promise<LLMResult>;
}

export interface LLMInput {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResult {
  text: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    estimatedCost?: number;
  };
  raw?: unknown;
}
```

### Provider Registry

```ts
const sttProviders = {
  openai: new OpenAITranscribeProvider(),
  groq: new GroqWhisperProvider(),
  deepgram: new DeepgramProvider(),
  localWhisper: new LocalWhisperProvider()
};

const llmProviders = {
  openai: new OpenAILLMProvider(),
  gemini: new GeminiProvider(),
  anthropic: new AnthropicProvider(),
  local: new LocalLLMProvider()
};
```

---

# 10. 数据架构

## 10.1 SQLite 表设计

### dictionary_terms

```sql
CREATE TABLE dictionary_terms (
  id TEXT PRIMARY KEY,
  spoken TEXT NOT NULL,
  written TEXT NOT NULL,
  aliases TEXT,
  tags TEXT,
  enabled INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
```

### prompt_profiles

```sql
CREATE TABLE prompt_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  mode TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  user_prompt_template TEXT,
  target_language TEXT,
  enabled INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
```

### app_rules

```sql
CREATE TABLE app_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  match_type TEXT NOT NULL,
  pattern TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  priority INTEGER DEFAULT 100,
  enabled INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
```

### templates

```sql
CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT,
  enabled INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
```

### preferences

```sql
CREATE TABLE preferences (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### usage_events

```sql
CREATE TABLE usage_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  stt_provider TEXT,
  stt_model TEXT,
  llm_provider TEXT,
  llm_model TEXT,
  audio_seconds REAL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  estimated_cost REAL,
  created_at TEXT NOT NULL
);
```

### transcript_history，可选

默认不启用。

```sql
CREATE TABLE transcript_history (
  id TEXT PRIMARY KEY,
  raw_transcript TEXT,
  polished_text TEXT,
  app_context TEXT,
  profile_id TEXT,
  created_at TEXT NOT NULL
);
```

---

## 10.2 API Key 存储

API Key 不进 SQLite，不导出，不同步。

存储位置：

| 平台      | 存储                 |
| ------- | ------------------ |
| macOS   | Keychain           |
| Windows | Credential Manager |
| Linux   | Secret Service     |
| iOS     | Keychain           |
| Android | Keystore           |

本地 preferences 只保存：

```json
{
  "default_stt_provider": "groq",
  "default_stt_model": "whisper-large-v3-turbo",
  "default_llm_provider": "openai",
  "default_llm_model": "gpt-4o-mini"
}
```

不保存：

```json
{
  "api_key": "..."
}
```

---

# 11. 同步架构

## 11.1 同步策略

同步设计采用：

```text
Local-first + optional encrypted config sync
```

原则：

```text
SQLite = source of truth
sync.json = exchange format
Cloud drive / WebDAV = transport only
```

## 11.2 同步范围

### 同步

```text
dictionary_terms
prompt_profiles
app_rules
templates
preferences
```

### 默认不同步

```text
api_keys
raw_audio
transcript_history
logs
usage_events
```

## 11.3 sync.json 结构

```json
{
  "schema_version": 1,
  "exported_at": "2026-06-10T12:00:00Z",
  "device_id": "device_macbook_xxx",
  "data": {
    "dictionary_terms": [],
    "prompt_profiles": [],
    "app_rules": [],
    "templates": [],
    "preferences": []
  }
}
```

## 11.4 加密结构

```json
{
  "schema_version": 1,
  "encrypted": true,
  "encryption": {
    "algorithm": "xchacha20-poly1305",
    "kdf": "argon2id",
    "salt": "...",
    "nonce": "..."
  },
  "ciphertext": "..."
}
```

## 11.5 冲突处理

### Last Write Wins

适用于：

```text
preferences
app_rules
```

规则：

```text
updated_at 最新的记录覆盖旧记录
```

### Merge by ID

适用于：

```text
dictionary_terms
templates
prompt_profiles
```

规则：

```text
相同 id 比较 updated_at
不同 id 合并
deleted_at 非空表示删除
```

### Conflict Copy

适用于 prompt profile：

```text
Professional Email
Professional Email - Conflict from Windows
```

## 11.6 删除同步

采用 soft delete：

```json
{
  "id": "dict_xxx",
  "deleted_at": "2026-06-10T12:00:00Z"
}
```

物理删除可在 30 天后执行。

---

# 12. 安全与隐私架构

## 12.1 默认隐私设置

```text
Save raw audio: Off
Save transcript history: Off
Sync transcript history: Off
Sync API keys: Never
Crash report includes transcript: Never
```

## 12.2 临时文件策略

```text
录音文件只存放在 temp directory
STT 完成后立即删除
异常退出后下次启动清理 temp audio
```

## 12.3 日志策略

日志允许记录：

```text
provider name
model name
duration
latency
error code
estimated cost
```

日志不允许默认记录：

```text
API key
raw audio
full transcript
polished text
selected text
```

## 12.4 Provider 风险提示

当用户启用云端 STT / LLM 时，设置页提示：

```text
Your audio or transcript may be sent to the selected provider for processing.
Review the provider's data retention and privacy policy before use.
```

---

# 13. 错误处理

## 13.1 STT 失败

处理方式：

```text
显示错误
保留音频直到用户关闭错误提示
允许 retry
允许切换 provider retry
```

## 13.2 LLM Rewrite 失败

处理方式：

```text
fallback 到 raw transcript
提示 AI rewrite failed
允许复制 raw transcript
```

## 13.3 粘贴失败

处理方式：

```text
文本保留在剪贴板
显示 “Paste failed, text copied to clipboard”
```

## 13.4 同步失败

处理方式：

```text
不影响本地主流程
显示最近一次同步状态
保留本地变更
下次自动 retry
```

---

# 14. MVP 页面设计

## 14.1 Tray Menu

```text
Start Dictation
Current Mode: Normal
Switch Profile
Open Settings
Open Dictionary
Open History
Sync Now
Quit
```

## 14.2 Floating Recorder

状态：

```text
Idle
Recording
Transcribing
Rewriting
Pasting
Done
Error
```

显示信息：

```text
Recording...
Transcribing with Groq Whisper...
Polishing with GPT-4o-mini...
Pasted.
```

## 14.3 Settings

页面：

1. General；
2. Hotkey；
3. Providers；
4. Profiles；
5. Dictionary；
6. App Rules；
7. Sync；
8. Privacy；
9. Usage / Cost；
10. Advanced。

## 14.4 Dictionary UI

字段：

```text
Spoken form
Written form
Aliases
Tags
Enabled
```

## 14.5 Profile UI

字段：

```text
Profile name
Mode
System prompt
User prompt template
Target language
Default apps
Enabled
```

---

# 15. MVP 开发路线图

## Phase 0：技术验证，3–5 天

目标：验证核心链路可行。

### Deliverables

* 全局快捷键；
* 录音；
* 调用一个 STT Provider；
* 调用一个 LLM Provider；
* 粘贴到当前 App；
* 简单命令行或最小 UI。

### 验收标准

```text
在任意文本框中按快捷键说话
→ 3–8 秒内插入润色后的文本
```

---

## Phase 1：MVP Alpha，2–3 周

目标：形成个人可用版本。

### 功能

* Desktop App Shell；
* Tray Menu；
* Floating Recorder；
* Global Hotkey；
* Audio Recording；
* STT Provider：OpenAI or Groq；
* LLM Provider：OpenAI or Gemini；
* Normal / Email / Prompt / Translate Profile；
* Clipboard Paste；
* Settings UI；
* API Key 本地安全存储；
* SQLite；
* Dictionary CRUD；
* Config Export / Import。

### 验收标准

1. 用户可完成首轮配置；
2. 可在 Gmail、Slack、ChatGPT、Notion、Cursor 输入；
3. 可维护个人词典；
4. 可切换 Profile；
5. 可导出和导入配置；
6. API key 不进入 SQLite 和导出文件。

---

## Phase 2：MVP Beta，3–5 周

目标：接近 Typeless L1 + L2 的核心体验。

### 功能

* VAD 静音检测；
* App Context 检测；
* App-aware Profile；
* Speak to Edit；
* Cost Dashboard；
* 多 Provider Adapter；
* 错误 retry；
* 日志和诊断；
* 历史记录可选开启；
* 剪贴板恢复策略。

### 验收标准

1. App 可根据 Gmail / Slack / ChatGPT 自动切换 Profile；
2. 用户可选中文本后语音改写；
3. 用户可看到每次调用成本估算；
4. STT 或 LLM 失败时有可理解 fallback；
5. 隐私设置可控制历史记录。

---

## Phase 3：Local-first Sync，2–4 周

目标：实现可选配置同步。

### 功能

* sync.json 生成；
* encrypted sync.json；
* 用户选择 Sync Folder；
* 自动同步；
* 手动 Sync Now；
* merge by ID；
* soft delete；
* conflict copy；
* 同步状态展示。

### 验收标准

1. Mac 和 Windows 可通过云盘文件夹同步词典和 Profile；
2. API Key 不被同步；
3. 音频和历史不被同步；
4. 同步冲突不会直接丢数据；
5. 同步失败不影响本地使用。

---

## Phase 4：WebDAV Sync，2–3 周

目标：支持开源用户和自托管用户。

### 功能

* WebDAV URL 配置；
* username / app password；
* PROPFIND / GET / PUT / MKCOL；
* 远程 sync.json 下载上传；
* ETag 或 updated_at 冲突检测；
* retry；
* sync status。

### 验收标准

1. 支持 Nextcloud；
2. 支持 Synology WebDAV；
3. 支持加密 sync.json；
4. 网络失败可恢复；
5. 本地变更不会丢失。

---

## Phase 5：体验优化，持续迭代

目标：提升稳定性和低延迟体验。

### 功能

* Streaming STT；
* raw transcript 先插入、polished text 后替换；
* 原生文本注入；
* 更细粒度 App Profiles；
* 自定义语音命令；
* Profile Marketplace，本地文件形式；
* 自动学习用户纠错；
* Linux 支持；
* portable mode。

---

# 16. 版本规划

## v0.1 Prototype

```text
Global hotkey
Audio recording
STT
LLM rewrite
Clipboard paste
```

## v0.2 Alpha

```text
Settings UI
Provider config
Prompt profiles
Dictionary
SQLite
Export / Import
```

## v0.3 Beta

```text
App-aware rules
Speak to Edit
VAD
Usage cost
Error handling
Privacy settings
```

## v0.4 Local Sync

```text
Encrypted sync.json
Sync folder
Merge logic
Conflict handling
```

## v0.5 WebDAV

```text
Nextcloud / NAS sync
Remote sync status
Sync retry
```

## v1.0 Stable

```text
macOS + Windows stable
Provider adapters stable
Local-first sync stable
Documentation
Installer
Auto-update
Open-source release
```

---

# 17. 开发任务拆解

## 17.1 Backend

* Audio capture service；
* STT provider interface；
* OpenAI STT adapter；
* Groq STT adapter；
* LLM provider interface；
* OpenAI / Gemini LLM adapter；
* Rewrite engine；
* Prompt renderer；
* Dictionary injection；
* SQLite repository；
* Config export / import；
* Sync file generator；
* Encryption service；
* WebDAV client，后续。

## 17.2 Frontend

* Tray menu；
* Floating recorder；
* Settings page；
* Provider config page；
* Profile editor；
* Dictionary editor；
* App rules page；
* Sync settings；
* Privacy settings；
* Usage dashboard；
* Error notification system。

## 17.3 Platform Integration

### macOS

* Microphone permission；
* Accessibility permission；
* Global shortcut；
* App bundle ID detection；
* Active window title；
* Clipboard paste；
* Keychain。

### Windows

* Microphone permission；
* Global shortcut；
* Process name detection；
* Active window title；
* Clipboard paste；
* Credential Manager。

---

# 18. 测试计划

## 18.1 功能测试

| 测试项     | 说明                                |
| ------- | --------------------------------- |
| 快捷键     | 不同 App 中触发                        |
| 录音      | 不同麦克风设备                           |
| STT     | 中英混合、噪声环境                         |
| Rewrite | 不同 Profile 输出                     |
| 粘贴      | Gmail、Slack、Notion、ChatGPT、Cursor |
| 词典      | 术语纠错                              |
| 导入导出    | 配置一致性                             |
| 同步      | 多设备 merge                         |
| 隐私      | API key 不导出                       |

## 18.2 兼容性测试

| 平台      | App                                            |
| ------- | ---------------------------------------------- |
| macOS   | Gmail, Slack, Notion, ChatGPT, Cursor, VS Code |
| Windows | Outlook, Teams, Chrome, Edge, Notion, VS Code  |
| Browser | Chrome, Edge, Safari                           |

## 18.3 隐私测试

* 导出文件不得包含 API key；
* sync.json 不得包含音频；
* 默认日志不得包含完整 transcript；
* 临时音频必须被清理；
* History Off 时不写入 transcript_history。

---

# 19. 风险与应对

## 19.1 系统权限风险

### 风险

macOS Accessibility、录音权限、自动粘贴可能被用户拒绝。

### 应对

* 首次启动权限向导；
* 权限状态检查；
* 清晰的修复步骤；
* fallback 到复制到剪贴板。

## 19.2 粘贴稳定性风险

### 风险

不同 App 对剪贴板和粘贴行为不同。

### 应对

* Clipboard paste 作为 MVP；
* Native injection 作为后续；
* 粘贴失败时保留文本到剪贴板。

## 19.3 STT 准确率风险

### 风险

中英混合、专有名词、噪声环境导致识别错误。

### 应对

* 个人词典；
* provider 切换；
* STT prompt；
* post-processing correction；
* local fallback。

## 19.4 成本风险

### 风险

云端 STT / LLM 调用成本随使用量增长。

### 应对

* BYOK；
* 成本面板；
* 低价 provider；
* local whisper；
* 用户设置限额。

## 19.5 隐私风险

### 风险

用户输入可能包含敏感内容。

### 应对

* 默认不保存音频；
* 默认不保存历史；
* API key 本机保存；
* sync 文件加密；
* 清晰隐私提示。

---

# 20. 推荐 MVP 技术路线

## 20.1 最快验证路线

```text
Electron + React + TypeScript
+ OpenAI / Groq STT
+ OpenAI / Gemini rewrite
+ better-sqlite3
+ keytar
+ clipboard paste
```

适合快速做出可用原型。

## 20.2 长期推荐路线

```text
Tauri + React + TypeScript + Rust
+ SQLite
+ OS Keychain
+ Provider Adapter
+ encrypted sync.json
+ WebDAV
```

适合开源长期维护。

## 20.3 建议实际路径

```text
Step 1: Electron prototype 验证体验
Step 2: 稳定核心链路
Step 3: 如果确认长期做，再迁移 Tauri
```

如果你已经熟悉 Rust / Tauri，可以直接从 Tauri 开始。

---

# 21. 最小可交付 MVP 定义

MVP 必须达到：

1. 用户可以在任意 App 通过快捷键语音输入；
2. 系统可以完成 STT + AI rewrite；
3. 输出能自动粘贴到当前输入框；
4. 用户可以配置 API key；
5. 用户可以切换输出 Profile；
6. 用户可以维护个人词典；
7. 用户可以导出 / 导入配置；
8. 默认不保存音频；
9. 默认不同步历史；
10. API key 只保存在本机安全存储。

---

# 22. 最终产品架构一句话

本产品采用 **local-first desktop architecture**：桌面客户端负责录音、转写、AI 后处理、文本注入和本地数据管理；STT / LLM 通过可插拔 Provider Adapter 接入；用户配置、词典和 Prompt Profile 保存在本地 SQLite，并可选导出为加密 sync.json，通过用户自有的云盘、Syncthing 或 WebDAV 进行跨设备配置同步；API key、音频和转写历史默认只保留在本机，且不参与同步。
