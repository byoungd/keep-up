# Loro vs Yjs: LFCC 协议最佳 CRDT 选型分析

**Date:** 2026-01-14
**Scope:** 深度对比分析，评估 Loro 是否为 LFCC 协议的最佳选择

---

## Executive Summary

| 维度 | Loro | Yjs | LFCC 需求匹配 |
|------|------|-----|---------------|
| **历史/版本** | ✅ 完整 DAG | ⚠️ 需额外存储 | Loro 胜出 |
| **富文本合并** | ✅ Fugue + Peritext | ⚠️ 基础 | Loro 胜出 |
| **Anchor 稳定性** | ✅ 原生支持 | ⚠️ 需扩展 | Loro 胜出 |
| **包体积** | ⚠️ ~1MB (WASM) | ✅ ~69KB | Yjs 胜出 |
| **生态成熟度** | ⚠️ 较新 | ✅ 生产验证 | Yjs 胜出 |
| **性能 (大文档)** | ✅ 1.0 版 10x 提升 | ✅ 优秀 | 平手 |

**结论：Loro 是 LFCC 的最佳选择**，因为 LFCC 的核心需求（注释持久化、AI 操作定位、时间旅行）与 Loro 的原生能力高度契合。

---

## 1. LFCC 核心需求 vs CRDT 能力

### 1.1 稳定锚点 (Stable Anchors) - LFCC §5
LFCC 要求所有位置使用稳定锚点持久化，绝对索引仅作缓存。

| 特性 | Loro | Yjs |
|------|------|-----|
| 原生稳定位置 | ✅ `Cursor` API | ⚠️ `RelativePosition` (需手动管理) |
| 编码版本化 | ✅ 内置 | ❌ 需自行实现 |
| Checksum 保护 | ✅ 可集成 | ❌ 需扩展 |

**分析:** Loro 的 `Cursor` 天然符合 LFCC 的 `anchor_encoding` 需求，无需额外抽象层。

### 1.2 完整历史 DAG - LFCC §9.3 (History)
LFCC 要求支持 Undo/Redo 恢复注释状态。

| 特性 | Loro | Yjs |
|------|------|-----|
| 完整操作历史 | ✅ 原生 DAG | ⚠️ 可选 (GC 默认开启) |
| 时间旅行 | ✅ 原生支持 | ⚠️ 需存储额外 version vector |
| 结构性 Undo | ✅ OpId 追踪 | ⚠️ 需自行实现映射 |

**分析:** LFCC §9.3.2 (HISTORY-STRUCT-*) 要求精确恢复 block_id， Loro 的 DAG 天然支持这一点。

### 1.3 富文本合并 - LFCC §8 (Canonicalizer)
LFCC 要求 Mark 合并结果确定性。

| 特性 | Loro | Yjs |
|------|------|-----|
| 富文本算法 | ✅ Peritext-inspired | ⚠️ 基础 mark 合并 |
| 并发 Mark 解决 | ✅ 确定性 | ⚠️ 可能产生交织 |
| 嵌套结构 | ✅ Movable Tree | ⚠️ 需扩展 |

**分析:** LFCC 的 `canonicalizer_policy.mark_order` 与 Loro 的 Peritext 实现无缝对接。

### 1.4 AI Gateway - LFCC §11
LFCC 要求 `doc_frontier` 用于预条件检查。

| 特性 | Loro | Yjs |
|------|------|-----|
| Frontier 格式 | ✅ `OpId[]` (确定性) | ⚠️ `StateVector` (不可比较) |
| 冲突检测 | ✅ 精确祖先检查 | ⚠️ 近似时间戳 |

**分析:** LFCC §11.1 已定义 `loro_frontier` 格式，与 Loro 原生集成。

---

## 2. 性能对比

| 指标 | Loro 1.0 | Yjs |
|------|----------|-----|
| 加载 100 万 ops | **1ms** | ~16ms |
| 包体积 (gzip) | 399KB | **20KB** |
| 内存占用 | 较高 (完整历史) | 较低 (GC 后) |
| parseTime (冷启动) | 较高 | **较低** |

**分析:** 对于 LFCC 目标场景（复杂文档 + AI 注释），Loro 的历史完整性比包体积更重要。

---

## 3. 生态成熟度

| 维度 | Loro | Yjs |
|------|------|-----|
| 生产案例 | 较少 (2024 新) | 很多 (Notion, Linear 等) |
| 社区支持 | 活跃但小 | 大且成熟 |
| 编辑器集成 | ProseMirror, Tiptap (官方) | ProseMirror, Tiptap, Slate, Monaco |
| 服务端支持 | Rust 原生 | Node.js, Rust (y-crdt) |

**分析:** Yjs 生态更成熟，但 Loro 的官方 ProseMirror 绑定已足够 LFCC 使用。

---

## 4. 风险评估

### Loro 风险
1. **数据格式稳定性:** 1.0 版前格式可能变化 → LFCC 已通过 Appendix D 缓解
2. **WASM 包体积:** 399KB → 可懒加载，非阻塞问题
3. **社区小:** 遇到问题可能需自行解决 → 团队有 Rust 能力

### Yjs 风险
1. **历史缺失:** 默认 GC 模式下无法时间旅行 → 需禁用 GC，内存膨胀
2. **Anchor 扩展:** 需自行实现稳定锚点编码 → 额外工程量
3. **Client ID 碰撞:** 53-bit ID 在超大规模场景有风险 → LFCC 场景可接受

---

## 5. 结论与建议

### Loro 是 LFCC 的最佳选择

| LFCC 关键能力 | Loro 支持度 |
|---------------|-------------|
| 稳定锚点持久化 | ✅ 原生 |
| 完整历史/时间旅行 | ✅ 原生 |
| 确定性富文本合并 | ✅ Peritext |
| AI Frontier 检查 | ✅ 原生 OpId |
| 结构性 Undo/Redo | ✅ DAG 追踪 |

### 如果选择 Yjs 需要的额外工作
1. 实现自定义 `StableAnchor` 编码层
2. 禁用 GC 并管理内存
3. 实现 `doc_frontier` ↔ StateVector 转换
4. 扩展 BlockMapping 以适配 Yjs 语义

**最终建议:** 保持 LFCC v1.x 与 Loro 绑定。在 v2.0+ 如需支持 Yjs，应定义 `CRDTAdapter` 抽象层并接受上述额外工程成本。
