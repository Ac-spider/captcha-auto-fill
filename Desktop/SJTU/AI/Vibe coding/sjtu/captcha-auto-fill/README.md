# SJTU验证码识别+一键登录JAccount

上海交通大学 JAccount 验证码自动识别与一键登录 Chrome 扩展。自动检测网页中的验证码图片，使用 OCR 技术识别验证码内容，并自动填写到输入框中。专为上海交通大学 jaccount 登录页面优化，同时支持各类网站的验证码识别。

## 功能特性

- **自动检测**：智能识别网页中的验证码图片
- **多引擎支持**：支持 8 种 OCR 识别引擎，灵活选择
- **自动填写**：识别结果自动填入验证码输入框
- **自动填充账号**：自动填充保存的 jAccount 用户名和密码
- **一键登录**：全自动登录（填充账号 → 识别验证码 → 提交表单）
- **快捷键支持**：`Ctrl+Shift+Y` 手动触发识别
- **针对优化**：特别适配上海交通大学 jaccount 验证码

## 技术实现详解

### 架构概述

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   网页验证码     │────▶│  Content Script │────▶│ CaptchaRecognizer│
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              │                           │
                              ▼                           ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │  自动填充输入框  │◀────│   多引擎 OCR    │
                        └─────────────────┘     └─────────────────┘
                                                        │
                    ┌───────────────────────────────────┼───────────────────────────────────┐
                    ▼                                   ▼                                   ▼
            ┌───────────────┐                 ┌───────────────┐                 ┌───────────────┐
            │ 本地 ddddocr  │                 │  AI 大模型    │                 │  云 OCR 服务  │
            │  (Python)     │                 │ (Kimi/OpenAI/ │                 │(百度/阿里云/  │
            │  127.0.0.1:5000│                │ Claude/Gemini)│                 │  ocr.space)   │
            └───────────────┘                 └───────────────┘                 └───────────────┘
```

### 多引擎识别系统

扩展支持 8 种识别引擎，按优先级分为三类：

#### 1. 本地服务（推荐）
- **ddddocr**：基于深度学习的本地 OCR 服务
  - 准确率：⭐⭐⭐⭐⭐（~99%）
  - 速度：⭐⭐⭐⭐⭐（<100ms）
  - 成本：免费
  - 隐私：完全本地，图片不上传
  - 配置：需要运行 Python 服务

#### 2. AI 大模型（视觉能力）
- **Kimi (Moonshot)**：kimi-k2.5 模型
- **OpenAI**：GPT-4o / GPT-4o-mini
- **Claude**：Claude 3 Sonnet / Opus / Haiku
- **Gemini**：Gemini 1.5 Flash / Pro
  - 准确率：⭐⭐⭐⭐⭐（~98%）
  - 速度：⭐⭐⭐（1-3s）
  - 成本：按调用收费
  - 隐私：图片上传至云端
  - 配置：需要 API Key

#### 3. 云 OCR 服务
- **百度智能云 OCR**：国内访问快
- **阿里云 OCR**：国内访问快
- **ocr.space**：免费额度
  - 准确率：⭐⭐⭐⭐（~90%）
  - 速度：⭐⭐⭐⭐（500ms-1s）
  - 成本：部分免费
  - 隐私：图片上传至云端
  - 配置：需要 API Key

### CAPTCHA 检测机制

```javascript
// 检测策略
1. 关键词匹配：captcha, verify, verification, jaccount, 验证码
2. 尺寸筛选：宽度 60-300px，高度 20-100px
3. 特殊适配：jaccount.sjtu.edu.cn 域名特定选择器
4. 动态监听：DOM MutationObserver 监听动态加载的验证码
```

### 自动填充机制

```javascript
// 填充流程
1. 识别验证码图片 → 获取图片 base64 数据
2. 调用 OCR 引擎 → 返回识别文本
3. 定位输入框 → 查找相邻的 text/password 输入框
4. 填写结果：
   - 设置 input.value
   - 触发 input、change、keyup、keydown 事件
   - 处理 React _valueTracker
5. 可选自动提交：
   - 触发表单 submit 事件
   - 或点击提交按钮
```

### 通信流程

```
Content Script (content.js)
    ↓ (检测到验证码，获取图片数据)
