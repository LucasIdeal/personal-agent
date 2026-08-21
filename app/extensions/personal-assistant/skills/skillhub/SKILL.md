---
name: skillhub
description: SkillHub 技能商店。当用户要搜索、安装、升级技能，或提到 SkillHub、技能商店、扩展能力时使用本技能。
metadata:
  capability:
    title: SkillHub 商店
    short: 商店
    blurb: 搜索并安装 SkillHub 技能，扩展助理能力。
    accent: "#22c55e"
    prompt: "请帮我从 SkillHub 搜索并安装技能："
    placeholder: "例如：pdf、翻译、代码审查…"
    rail: false
    order: 95
---

# SkillHub 技能商店

SkillHub 是国内优先的 Skill 商店。安装后技能会出现在右侧「能力中心」，DSH 会在合适场景自动加载对应 SKILL。

## CLI 已就绪

```bash
command -v skillhub && skillhub --version
```

## 技能目录（DSH）

本助理的技能安装目录：

- `~/.dsh/skills/`（或项目 `.dsh/skills/`）
- 同步镜像：`.dsh/chat/.agents/skills/`

⚠️ 安装**必须**指定 `--dir`，否则默认装到 `./skills/` 不会被 DSH 识别。

## 常用命令

```bash
skillhub search <关键词>
skillhub --dir <skills目录> install <slug>
skillhub --dir <skills目录> list
```

也可在 Web UI「能力中心 → SkillHub 商店」搜索与安装。

## Agent 操作规范

1. 用户要**扩展能力**时，先 `list_capabilities` 看已安装插件，再建议 SkillHub 搜索。
2. 安装前向用户确认 slug、来源与用途；安装后提醒可能需要刷新或新开对话。
3. 远程搜索不可用时，可让用户直接提供 slug 尝试安装，或说明当前 SkillHub 索引为空。
4. 安装成功后，对应 skill 会出现在能力中心；用户点卡片即可填入「请按 xxx 技能处理」。

## 与能力中心的关系

- 内置插件：日程、记忆、检索、摘要、任务、社交
- 已安装 skill：每个 `SKILL.md` 可自动注册为能力卡片（可在 frontmatter `metadata.capability` 自定义标题、颜色、提示词）
