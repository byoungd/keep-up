#![allow(non_snake_case)]

mod core;

pub use core::{IndexStats, QueryOptions, Symbol, SymbolIndex, SymbolResult};

use napi_derive::napi;

#[allow(non_snake_case)]
#[napi(object)]
pub struct NapiSymbol {
    pub name: String,
    pub kind: String,
    pub file: String,
    pub line: u32,
    pub column: u32,
    pub endLine: u32,
    pub endColumn: u32,
    pub container: Option<String>,
    pub detail: Option<String>,
}

impl From<NapiSymbol> for core::Symbol {
    fn from(symbol: NapiSymbol) -> Self {
        Self {
            name: symbol.name,
            kind: symbol.kind,
            file: symbol.file,
            line: symbol.line,
            column: symbol.column,
            end_line: symbol.endLine,
            end_column: symbol.endColumn,
            container: symbol.container,
            detail: symbol.detail,
        }
    }
}

impl From<core::Symbol> for NapiSymbol {
    fn from(symbol: core::Symbol) -> Self {
        Self {
            name: symbol.name,
            kind: symbol.kind,
            file: symbol.file,
            line: symbol.line,
            column: symbol.column,
            endLine: symbol.end_line,
            endColumn: symbol.end_column,
            container: symbol.container,
            detail: symbol.detail,
        }
    }
}

#[allow(non_snake_case)]
#[napi(object)]
pub struct NapiQueryOptions {
    pub limit: Option<u32>,
    pub kinds: Option<Vec<String>>,
}

impl From<NapiQueryOptions> for core::QueryOptions {
    fn from(options: NapiQueryOptions) -> Self {
        Self {
            limit: options.limit.map(|value| value as usize),
            kinds: options.kinds,
        }
    }
}

#[napi(object)]
pub struct NapiSymbolResult {
    pub symbol: NapiSymbol,
    pub score: u32,
}

impl From<core::SymbolResult> for NapiSymbolResult {
    fn from(result: core::SymbolResult) -> Self {
        Self {
            symbol: result.symbol.into(),
            score: result.score,
        }
    }
}

#[allow(non_snake_case)]
#[napi(object)]
pub struct NapiIndexStats {
    pub symbolCount: u32,
    pub fileCount: u32,
}

impl From<core::IndexStats> for NapiIndexStats {
    fn from(stats: core::IndexStats) -> Self {
        Self {
            symbolCount: stats.symbol_count as u32,
            fileCount: stats.file_count as u32,
        }
    }
}

#[napi(js_name = "SymbolIndex")]
pub struct NapiSymbolIndex {
    inner: core::SymbolIndex,
}

#[napi]
impl NapiSymbolIndex {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            inner: core::SymbolIndex::new(),
        }
    }

    #[napi(js_name = "updateFile")]
    pub fn update_file(&mut self, path: String, symbols: Vec<NapiSymbol>) {
        let native_symbols: Vec<core::Symbol> =
            symbols.into_iter().map(core::Symbol::from).collect();
        self.inner.update_file(&path, &native_symbols);
    }

    #[napi(js_name = "removeFile")]
    pub fn remove_file(&mut self, path: String) {
        self.inner.remove_file(&path);
    }

    #[napi]
    pub fn query(&self, query: String, options: Option<NapiQueryOptions>) -> Vec<NapiSymbolResult> {
        let query_options = options.map(core::QueryOptions::from).unwrap_or_default();
        self.inner
            .query(&query, query_options)
            .into_iter()
            .map(NapiSymbolResult::from)
            .collect()
    }

    #[napi]
    pub fn stats(&self) -> NapiIndexStats {
        self.inner.stats().into()
    }
}
