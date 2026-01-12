/**
 * SQL Schema definitions for the LFCC local database.
 * Uses PRAGMA user_version for migrations.
 */

// export const CURRENT_SCHEMA_VERSION = 5;

export const SCHEMA_SQL = `
-- Meta table for key-value settings
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
  doc_id TEXT PRIMARY KEY,
  title TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  active_policy_id TEXT,
  head_frontier BLOB,
  saved_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_documents_saved ON documents (saved_at);

-- LFCC Policy manifests
CREATE TABLE IF NOT EXISTS lfcc_policy (
  policy_id TEXT PRIMARY KEY,
  lfcc_version TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  v INTEGER NOT NULL
);

-- CRDT Updates (append-only oplog)
CREATE TABLE IF NOT EXISTS crdt_updates (
  doc_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  lamport INTEGER NOT NULL,
  update BLOB NOT NULL,
  received_at INTEGER NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (doc_id, actor_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_crdt_updates_lamport ON crdt_updates (doc_id, lamport);
CREATE INDEX IF NOT EXISTS idx_crdt_updates_received ON crdt_updates (doc_id, received_at);

-- Snapshots (optional, for faster loads)
CREATE TABLE IF NOT EXISTS snapshots (
  doc_id TEXT NOT NULL,
  snapshot_id TEXT PRIMARY KEY,
  frontier BLOB NOT NULL,
  snapshot BLOB NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_doc ON snapshots (doc_id, created_at);

-- Annotations
CREATE TABLE IF NOT EXISTS annotations (
  doc_id TEXT NOT NULL,
  annotation_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  thread_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  state TEXT NOT NULL,
  reason TEXT,
  v INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_annotations_state ON annotations (doc_id, state);
CREATE INDEX IF NOT EXISTS idx_annotations_kind ON annotations (doc_id, kind);
CREATE INDEX IF NOT EXISTS idx_annotations_thread ON annotations (thread_id);

-- Annotation spans
CREATE TABLE IF NOT EXISTS annotation_spans (
  annotation_id TEXT NOT NULL,
  span_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  start_anchor BLOB NOT NULL,
  start_bias TEXT NOT NULL,
  end_anchor BLOB NOT NULL,
  end_bias TEXT NOT NULL,
  context_hash TEXT,
  v INTEGER NOT NULL,
  PRIMARY KEY (annotation_id, span_id)
);
CREATE INDEX IF NOT EXISTS idx_annotation_spans_block ON annotation_spans (block_id);

-- Outbox (sync queue)
CREATE TABLE IF NOT EXISTS outbox (
  outbox_id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload BLOB NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at INTEGER,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox (status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_outbox_doc ON outbox (doc_id, created_at);

-- RSS Folders (for organizing subscriptions)
CREATE TABLE IF NOT EXISTS rss_folders (
  folder_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- RSS Subscriptions (full subscription management)
CREATE TABLE IF NOT EXISTS rss_subscriptions (
  subscription_id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  title TEXT,
  display_name TEXT,
  site_url TEXT,
  folder_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_fetched_at INTEGER,
  status TEXT NOT NULL DEFAULT 'ok',
  error_message TEXT,
  etag TEXT,
  last_modified TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (folder_id) REFERENCES rss_folders(folder_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_rss_subscriptions_folder ON rss_subscriptions (folder_id);
CREATE INDEX IF NOT EXISTS idx_rss_subscriptions_status ON rss_subscriptions (status, enabled);

-- Feed Items (RSS entries, linked to documents)
CREATE TABLE IF NOT EXISTS feed_items (
  item_id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL,
  guid TEXT,
  title TEXT,
  link TEXT,
  author TEXT,
  published_at INTEGER,
  content_html TEXT,
  excerpt TEXT,
  read_state TEXT NOT NULL DEFAULT 'unread',
  saved INTEGER NOT NULL DEFAULT 0,
  document_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (subscription_id) REFERENCES rss_subscriptions(subscription_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_feed_items_subscription ON feed_items (subscription_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_items_read_state ON feed_items (read_state, published_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_items_guid ON feed_items (subscription_id, guid);

-- Import Jobs (for content import pipeline)
CREATE TABLE IF NOT EXISTS import_jobs (
  job_id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  status TEXT NOT NULL,
  progress REAL,
  error_code TEXT,
  error_message TEXT,
  result_document_id TEXT,
  asset_id TEXT,
  document_version_id TEXT,
  dedupe_hit INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at INTEGER,
  parser_version TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS idx_import_jobs_retry ON import_jobs (next_retry_at);

-- Raw Assets (immutable, content-addressed storage for imports)
CREATE TABLE IF NOT EXISTS raw_assets (
  asset_id TEXT PRIMARY KEY,
  asset_hash TEXT NOT NULL UNIQUE,
  byte_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  storage_provider TEXT NOT NULL DEFAULT 'opfs',
  storage_path TEXT NOT NULL,
  parser_hint TEXT,
  ingest_meta_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_raw_assets_source ON raw_assets (source_type, source_ref);
CREATE INDEX IF NOT EXISTS idx_raw_assets_created ON raw_assets (created_at);

-- Document Assets (links documents to their raw assets)
CREATE TABLE IF NOT EXISTS document_assets (
  document_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'primary',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (document_id, asset_id),
  FOREIGN KEY (document_id) REFERENCES documents(doc_id) ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES raw_assets(asset_id) ON DELETE RESTRICT
);

-- Topics (Projects/Collections)
CREATE TABLE IF NOT EXISTS topics (
  topic_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_topics_updated ON topics (updated_at DESC);

-- Document-Topic Links (many-to-many for source reuse)
CREATE TABLE IF NOT EXISTS document_topics (
  document_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (document_id, topic_id),
  FOREIGN KEY (document_id) REFERENCES documents(doc_id) ON DELETE CASCADE,
  FOREIGN KEY (topic_id) REFERENCES topics(topic_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_document_topics_topic ON document_topics (topic_id, added_at DESC);

-- Digests (AI-generated daily summaries)
CREATE TABLE IF NOT EXISTS digests (
  digest_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  source_item_count INTEGER NOT NULL DEFAULT 0,
  token_usage_json TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_digests_user_date ON digests (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_digests_status ON digests (status, created_at);

-- Digest Cards (individual cards within a digest)
CREATE TABLE IF NOT EXISTS digest_cards (
  card_id TEXT PRIMARY KEY,
  digest_id TEXT NOT NULL,
  card_type TEXT NOT NULL,
  headline TEXT NOT NULL,
  summary TEXT NOT NULL,
  why_it_matters TEXT,
  confidence TEXT NOT NULL,
  priority_score INTEGER NOT NULL DEFAULT 0,
  topics_json TEXT NOT NULL DEFAULT '[]',
  citations_json TEXT NOT NULL DEFAULT '[]',
  order_index INTEGER NOT NULL DEFAULT 0,
  generated_at INTEGER NOT NULL,
  FOREIGN KEY (digest_id) REFERENCES digests(digest_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_digest_cards_digest ON digest_cards (digest_id, order_index);

-- Digest Card Sources (links cards to content items)
CREATE TABLE IF NOT EXISTS digest_card_sources (
  card_id TEXT NOT NULL,
  source_item_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (card_id, source_item_id),
  FOREIGN KEY (card_id) REFERENCES digest_cards(card_id) ON DELETE CASCADE
);

-- Content Items (unified view of ingested content for AI processing)
CREATE TABLE IF NOT EXISTS content_items (
  item_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_url TEXT,
  feed_id TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  snippet TEXT,
  author TEXT,
  published_at INTEGER,
  ingested_at INTEGER NOT NULL,
  topics_json TEXT NOT NULL DEFAULT '[]',
  canonical_hash TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  has_full_text INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_content_items_ingested ON content_items (ingested_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_items_source ON content_items (source, feed_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_content_items_hash ON content_items (canonical_hash);

-- Document Versions (optional, for version history)
CREATE TABLE IF NOT EXISTS document_versions (
  version_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  version_index INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  primary_asset_id TEXT NOT NULL,
  change_kind TEXT NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(doc_id) ON DELETE CASCADE,
  FOREIGN KEY (primary_asset_id) REFERENCES raw_assets(asset_id) ON DELETE RESTRICT,
  UNIQUE (document_id, version_index)
);
CREATE INDEX IF NOT EXISTS idx_document_versions_doc ON document_versions (document_id, version_index);

-- Briefs (Living Briefs - LFCC documents for curated content)
CREATE TABLE IF NOT EXISTS briefs (
  brief_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  is_public INTEGER NOT NULL DEFAULT 0,
  owner_id TEXT NOT NULL,
  document_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(doc_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_briefs_owner ON briefs (owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_briefs_public ON briefs (is_public, updated_at DESC);

-- Brief Items (items pinned to a brief)
CREATE TABLE IF NOT EXISTS brief_items (
  brief_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  title TEXT NOT NULL,
  source_url TEXT,
  excerpt TEXT,
  note TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (brief_id, item_id),
  FOREIGN KEY (brief_id) REFERENCES briefs(brief_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_brief_items_brief ON brief_items (brief_id, order_index);
`;