CaptchaRecognizer (lib/captcha-recognizer.js)
    ↓ (根据引擎选择发送请求)
Background Script (background.js)
    ↓ (代理请求，解决 CORS)
OCR 服务 (本地/云端)
    ↑
识别结果返回
```

## 安装教程

### 1. 下载扩展

```bash
git clone https://github.com/yourusername/captcha-auto-fill.git
cd captcha-auto-fill
```

### 2. 安装 Chrome 扩展

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`
2. 开启右上角的"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `captcha-auto-fill` 文件夹
5. 扩展安装完成，图标会显示在工具栏

### 3. 配置 OCR 引擎（可选）

#### 方式一：本地 ddddocr（推荐，准确率最高）

```bash
cd server
pip install -r requirements.txt
python ocr_server.py
```

服务将在 `http://127.0.0.1:5000` 启动，保持运行即可。

**后台运行（推荐）**：不想每次开机手动启动？可以将 OCR 服务安装为 Windows 系统服务：

```bash
cd server
# 右键点击，选择"以管理员身份运行"
install_service.bat
```

安装完成后，服务会随系统自动启动，无需手动维护。管理命令：
- 停止服务：`net stop OCRCaptcha`
- 启动服务：`net start OCRCaptcha`
- 卸载服务：运行 `uninstall_service.bat`（管理员身份）
- 管理工具：运行 `manage_service.bat` 查看图形菜单

#### 方式二：使用 AI 大模型

