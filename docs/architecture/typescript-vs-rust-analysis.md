# Agent Runtime: TypeScript vs Rust 深度分析

Date: 2026-01-21
Owner: Architecture Team
Status: RFC

---

## 1. 项目现状

### TypeScript 实现规模
| 指标 | 数值 |
|-----|------|
| 文件数 | 912 |
| 代码行数 | ~145,000 |
| 核心模块数 | 39 |
| 依赖包数 | 15+ workspace packages |

### 核心模块
- `orchestrator/`: 状态机、Turn执行、计划持久化
- `streaming/`: Token流、背压、检查点恢复
- `execution/`: 任务池、调度器、工作线程注册
- `graph/`: 图执行运行时
- `swarm/`: 多智能体协作
- `checkpoint/`: Shadow Git 持久化
- `security/`: 权限检查、审计日志

---

## 2. Codex (Rust) 对比

### Rust 实现规模 (codex-rs)
| 指标 | 数值 |
|-----|------|
| Crate 数 | ~45 |
| codex-core 主模块 | ~180KB (4,800行) |
| 总代码量 | ~300,000行+ (估算) |

### Rust 独有能力

| 特性 | Codex Rust | 我们的 TypeScript |
|------|-----------|-----------------|
| **OS 沙箱** | Seatbelt (macOS) + Landlock (Linux) | Docker 容器 |
| **内存安全** | 编译时保证，零运行时开销 | V8 GC，可能出现内存泄漏 |
| **并发模型** | Tokio async + 无数据竞争 | Node.js 单线程 + Worker |
| **类型安全** | Ownership + Borrow Checker | TypeScript (运行时仍可 bypass) |
| **性能** | 接近 C/C++ | ~10-100x 慢于 Rust |
| **启动时间** | 毫秒级 | 秒级 (Node.js 冷启动) |

---

## 3. 迁移到 Rust 的收益分析

### ✅ 明确收益

1. **OS 级沙箱**
   - Codex 使用 `seatbelt.rs` (macOS) 和 `landlock.rs` (Linux) 提供内核级隔离
   - 我们目前依赖 Docker，启动慢、资源开销大
   - **收益**：Track AC (Policy & Ops) 可直接复用这些模式

2. **性能敏感路径**
   - Token 流处理、AST 解析、向量搜索
   - Rust 可提供 10-100x 性能提升
   - **收益**：减少延迟，支持更大上下文窗口

3. **内存安全**
   - 长时间运行的 Agent 会话容易内存泄漏
   - Rust 编译时保证无泄漏
   - **收益**：提高稳定性，减少 OOM 崩溃

4. **跨平台分发**
   - Rust 编译为单一二进制，无需 Node.js 运行时
   - **收益**：简化部署，减少依赖

### ⚠️ 潜在风险

1. **开发效率**
   - Rust 学习曲线陡峭 (所有权、生命周期)
   - TypeScript 团队需要 3-6 个月适应期
   - 迭代速度可能降低 50%

2. **生态系统**
   - LLM SDK (Vercel AI SDK, OpenAI SDK) 主要是 TypeScript/Python
   - Rust LLM 生态较弱，需自建或 FFI

3. **团队能力**
   - 当前团队以 TypeScript/React 为主
   - 需要招聘 Rust 专家或大量培训

4. **维护成本**
   - 145K 行 TypeScript 重写需 6-12 个月
   - 期间功能开发停滞

---

## 4. 推荐策略

### 方案 A: 全量 Rust 重写 ❌
- **风险**: 太大，功能冻结 6-12 个月
- **不推荐**

### 方案 B: 渐进式 Rust 核心 + TypeScript 外壳 ✅

```
┌─────────────────────────────────────────────────────────┐
│                  TypeScript Layer                        │
│  - Orchestrator (业务逻辑)                               │
│  - LLM 调用 (Vercel AI SDK)                              │
│  - UI 集成                                               │
└───────────────────────┬─────────────────────────────────┘
                        │ NAPI-RS / WASM
                        ▼
┌─────────────────────────────────────────────────────────┐
│                    Rust Core                             │
│  - codex-sandbox (Seatbelt/Landlock)                     │
│  - codex-exec (命令执行)                                 │
│  - codex-apply-patch (文件操作)                          │
│  - 向量搜索 (RAG)                                        │
└─────────────────────────────────────────────────────────┘
```

**实施步骤**:

| Phase | 内容 | 时间 |
|-------|------|------|
| Phase 1 | 引入 Rust 沙箱模块 (NAPI-RS) | 4 周 |
| Phase 2 | Rust 命令执行 + apply-patch | 4 周 |
| Phase 3 | Rust 向量搜索 (替代 JavaScript 实现) | 4 周 |
| Phase 4 | 评估是否继续迁移更多模块 | 2 周 |

### 方案 C: 保持 TypeScript，引入 Rust 工具 ⚠️
- 仅在 CLI/独立工具中使用 Rust
- 保持 Agent Runtime 为纯 TypeScript
- **适合**: 团队无 Rust 经验时

---

## 5. 结论

| 决策项 | 推荐 |
|-------|------|
| **是否全量迁移 Rust** | ❌ 不推荐 (风险太大) |
| **是否引入 Rust 核心模块** | ✅ 推荐 (沙箱、性能关键路径) |
| **首选方案** | 方案 B: 渐进式 Rust 核心 |
| **首批迁移目标** | 沙箱执行 (`exec_policy`, `seatbelt`) |

### 行动项

1. **短期 (Q1)**: 评估 NAPI-RS 绑定可行性
2. **中期 (Q2)**: 移植 Codex 沙箱模块
3. **长期 (Q3+)**: 根据性能瓶颈决定是否扩展 Rust 使用范围

---

## References

- Codex Rust 源码: `.tmp/analysis/codex/codex-rs/`
- 现有 TypeScript 实现: `packages/agent-runtime/`
- 相关 Roadmap: `docs/roadmap/phase-5-expansion/track-ac-policy-ops.md`