// ─────────────────────────────────────────────────────────────────────────────
// Migration Functions (extracted to reduce complexity)
// ─────────────────────────────────────────────────────────────────────────────

type ExecSql = (sql: string) => Promise<void>;

async function migrateV1ToV2(execSql: ExecSql): Promise<void> {
  await execSql(`
    CREATE TABLE IF NOT EXISTS import_jobs (
      job_id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      status TEXT NOT NULL,
      progress REAL,
      error_code TEXT,
      error_message TEXT,
      result_document_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs (status, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_import_jobs_source ON import_jobs (source_type, source_ref);
  `);
  await execSql("PRAGMA user_version = 2;");
}

async function migrateV2ToV3(execSql: ExecSql): Promise<void> {
  await execSql(`
    DROP TABLE IF EXISTS rss_items;
    DROP TABLE IF EXISTS feeds;

    CREATE TABLE IF NOT EXISTS rss_folders (
      folder_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rss_subscriptions (
      subscription_id TEXT PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      title TEXT,
      display_name TEXT,
      site_url TEXT,
      folder_id TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_fetched_at INTEGER,
      status TEXT NOT NULL DEFAULT 'ok',
      error_message TEXT,
      etag TEXT,
      last_modified TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (folder_id) REFERENCES rss_folders(folder_id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rss_subscriptions_folder ON rss_subscriptions (folder_id);
    CREATE INDEX IF NOT EXISTS idx_rss_subscriptions_status ON rss_subscriptions (status, enabled);

    CREATE TABLE IF NOT EXISTS feed_items (
      item_id TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL,
      guid TEXT,
      title TEXT,
      link TEXT,
      author TEXT,
      published_at INTEGER,
      content_html TEXT,
      excerpt TEXT,
      read_state TEXT NOT NULL DEFAULT 'unread',
      saved INTEGER NOT NULL DEFAULT 0,
      document_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (subscription_id) REFERENCES rss_subscriptions(subscription_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_feed_items_subscription ON feed_items (subscription_id, published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_feed_items_read_state ON feed_items (read_state, published_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_items_guid ON feed_items (subscription_id, guid);
  `);
  await execSql("PRAGMA user_version = 3;");
}