1. 点击扩展图标打开设置面板
2. 选择"识别引擎"为 Kimi / OpenAI / Claude / Gemini
3. 输入对应的 API Key
   - [获取 Kimi API Key](https://platform.moonshot.cn/)
   - [获取 OpenAI API Key](https://platform.openai.com/)
   - [获取 Claude API Key](https://console.anthropic.com/)
   - [获取 Gemini API Key](https://ai.google.dev/)
4. 选择模型（如 kimi-k2.5, gpt-4o 等）

#### 方式三：使用云 OCR 服务

1. 选择"识别引擎"为百度智能云 / 阿里云 / ocr.space
2. 输入 API Key 和 Secret Key（如需要）
3. 开始使用

## 使用教程

### 基本使用

1. **自动识别**：访问包含验证码的页面，扩展会自动检测并识别，结果填入输入框
2. **手动识别**：按 `Ctrl+Shift+Y` 或点击扩展图标选择"手动识别"
3. **查看结果**：点击扩展图标查看识别结果和置信度

### 自动填充用户名密码

开启后，扩展会自动填充保存的 jAccount 用户名和密码：

1. 点击扩展图标
2. 在"账号设置"中输入 jAccount 用户名和密码
3. 勾选"自动填充用户名和密码"
4. 访问登录页面时，扩展会自动填充账号信息

**安全提示**：密码仅在本地 Chrome 存储中保存，不会上传到任何服务器。

### 一键登录功能

开启后，识别验证码会自动提交表单，实现全自动登录：

1. 点击扩展图标
2. 先开启"自动填充用户名和密码"（推荐）
3. 勾选"一键登录（自动提交，失败自动重试）"
4. 访问登录页面时，扩展会自动完成：填充账号 → 识别验证码 → 提交登录
5. 登录失败会自动重试（最多 3 次）

### 各引擎使用建议

| 场景 | 推荐引擎 | 原因 |
|------|---------|------|
| 日常使用 | 本地 ddddocr | 免费、快速、准确、隐私好 |
| 无 Python 环境 | Kimi / ocr.space | 无需本地服务 |
| 高准确率要求 | ddddocr / Kimi | 识别率接近 99% |
| 国内网络环境 | 百度 / 阿里云 | 国内访问快 |
| 隐私敏感 | 本地 ddddocr | 图片不上传 |

## 各引擎对比

| 引擎 | 准确率 | 速度 | 成本 | 隐私 | 配置难度 |
|------|--------|------|------|------|----------|
| 本地 ddddocr | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 免费 | ⭐⭐⭐⭐⭐ | 中等 |
| Kimi | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 收费 | ⭐⭐ | 简单 |
| OpenAI | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 收费 | ⭐⭐ | 简单 |
| Claude | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 收费 | ⭐⭐ | 简单 |
| Gemini | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 收费 | ⭐⭐ | 简单 |
| 百度云 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 部分免费 | ⭐⭐ | 中等 |
| 阿里云 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 部分免费 | ⭐⭐ | 中等 |
| ocr.space | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 免费额度 | ⭐⭐ | 简单 |

## 常见问题

### Q: 扩展无法识别验证码？

A: 请检查：
1. 是否已启用扩展（点击图标查看开关状态）
2. 如果使用本地 ddddocr，是否已启动 Python 服务
3. 如果使用 AI 引擎，API Key 是否正确
4. 查看浏览器控制台是否有错误信息

### Q: 识别准确率不高？

A: 建议：
1. 使用本地 ddddocr 服务（准确率最高）
2. 或切换到 Kimi / OpenAI 等 AI 大模型

### Q: 如何获取 API Key？

A:
- **Kimi**: 访问 https://platform.moonshot.cn/ 注册并创建 API Key
- **OpenAI**: 访问 https://platform.openai.com/ 注册并创建 API Key
- **Claude**: 访问 https://console.anthropic.com/ 注册并创建 API Key
- **Gemini**: 访问 https://ai.google.dev/ 注册并创建 API Key
- **百度云**: 访问 https://cloud.baidu.com/doc/OCR/index.html 创建应用获取 Key
- **阿里云**: 访问 https://www.aliyun.com/product/ocr 创建 Access Key

### Q: 保存密码安全吗？

A: 密码使用 Chrome 扩展的 `storage.sync` API 存储，仅保存在本地浏览器中，不会上传到任何服务器。建议：
1. 仅在个人电脑上使用此功能
2. 公共电脑请勿保存密码
3. 可以只开启验证码识别，手动输入密码

### Q: 一键登录不安全？

A: 一键登录功能默认关闭，需要手动开启。扩展不会强制保存您的密码，您可以选择：
1. 仅开启验证码自动识别，手动输入账号密码
2. 开启自动填充账号密码 + 一键登录，实现全自动登录

### Q: 隐私问题？

A:
- 使用**本地 ddddocr**时，所有识别在本地完成，图片不会上传
- 使用**AI 大模型/云 OCR**时，图片会上传至对应服务商，请查看各服务商隐私政策
- 扩展不会收集您的个人信息

## 文件结构

```
captcha-auto-fill/
├── manifest.json              # 扩展配置文件 (Manifest V3)
├── background.js              # 后台服务工作者
├── content.js                 # 内容脚本（注入页面）
├── popup.html                 # 弹出窗口 UI
├── popup.js                   # 弹出窗口逻辑
├── styles.css                 # 样式文件
├── README.md                  # 项目说明文档
├── icons/
│   └── icon.svg               # 扩展图标
├── lib/                       # OCR 模块库
│   ├── captcha-recognizer.js  # 核心识别器（多引擎调度）
│   ├── ocr-service.js         # 在线 OCR 服务封装
│   ├── kimi-ocr.js            # Kimi API 封装
│   ├── openai-ocr.js          # OpenAI Vision API 封装
│   ├── claude-ocr.js          # Claude Vision API 封装
│   ├── gemini-ocr.js          # Gemini API 封装
│   ├── baidu-ocr.js           # 百度云 OCR 封装
│   └── aliyun-ocr.js          # 阿里云 OCR 封装
└── server/                    # Python OCR 服务
    ├── ocr_server.py          # Flask 服务（基于 ddddocr）
    ├── ocr_service.py         # Windows 服务版本
    ├── start_server.py        # 启动脚本
    ├── requirements.txt       # Python 依赖
    ├── install_service.bat    # 安装 Windows 服务
    ├── uninstall_service.bat  # 卸载 Windows 服务
    └── manage_service.bat     # 服务管理工具
```

## 技术栈

- **Chrome Extension Manifest V3**
- **ddddocr**: 基于深度学习的本地 OCR（Python）
- **Flask**: Python Web 框架
- **Vanilla JavaScript**: 无框架原生 JavaScript
- **CSS3**: 现代化样式

## 许可证

MIT License

## 致谢

- [ddddocr](https://github.com/sml2h3/ddddocr) - 开源 OCR 库
- 上海交通大学 jaccount 登录页面测试支持
