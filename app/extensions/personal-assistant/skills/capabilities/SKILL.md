---
name: capabilities
description: 个人助理扩展能力。当用户提到信息检索、内容摘要、任务跟踪、社交辅助、起草消息、总结纪要、查一下、帮我找时使用本技能。
metadata:
  capability:
    hidden: true
---

# 扩展能力插件

右侧「能力中心」与输入框上方的能力坞共用同一套插件。用工具落地，不要空口编造检索结果。

## 能力与工具

| 能力 | 何时用 | 工具 / 做法 |
|---|---|---|
| 信息检索 | 查记忆/待办/笔记/约定 | `info_search` |
| 任务跟踪 | 今日优先、进度、阻塞 | `task_brief`，必要时再 `todo_manage` |
| 内容摘要 | 长文、粘贴材料、会议纪要 | 直接摘要；若材料在笔记里先 `read_note` |
| 社交辅助 | 起草消息、催办、致谢、约时间 | 结合用户画像与沟通偏好起草 |
| 日程 / 记忆 | 见 planner / memory 技能 | `todo_manage` / `subscription_manage` / `memory_manage` |

可用 `list_capabilities` 列出当前插件（含 SkillHub 已安装 skill）。

## SkillHub 扩展

- 用户在「能力中心 → SkillHub 商店」可搜索/安装技能
- 安装目录：`.dsh/skills/`，DSH 会自动加载对应 `SKILL.md`
- 每个 skill 可出现在能力墙；在 SKILL frontmatter 的 `metadata.capability` 可自定义卡片样式与提示词
- Agent 也可执行：`skillhub search …` / `skillhub --dir <skills目录> install <slug>`

## 检索

- 先 `info_search`，`scope` 默认 `all`；用户指定范围再收窄
- 记忆检索同时走关键词与 embedding，不要把整句当成一个子串
- 向用户展示标题与摘要，禁止内部 id
- 找不到就直说，不要编造

## 摘要

- 结构：要点 → 风险/注意 → 可执行下一步
- 用户说「摘要这段」且消息里已有材料时，直接处理，不要再追问

## 社交

- 默认简洁得体中文；遵守画像里的沟通偏好
- 先给一版可直接复制的正文，再给可选语气变体（最多 2 个）