async function migrateV3ToV4(execSql: ExecSql): Promise<void> {
  await execSql(`
    ALTER TABLE import_jobs ADD COLUMN asset_id TEXT;
    ALTER TABLE import_jobs ADD COLUMN document_version_id TEXT;
    ALTER TABLE import_jobs ADD COLUMN dedupe_hit INTEGER;
    ALTER TABLE import_jobs ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE import_jobs ADD COLUMN next_retry_at INTEGER;
    ALTER TABLE import_jobs ADD COLUMN parser_version TEXT;

    CREATE TABLE IF NOT EXISTS raw_assets (
      asset_id TEXT PRIMARY KEY,
      asset_hash TEXT NOT NULL UNIQUE,
      byte_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      storage_provider TEXT NOT NULL DEFAULT 'opfs',
      storage_path TEXT NOT NULL,
      parser_hint TEXT,
      ingest_meta_json TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_raw_assets_source ON raw_assets (source_type, source_ref);
    CREATE INDEX IF NOT EXISTS idx_raw_assets_created ON raw_assets (created_at);

    CREATE TABLE IF NOT EXISTS document_assets (
      document_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'primary',
      created_at INTEGER NOT NULL,
      PRIMARY KEY (document_id, asset_id)
    );

    CREATE TABLE IF NOT EXISTS document_versions (
      version_id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      version_index INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      primary_asset_id TEXT NOT NULL,
      change_kind TEXT NOT NULL,
      note TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE (document_id, version_index)
    );
    CREATE INDEX IF NOT EXISTS idx_document_versions_doc ON document_versions (document_id, version_index);
  `);
  await execSql("PRAGMA user_version = 4;");
}

