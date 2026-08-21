---
name: planner
description: 个人助理待办与订阅管理。当用户提到待办、日程、日历、提醒我、订阅、定时、每天、每周、每月、定期执行时使用本技能。
metadata:
  capability:
    hidden: true
---

# 待办与订阅

右侧「待办与订阅」栏与对话共用同一份数据。用工具读写，不要编造列表。

## 工具

| 意图 | 工具 |
|---|---|
| 创建/查看/完成/修改/删除待办 | `todo_manage` |
| 创建/查看/修改/暂停/恢复/删除订阅 | `subscription_manage` |

向用户展示时只用标题、时间、重复规则，禁止展示内部 id。

若消息以「【待办管理】」开头：只用 `todo_manage` / `subscription_manage`；需要数据时再 `list`，不要把整表塞进上下文或回复；已完成项默认忽略；缺具体时刻最多追问一次。

用户说「记住 / 记下」时，有明确时间的用待办，偏好与稳定事实用记忆（见 memory 技能）。

## 待办

- `operator`: `create` / `list` / `complete` / `update` / `delete`
- 创建需要 `title`；日期用 `due_date=YYYY-MM-DD`，时刻用 `due_time=HH:mm`
- 没有说时间就不要编日期
- 完成或删除用标题定位，先 `list` 再动手

## 订阅（对齐定时任务）

订阅是会按规则自动到期的重复任务（早报、提醒、回顾）。

- 未提每天/每周/每月/定期 → `rule_type=once`
- 用户说「N点」但没说上午下午：从今天 N 点、今天 N+12 点、明天 N 点里选最近的将来时间，不要追问
- 单次 `execute_at` 必须晚于当前时间，已过则顺延
- 周期任务没说几点时，要问几点，不要默认 8:30
- `only_workday` 默认跳过周末。用户明确说「节假日也要 / 每天都执行」才传 `false`；`once` 不要传该字段
- `day_of_week` 只传一个：MO/TU/WE/TH/FR/SA/SU。多个周几拆成多条
- `prompt` 必须自包含，用第二人称祈使句。禁止写「每天」「提醒」「刚才说的」和内部 id。报告类第一行写 `「标题」`

### 创建字段

`title`、`description`、`prompt` 由模型生成，不要反问文案。

| 字段 | once | daily | weekly | monthly |
|---|---|---|---|---|
| `rule_type` | 必填 | 必填 | 必填 | 必填 |
| `hour` / `minute` | 必填 | 必填 | 必填 | 必填 |
| `execute_at` | 必填 | — | — | — |
| `day_of_week` | — | — | 必填 | — |
| `day_of_month` | — | — | — | 必填 |
| `interval` | — | 默认 1 | 默认 1 | 默认 1 |
| `only_workday` | 禁止 | 默认 true | 默认 true | 默认 true |

`day_of_month`：1-31 为日期；`0` 首个工作日；`32` 最后工作日。

### 修改

用 `operator=modify` 改已有订阅，禁止删了再建。暂停/恢复/删除用对应 operator。
