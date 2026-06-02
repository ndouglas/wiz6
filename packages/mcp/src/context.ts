// Shared server-wide context: lazily-built SymbolIndex + BssStruct registry.
//
// One McpContext per server instance. Tool handlers receive it via closure
// (the registerTool callbacks read it directly). The live tools consume the
// struct registry; the symbol tools consume the SymbolIndex.

import { resolve } from 'node:path';
import {
  ALL_STRUCTS,
  buildStructRegistry,
  type BssStruct,
  type SymbolIndex,
} from '@wiz6/data';
import { loadSymbolIndex } from './symbols-loader.js';

export interface McpContextOptions {
  /** Repo-root path used to locate the findings docs the SymbolIndex loads from. */
  cwd?: string;
  /** Optional explicit findings dir override. */
  findingsDir?: string;
}

export class McpContext {
  readonly repoRoot: string;

  private symbolIndex_: SymbolIndex | null = null;
  private readonly structRegistry_: ReadonlyMap<string, BssStruct>;
  private readonly findingsDir?: string | undefined;

  constructor(opts: McpContextOptions = {}) {
    this.repoRoot = resolve(opts.cwd ?? process.cwd());
    if (opts.findingsDir !== undefined) {
      this.findingsDir = opts.findingsDir;
    }
    this.structRegistry_ = buildStructRegistry(ALL_STRUCTS);
  }

  /** Lazily load the symbol index. */
  get symbols(): SymbolIndex {
    if (!this.symbolIndex_) {
      this.symbolIndex_ = this.findingsDir
        ? loadSymbolIndex({ findingsDir: this.findingsDir })
        : loadSymbolIndex({ cwd: this.repoRoot });
    }
    return this.symbolIndex_;
  }

  get structs(): ReadonlyMap<string, BssStruct> {
    return this.structRegistry_;
  }
}
