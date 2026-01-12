# RSS Ingest Contract

> 本文档定义 `@packages/ingest-rss` 的输入/输出契约、质量指标与门禁策略。

## 数据流

```
RSS URL → RSSFetcher → XML → RSSParser → RSSItem[] → RSSAtomicAdapter → IngestionMeta[]
                                                              ↓
                                                    RssIngestStats
```

## 输入契约

### FeedSource

```typescript
interface FeedSource {
  url: string;
  platform?: 'Reddit' | 'Hacker News' | string;
}
```

### RSSIngestOptions

```typescript
interface RSSIngestOptions {
  timeout?: number;      // 默认 10000ms
  userAgent?: string;    // 自定义 UA
}
```

## 输出契约

### IngestionMeta

RSS 解析后的标准化输出格式，用于 AtomicIngestionService：

```typescript
interface IngestionMeta {
  title: string;      // 文章标题，无标题时为 "Untitled"
  content: string;    // 清洗后的纯文本内容
  sourceId?: string;  // 从 guid/link 生成的稳定 ID（缺失时回退 content hash）
}
```

### RSSIngestReport（带观测与去重）

```typescript
interface RSSIngestReport {
  metas: IngestionMeta[]; // 去重后的条目
  stats: { raw: RssIngestStats; deduped: RssIngestStats }; // 去重前/后指标
  duplicates: DuplicateEntry[]; // 去重掉的条目及原因（stable_id 或 title_content）
  fetch: { etag?: string; lastModified?: string; modified: boolean; durationMs?: number }; // 抓取元数据
  quality: { passed: boolean; reasons: RssQualityFailureReason[]; thresholds: RssQualityThresholds; stats: RssIngestStats }; // 质量门禁结果
}
```

### RssIngestStats

质量观测指标：

```typescript
interface RssIngestStats {
  // Feed 级别
  totalItems: number;           // 总条目数
  itemsWithContent: number;     // 有内容的条目数
  itemsWithTitle: number;       // 有标题的条目数
  itemsWithSourceId: number;    // 有 sourceId 的条目数

  // 内容质量
  avgContentLength: number;     // 平均内容长度
  minContentLength: number;
  maxContentLength: number;
  snippetItems: number;         // 短内容条目数 (<100 chars)
  snippetRatio: number;         // 短内容比例

  // 提取成功率
  contentExtractionRate: number;  // 内容提取率
  titleExtractionRate: number;    // 标题提取率
  sourceIdRate: number;           // sourceId 提取率

  // HTML/编码
  itemsWithHtmlResidue: number;   // 清洗后仍有 HTML 的条目
  htmlResidueRatio: number;
  itemsWithEncodingIssues: number; // 编码异常条目
}
```

## 质量门禁

### 阈值定义

| 指标 | 阈值 | 说明 |
|------|------|------|
| `minContentExtractionRate` | 80% | 至少 80% 条目有内容 |
| `minTitleExtractionRate` | 90% | 至少 90% 条目有标题 |
| `maxSnippetRatio` | 80% | 短内容条目不超过 80%（RSS 常为摘要） |
| `maxHtmlResidueRatio` | 10% | HTML 残留不超过 10% |
| `minAvgContentLength` | 30 | 平均内容长度至少 30 字符 |
| `minItemCount` | 1 | 至少有 1 个条目 |

### 门禁失败原因

| 原因 | 说明 |
|------|------|
| `content_rate_too_low` | 内容提取率低于阈值 |
| `title_rate_too_low` | 标题提取率低于阈值 |
| `snippet_ratio_exceeded` | 短内容比例超标 |
| `html_residue_exceeded` | HTML 残留超标 |
| `avg_content_too_short` | 平均内容过短 |
| `too_few_items` | 条目数过少 |
| `fetch_error` | 网络请求失败 |
| `parse_error` | XML 解析失败 |
| `timeout` | 请求超时 |

## 测试模式

### Quick 模式 (PR Gate)

```bash
pnpm --filter @packages/ingest-rss test:quality
```

- 运行本地 mock fixtures + 1 个远程 feed
- 目标 <30s
- 不执行门禁检查（仅收集指标）

### Full 模式 (Nightly)

```bash
pnpm --filter @packages/ingest-rss test:quality:full
```

- 运行所有 fixtures（本地 + 远程）
- 执行门禁检查
- 生成详细报告

### JSON 报告

```bash
pnpm --filter @packages/ingest-rss test:quality:report
```

输出到 `artifacts/rss-ingest-report.json`

## CI 集成

```yaml
# PR Gate
- name: RSS Ingest Quality (Quick)
  run: pnpm --filter @packages/ingest-rss test:quality

# Nightly
- name: RSS Ingest Quality (Full)
  run: pnpm --filter @packages/ingest-rss test:quality:full
```

## 踩坑预案

### 远程 URL 测试容易卡

- 所有远程请求必须设置 timeout（默认 15s）
- 优先使用本地 mock fixtures 保证 quick 模式稳定
- 远程 fixtures 标记 `quick: false` 仅在 full 模式运行

### 脚本无输出

- 每个 await 都有 log 输出
- 失败时设置 `process.exitCode = 1`
- 使用 `process.stdout.write` 实时输出进度

### 报告被截断

- 控制台只打印 summary 表格
- 详细指标写入 JSON 文件
- 错误信息截断到 60 字符

### HTML 清洗不完整

- 使用 Mozilla Readability 进行深度清洗
- 检测清洗后的 HTML 残留并记录
- 高残留率触发警告

## 扩展字段（未来）

- `duplicateContentRatio`: 重复内容比例
- `avgFetchLatencyMs`: 平均请求延迟
- `fullTextExtractionRate`: 全文提取成功率
