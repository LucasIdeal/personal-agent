# Agent Note: 记忆的关键词与 embedding 混合检索

Status: implemented

[English](2026-08-23-memory-hybrid-search.md) | 中文

## 问题

个人助理的记忆检索把整句查询当成一条 SQL `LIKE '%query%'` 短语。因此已保存的事实例如 `我购买的股票有 SGOV VOOG QQQ` 无法命中 `SGOV VOOG QQQ 股票`，因为该字符串并不是内容或分类的子串。`info_search` 与 `memory_manage search` 共用该方法，所以智能体对一条已经写入的持仓报告「没有找到」。关键词 token 与向量通道必须在同一次查询里同时运行；任一通道命中即可返回。

## 决策

`MemoryStore.search` 在一次调用里用两个通道对活跃记忆排序：关键词分词重叠（拉丁 ticker 与中文 n-gram，混合片段会切开，因此 `SGOV股票` 变成两个 token），以及覆盖同一组特征的本地 `ngram-hash-v1` hashing embedding，再用倒数排名融合。记忆只要出现在任一通道的有序列表中就会返回。`list({ q })`、`memory_manage search`、`info_search` 和 `GET /planner-api/memories?q=` 都使用这套排序。侧栏过滤按同样方式分词，而不再要求整句 `includes`。该 embedding 是进程内确定性实现，因此仅配置 DeepSeek 对话模型时仍能检索，无需托管编码器。

## 曾考虑的替代方案

**保留整句 `LIKE`，改让模型把查询缩短。** 不采用：工具已经收到合理的多 token 查询，再要求模型猜出库中真实存在的子串，正是导致空结果的失败路径。

**只用 SQLite FTS5 做关键词通道。** 不采用：`unicode61` 会把连续中文当成一个 token，因此 `我购买的股票有` 里的 `股票` 不保证能命中；按 token 做子串重叠能覆盖该情况。

**只使用托管神经 embedding（OpenAI 兼容 `/v1/embeddings`）。** 不采用作为唯一路径：默认模型是 DeepSeek 对话，没有 embeddings 接口；该调用失败时检索会变成空。hashing embedding 保持本地；以后若替换神经编码器，只需更换 `embedText`，不必改双通道融合。

**要求两个通道同时同意（AND）。** 不采用：这会降低精确 ticker 命中的召回，它们的 embedding 分数可能只是中等；「同时查」表示两条通道都运行，而不是一行必须被两条都接受。

## 后果

把 ticker 与分类词写在同一句查询里时，会返回对应记忆。没有 token 重叠的转述仍依赖本地 embedding 的 n-gram 重叠，而不是多语种神经编码器。专项测试钉住 `SGOV VOOG QQQ 股票` 对 `我购买的股票有 SGOV VOOG QQQ`，并证明旧的整句子串匹配会漏掉它。