async function migrateV4ToV5(execSql: ExecSql): Promise<void> {
  await execSql(`
    CREATE TABLE IF NOT EXISTS topics (
      topic_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_topics_updated ON topics (updated_at DESC);
  `);
  await execSql("PRAGMA user_version = 5;");
}

async function migrateV5ToV6(execSql: ExecSql): Promise<void> {
  await execSql(`
    ALTER TABLE documents ADD COLUMN saved_at INTEGER;
    CREATE INDEX IF NOT EXISTS idx_documents_saved ON documents (saved_at);
  `);
  await execSql("PRAGMA user_version = 6;");
}

async function migrateV6ToV7(execSql: ExecSql): Promise<void> {
  await execSql(`
    ALTER TABLE topics ADD COLUMN description TEXT;
    ALTER TABLE topics ADD COLUMN color TEXT;

    CREATE TABLE IF NOT EXISTS document_topics (
      document_id TEXT NOT NULL,
      topic_id TEXT NOT NULL,
      added_at INTEGER NOT NULL,
      PRIMARY KEY (document_id, topic_id),
      FOREIGN KEY (document_id) REFERENCES documents(doc_id) ON DELETE CASCADE,
      FOREIGN KEY (topic_id) REFERENCES topics(topic_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_document_topics_topic ON document_topics (topic_id, added_at DESC);
  `);
  await execSql("PRAGMA user_version = 7;");
}

async function migrateV7ToV8(execSql: ExecSql): Promise<void> {
  await execSql(`
    CREATE INDEX IF NOT EXISTS idx_feed_items_document ON feed_items (document_id);
    CREATE INDEX IF NOT EXISTS idx_rss_subscriptions_enabled_poll
      ON rss_subscriptions (enabled, last_fetched_at);
    CREATE INDEX IF NOT EXISTS idx_import_jobs_source
      ON import_jobs (source_type, source_ref);
  `);
  await execSql("PRAGMA user_version = 8;");
}

