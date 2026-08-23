# Agent Note: Hybrid keyword and embedding memory search

Status: implemented

English | [中文](2026-08-23-memory-hybrid-search.zh.md)

## Problem

Personal-assistant memory search bound the entire query as one SQL `LIKE '%query%'` phrase. A stored fact such as `我购买的股票有 SGOV VOOG QQQ` therefore missed `SGOV VOOG QQQ 股票`, because that string is not a substring of the content or category. `info_search` and `memory_manage search` share that store method, so the agent reported no memory for a holding that was already saved. Keyword tokens and a vector channel must run together; either channel may produce a hit.

## Decision

`MemoryStore.search` ranks the active pool with two channels in one call: tokenized keyword overlap (Latin tickers plus CJK n-grams, mixed runs split so `SGOV股票` becomes both tokens) and a local `ngram-hash-v1` hashing embedding over the same features, fused by reciprocal rank fusion. A memory is returned if it appears in either ranked list. `list({ q })`, `memory_manage search`, `info_search`, and `GET /planner-api/memories?q=` all use this ranking. The sidebar filter tokenizes the same way instead of requiring a whole-phrase `includes`. The embedding is deterministic and in-process so DeepSeek-only setups still search without a hosted encoder.

## Alternatives considered

**Keep whole-phrase `LIKE` and ask the model to shorten the query.** Rejected because the tool already received a reasonable multi-token query, and requiring the model to guess a substring that exists in storage is the failure that produced the empty result.

**SQLite FTS5 as the only keyword path.** Rejected because `unicode61` treats an uninterrupted Chinese run as one token, so `股票` inside `我购买的股票有` is not a guaranteed match; per-token substring overlap covers that case.

**Hosted neural embeddings only (OpenAI-compatible `/v1/embeddings`).** Rejected as the sole path because the shipped default model is DeepSeek chat, which has no embeddings endpoint; search would go empty whenever that call failed. The hashing embedding stays local; a later neural encoder can replace `embedText` without changing the two-channel fuse.

**Require both channels to agree (AND).** Rejected because that lowers recall for exact ticker hits whose embedding score is merely moderate; "同时查" means both run, not that both must accept the row.

## Consequences

Queries that mix tickers and a category word return the matching memory. Paraphrases without token overlap still depend on n-gram overlap in the local embedding, not a multilingual neural encoder. Focused tests pin `SGOV VOOG QQQ 股票` against `我购买的股票有 SGOV VOOG QQQ` and prove the old whole-phrase substring would miss it.
