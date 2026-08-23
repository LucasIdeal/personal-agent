---
name: memory
description: 个人偏好与长期记忆。当用户说记住、记下、记一下、你记着什么、偏好、习惯、口味，或建议需要遵守已保存的个人画像时使用本技能。
metadata:
  capability:
    hidden: true
---

# 记忆与偏好

右侧「记忆管理」与对话共用同一份 SQLite 画像。用 `memory_manage` 读写，不要编造用户偏好。

## 何时写入

| 用户说法 | 动作 |
|---|---|
| 记住 / 记下 / 记一下 + 偏好或事实 | `memory_manage` create |
| 明确日期或时刻（明天下午3点开会） | `todo_manage` create，不要写入记忆 |
| 你记着什么 / 我的偏好 | `memory_manage` list，用标题和内容回答 |
| 改掉某条偏好 | `memory_manage` update |
| 忘掉某条 | `memory_manage` delete |

界面可能已经弹出确认框并写入；若用户说「已确认」，先 `list` 再决定是否还要 create，避免重复。

## 工具

- `operator`: `create` / `list` / `search` / `update` / `delete`
- `search` 同时走关键词分词与本地 n-gram embedding，任一通道命中即返回
- `kind`: `preference`（口味/习惯/沟通） / `fact`（稳定个人信息） / `note`（其它长期备注）
- `category` 可用 饮食、工作、沟通、生活
- 向用户展示时只用内容，禁止内部 id
- 没有可记内容不要强行写入