async function migrateV8ToV9(execSql: ExecSql): Promise<void> {
  await execSql(`
    CREATE TABLE IF NOT EXISTS digests (
      digest_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      date TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      source_item_count INTEGER NOT NULL DEFAULT 0,
      token_usage_json TEXT,
      started_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_digests_user_date ON digests (user_id, date DESC);
    CREATE INDEX IF NOT EXISTS idx_digests_status ON digests (status, created_at);

    CREATE TABLE IF NOT EXISTS digest_cards (
      card_id TEXT PRIMARY KEY,
      digest_id TEXT NOT NULL,
      card_type TEXT NOT NULL,
      headline TEXT NOT NULL,
      summary TEXT NOT NULL,
      why_it_matters TEXT,
      confidence TEXT NOT NULL,
      priority_score INTEGER NOT NULL DEFAULT 0,
      topics_json TEXT NOT NULL DEFAULT '[]',
      citations_json TEXT NOT NULL DEFAULT '[]',
      order_index INTEGER NOT NULL DEFAULT 0,
      generated_at INTEGER NOT NULL,
      FOREIGN KEY (digest_id) REFERENCES digests(digest_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_digest_cards_digest ON digest_cards (digest_id, order_index);

    CREATE TABLE IF NOT EXISTS digest_card_sources (
      card_id TEXT NOT NULL,
      source_item_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      added_at INTEGER NOT NULL,
      PRIMARY KEY (card_id, source_item_id),
      FOREIGN KEY (card_id) REFERENCES digest_cards(card_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS content_items (
      item_id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      source_url TEXT,
      feed_id TEXT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      snippet TEXT,
      author TEXT,
      published_at INTEGER,
      ingested_at INTEGER NOT NULL,
      topics_json TEXT NOT NULL DEFAULT '[]',
      canonical_hash TEXT NOT NULL,
      word_count INTEGER NOT NULL DEFAULT 0,
      has_full_text INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_content_items_ingested ON content_items (ingested_at DESC);
    CREATE INDEX IF NOT EXISTS idx_content_items_source ON content_items (source, feed_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_content_items_hash ON content_items (canonical_hash);
  `);
  await execSql("PRAGMA user_version = 9;");
}

async function migrateV9ToV10(execSql: ExecSql): Promise<void> {
  await execSql(`
    CREATE TABLE IF NOT EXISTS briefs (
      brief_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      cover_image_url TEXT,
      is_public INTEGER NOT NULL DEFAULT 0,
      owner_id TEXT NOT NULL,
      document_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents(doc_id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_briefs_owner ON briefs (owner_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_briefs_public ON briefs (is_public, updated_at DESC);

    CREATE TABLE IF NOT EXISTS brief_items (
      brief_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      item_type TEXT NOT NULL,
      title TEXT NOT NULL,
      source_url TEXT,
      excerpt TEXT,
      note TEXT,
      order_index INTEGER NOT NULL DEFAULT 0,
      added_at INTEGER NOT NULL,
      PRIMARY KEY (brief_id, item_id),
      FOREIGN KEY (brief_id) REFERENCES briefs(brief_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_brief_items_brief ON brief_items (brief_id, order_index);
  `);
  await execSql("PRAGMA user_version = 10;");
}

// Migration registry: version → migration function
const MIGRATIONS: Array<{ from: number; to: number; fn: (exec: ExecSql) => Promise<void> }> = [
  { from: 1, to: 2, fn: migrateV1ToV2 },
  { from: 2, to: 3, fn: migrateV2ToV3 },
  { from: 3, to: 4, fn: migrateV3ToV4 },
  { from: 4, to: 5, fn: migrateV4ToV5 },
  { from: 5, to: 6, fn: migrateV5ToV6 },
  { from: 6, to: 7, fn: migrateV6ToV7 },
  { from: 7, to: 8, fn: migrateV7ToV8 },
  { from: 8, to: 9, fn: migrateV8ToV9 },
  { from: 9, to: 10, fn: migrateV9ToV10 },
];

/**
 * Run schema migrations.
 * @param currentVersion The current user_version in DB
 * @param execSql Function to execute SQL
 */
export async function runMigrations(currentVersion: number, execSql: ExecSql): Promise<void> {
  // Fresh install: create all tables at once
  if (currentVersion < 1) {
    await execSql(SCHEMA_SQL);
    await execSql(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION};`);
    return;
  }

  // Run applicable migrations in order
  for (const migration of MIGRATIONS) {
    if (currentVersion >= migration.from && currentVersion < migration.to) {
      await migration.fn(execSql);
    }
  }
}

export const CURRENT_SCHEMA_VERSION = 10;
