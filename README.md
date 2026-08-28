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

首次打开会进入独立身份页。输入企业微信英文名后，助理会为该名字启动独立运行实例；会话、待办、订阅、记忆和纯聊天工作区分别写入 `.dsh/users/<英文名>/`，不会与其他名字混用。英文名仅适用于可信内网中的身份区分，不等同于密码或企业微信 OAuth 认证。

未检测到可用模型配置时会弹出配置窗口；已有默认模型则刷新后不再弹出。也可随时点右侧栏底部的「配置模型」。

支持 DeepSeek、OpenAI、Anthropic / Claude，以及任意 OpenAI 兼容网关（通义、智谱、Moonshot、SiliconFlow、Ollama 等）。密钥只保存在本机 `.dsh/`，不会进入 Git。

设计说明见 [技术报告](docs/技术报告.md)：记忆写入与检索、多轮上下文与 Token 控制、工具注册与路由、LLM 降级、用户隔离、接口与扩展方式、测试。

## 目录

```
personal-agent/
├── start.mjs / start.cmd               # 跨平台启动
├── scripts/bootstrap.mjs / setup.cmd   # 跨平台安装
├── scripts/user-gateway.mjs            # 身份入口与用户进程路由
├── docs/技术报告.md                    # 架构与实现说明
├── app/                                # 运行时与 Web 前端
│   └── extensions/personal-assistant/  # 待办、记忆、能力中心
└── .dsh/users/<英文名>/                 # 各用户独立数据（不入库）
```

## 本地数据

会话、待办、记忆和密钥都写在对应用户的 `.dsh/users/<英文名>/`，与源码分开，也不会被提交。升级前已有的 `.dsh/` 数据会在首次启动时备份并迁移给 `rhyszhao`。

如需绕过身份网关启动旧的单用户模式：

```sh
node start.mjs --single-user
```

## 许可证

运行时源码遵循 [MIT](app/LICENSE)。
