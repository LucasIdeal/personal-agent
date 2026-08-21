# 智能助理

个人 AI 助理：在浏览器里完成对话、待办、订阅提醒、长期记忆和能力扩展。打开即可用，不必先选一个代码项目。

默认地址：[http://127.0.0.1:3080](http://127.0.0.1:3080)

## 功能

- **对话**：开箱即用的聊天工作区，支持提问建议
- **待办与订阅**：日历 + 列表，支持每天 / 每周 / 每月提醒
- **记忆**：偏好与事实的增删改查，对话中可自动提取
- **能力中心**：信息检索、内容摘要、任务跟踪、社交辅助、翻译润色等
- **SkillHub**：搜索并安装额外技能，安装后出现在能力墙

## 环境要求

- Node.js `22.19+` 或 `24+`
- [pnpm](https://pnpm.io) `11+`

本机若已有 `./.node` 下的 Node，启动脚本会自动使用。

## 运行

```sh
cd personal-agent
pnpm --dir app install
pnpm --dir app run build
./run-web.sh
```

首次使用请在本地配置模型密钥（文件不会进入 Git）：

```yaml
# .dsh/.credentials.yaml
DEEPSEEK_API_KEY: your-api-key
```

浏览器打开 `http://127.0.0.1:3080`。

## 目录

```
personal-agent/
├── run-web.sh                          # 启动 Web UI
├── app/                                # 运行时与 Web 前端
│   └── extensions/personal-assistant/  # 待办、记忆、能力中心
└── .dsh/                               # 本地数据（不入库）
    ├── .credentials.yaml               # API 密钥
    ├── planner/                        # 待办、订阅、记忆
    └── skills/                         # 已安装技能
```

## 本地数据

会话、待办、记忆和密钥都写在 `.dsh/`，与源码分开，也不会被提交。清空对话不会删除待办和记忆。

## 许可证

运行时源码遵循 [MIT](app/LICENSE)。
