export interface EmbeddingProvider {
  dimension: number;
  embed(texts: string[]): Promise<number[][]>;
}

export class HashEmbeddingProvider implements EmbeddingProvider {
  readonly dimension: number;

  constructor(dimension = 384) {
    this.dimension = dimension;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.embedOne(text));
  }

  private embedOne(text: string): number[] {
    const seed = hashString(text);
    const vector = new Array<number>(this.dimension);
    let state = seed;

    for (let i = 0; i < this.dimension; i += 1) {
      state = (state * 1664525 + 1013904223) >>> 0;
      const value = state / 0xffffffff;
      vector[i] = value * 2 - 1;
    }

    return normalizeVector(vector);
  }
}

export function createHashEmbeddingProvider(dimension = 384): EmbeddingProvider {
  return new HashEmbeddingProvider(dimension);
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeVector(vector: number[]): number[] {
  let sumSquares = 0;
  for (const value of vector) {
    sumSquares += value * value;
  }
  const norm = Math.sqrt(sumSquares) || 1;
  return vector.map((value) => value / norm);
}
