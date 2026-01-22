/**
 * Graph Builder
 */

import { replaceReducer } from "./reducers";
import type {
  ChannelDefinition,
  ChannelKey,
  ChannelReducer,
  GraphDefinition,
  GraphNodeDefinition,
} from "./types";

export interface GraphBuilderOptions {
  readonly idFactory?: () => string;
}

export class GraphBuilder {
  private readonly channelMap = new Map<string, ChannelDefinition<unknown>>();
  private readonly nodes: GraphNodeDefinition[] = [];
  private readonly idFactory: () => string;

  constructor(options: GraphBuilderOptions = {}) {
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
  }

  createChannel<T>(
    name: string,
    options: { reducer?: ChannelReducer<T>; initial?: T } = {}
  ): ChannelKey<T> {
    if (this.channelMap.has(name)) {
      throw new Error(`Channel '${name}' already exists`);
    }

    const key: ChannelKey<T> = Object.freeze({ name });
    const reducer = options.reducer ?? replaceReducer;
    const definition: ChannelDefinition<T> = {
      key,
      reducer,
      initial: options.initial,
    };

    this.channelMap.set(name, definition as ChannelDefinition<unknown>);
    return key;
  }

  addNode(definition: Omit<GraphNodeDefinition, "id"> & { id?: string }): GraphNodeDefinition {
    const id = definition.id ?? this.idFactory();
    if (this.nodes.some((node) => node.id === id)) {
      throw new Error(`Node '${id}' already exists`);
    }

    for (const channel of [...definition.reads, ...definition.writes]) {
      if (!this.channelMap.has(channel.name)) {
        throw new Error(`Channel '${channel.name}' is not registered`);
      }
    }

    const node: GraphNodeDefinition = {
      ...definition,
      id,
    };

    this.nodes.push(node);
    return node;
  }

  build(): GraphDefinition {
    return {
      channels: Array.from(this.channelMap.values()),
      nodes: [...this.nodes],
    };
  }
}

export function createGraphBuilder(options?: GraphBuilderOptions): GraphBuilder {
  return new GraphBuilder(options);
}
