# 智能助理

个人 AI 助理：在浏览器里完成对话、待办、订阅提醒、长期记忆和能力扩展。打开即可用，不必先选一个代码项目。

默认地址：http://127.0.0.1:3080

macOS / Linux / Windows 用同一套 Node 命令启动。Windows 也可以双击 `setup.cmd` 安装、`start.cmd` 启动。

## 环境要求

- [Node.js](https://nodejs.org/) **22.19+** 或 **24+**（安装时勾选 npm；不必预先安装 pnpm）

检查版本：

```sh
node -v
```

## 安装（只需一次）

```sh
git clone https://github.com/LucasIdeal/personal-agent.git
cd personal-agent
node scripts/bootstrap.mjs
```

首次会自动下载 pnpm、安装依赖并构建前端，大约需要几分钟。

## 启动

```sh
node start.mjs
```

浏览器打开 http://127.0.0.1:3080

首次打开会弹出模型配置窗口。也可随时点右侧栏底部的「配置模型」。

支持 DeepSeek、OpenAI、Anthropic / Claude，以及任意 OpenAI 兼容网关（通义、智谱、Moonshot、SiliconFlow、Ollama 等）。密钥只保存在本机 `.dsh/`，不会进入 Git。

## 目录

```
personal-agent/
├── start.mjs / start.cmd               # 跨平台启动
├── scripts/bootstrap.mjs / setup.cmd   # 跨平台安装
├── app/                                # 运行时与 Web 前端
│   └── extensions/personal-assistant/  # 待办、记忆、能力中心
└── .dsh/                               # 本地数据（不入库）
```

## 本地数据

会话、待办、记忆和密钥都写在 `.dsh/`，与源码分开，也不会被提交。

## 许可证

运行时源码遵循 [MIT](app/LICENSE)。
