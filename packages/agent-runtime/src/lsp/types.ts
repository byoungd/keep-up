export interface SymbolContextOptions {
  limit?: number;
  maxChars?: number;
}

export interface SymbolContextProvider {
  getSymbolContext(query: string, options?: SymbolContextOptions): string | undefined;
}
