export class BestValueProvider<MatrixEntry, AccumValue> {
  private matrix: {
    [tokenA: string]: { [tokenB: string]: MatrixEntry | null };
  } = {};
  private pathCache: {
    [tokenA: string]: {
      [tokenB: string]: { value: AccumValue; path: string[] } | null;
    };
  } = {};

  readonly maxNodes: number;
  private accumulate: (
    accumulator: AccumValue,
    value: MatrixEntry,
  ) => AccumValue;
  private createAccumulator: (_: void) => AccumValue;
  private isGreater: (value1: AccumValue, value2: AccumValue) => boolean;

  // 🔹 Track previous search parameters for each (forToken, against)
  private cacheParams: {
    [forToken: string]: {
      [againstToken: string]: {
        exclude: Set<string>;
        includeOnly: Set<string>;
      };
    };
  } = {};

  constructor(
    tokens: string[],
    operator: (accumulator: AccumValue, value: MatrixEntry) => AccumValue,
    createAccumulator: (_: void) => AccumValue,
    isGreater: (value1: AccumValue, value2: AccumValue) => boolean,
    maxNodes = 4,
  ) {
    this.maxNodes = maxNodes;
    this.accumulate = operator;
    this.isGreater = isGreater;
    this.createAccumulator = createAccumulator;
    tokens.forEach((tokenA) => {
      this.matrix[tokenA] = {};
      this.pathCache[tokenA] = {};
      this.cacheParams[tokenA] = {}; // 🔹 Initialize cacheParams for each token
      tokens.forEach((tokenB) => {
        this.pathCache[tokenA][tokenB] = null;
        this.matrix[tokenA][tokenB] = null;
      });
    });
  }

  updateEntry(
    tokenA: string,
    tokenB: string,
    value: MatrixEntry | null,
    reverseValue: MatrixEntry | null,
  ): void {
    if (value == null) {
      this.matrix[tokenA][tokenB] = null;
      this.matrix[tokenB][tokenA] = null;
    } else {
      this.matrix[tokenA][tokenB] = value;
      this.matrix[tokenB][tokenA] = reverseValue;
    }
  }

  getPath(
    bestValue: AccumValue,
    forToken: string,
    against = new Set(["USDT", "AUSDT", "USDC", "AUSDC"]),
    exclude = new Set<string>([]), // 🔹 Exclude certain tokens
    includeOnly = new Set<string>([]),
  ): {
    // 🔹 Only allow specific tokens in the path): {
    value: AccumValue | null;
    path: string[] | null;
  } {
    // Ensure `forToken` is not excluded
    exclude.delete(forToken);
    // If `includeOnly` is non-empty, ensure forToken contains against and forToken
    if (includeOnly.size > 0) {
      against.forEach((value) => includeOnly.add(value));
      includeOnly.add(forToken);
    }

    // 🔹 Initialize cacheParams if it doesn't exist
    for (const targetToken of against) {
      if (this.cacheParams[forToken] === undefined) continue;

      if (!this.cacheParams[forToken][targetToken]) {
        this.cacheParams[forToken][targetToken] = {
          exclude: new Set(),
          includeOnly: new Set(),
        };
      }
      const cacheParam = this.cacheParams[forToken][targetToken];

      // 🔹 Reset cache if search criteria changed for this (forToken, targetToken)
      if (
        !this.isSubset(cacheParam.exclude, exclude) ||
        !this.isSuperset(cacheParam.includeOnly, includeOnly)
      ) {
        this.pathCache[forToken][targetToken] = null; // 🔹 Clear only this token pair cache
        this.cacheParams[forToken][targetToken] = {
          exclude: new Set(exclude),
          includeOnly: new Set(includeOnly),
        };
      }
    }

    // Check if the path is already cached for any of the target tokens
    for (const targetToken of against) {
      // if not supported token for
      if (this.pathCache[forToken] === undefined) break;
      if (this.pathCache[forToken][targetToken] !== null) {
        const cachedPath = this.pathCache[forToken][targetToken]!;
        // if not supported token to
        if (cachedPath == undefined) continue;
        // Recalculate the value using the latest values
        const value = this.calculateValueFromPath(cachedPath.path);
        if (
          value !== null &&
          this.isValidCachedPath(cachedPath.path, exclude, includeOnly)
        ) {
          return { value, path: cachedPath.path };
        }
      }
    }

    const result = this.findBestPathBFS(
      forToken,
      against,
      this.maxNodes,
      bestValue,
      exclude,
      includeOnly,
    );
    if (result !== null) {
      // Cache the result for future use
      for (let targetToken in against) {
        this.pathCache[forToken][targetToken] = {
          value: result.value,
          path: result.path,
        };
      }
      return { value: result.value, path: result.path };
    }
    return { value: null, path: null };
  }

  private findBestPathBFS(
    tokenA: string,
    tokensB: Set<string>,
    maxNodesAllowedToVisit: number,
    initialBest: AccumValue,
    exclude: Set<string>, // 🔹 Exclude certain tokens
    includeOnly: Set<string>, // 🔹 Only include specific tokens
  ): { value: AccumValue; path: string[] } | null {
    let queue: { path: string[]; value: AccumValue }[] = [
      { path: [tokenA], value: this.createAccumulator() },
    ];
    let visited = new Set<string>([tokenA]);

    let bestPath: string[] | null = null;
    let bestValue = initialBest;
    while (queue.length > 0) {
      const { path, value } = queue.shift()!;
      const lastToken = path[path.length - 1];

      if (tokensB.has(lastToken)) {
        if (this.isGreater(value, bestValue)) {
          bestPath = path;
          bestValue = value;
        }
        continue;
      }

      if (path.length > maxNodesAllowedToVisit + 1) continue;

      for (const neighbor in this.matrix[lastToken]) {
        if (exclude.has(neighbor)) continue; // 🔹 Skip excluded tokens
        if (includeOnly.size > 0 && !includeOnly.has(neighbor)) continue; // 🔹 Skip if not in `includeOnly`

        const matrixEntry = this.matrix[lastToken][neighbor];
        if (matrixEntry !== null && !visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({
            path: [...path, neighbor],
            value: this.accumulate(value, matrixEntry),
          });
        }
      }
    }

    if (bestPath) {
      return { value: bestValue, path: bestPath };
    }

    return null;
  }

  private calculateValueFromPath(path: string[]): AccumValue | null {
    let value = this.createAccumulator();
    for (let i = 0; i < path.length - 1; i++) {
      const tokenA = path[i];
      const tokenB = path[i + 1];
      const matrixEntry = this.matrix[tokenA][tokenB];
      if (matrixEntry === null) {
        return null; // If any part of the path is invalid, return null
      }
      value = this.accumulate(value, matrixEntry);
    }
    return value;
  }

  getBestValue(token: string, bestValue: AccumValue): AccumValue | null {
    const result = this.getPath(bestValue, token);
    return result.value;
  }

  private isValidCachedPath(
    path: string[],
    exclude: Set<string>,
    includeOnly: Set<string>,
  ): boolean {
    // 🔹 Ensure path does not contain excluded tokens
    if (path.some((token) => exclude.has(token))) {
      return false;
    }

    // 🔹 If `includeOnly` is used, ensure all tokens are allowed
    if (includeOnly.size > 0) {
      return path.every((token) => includeOnly.has(token));
    }
    return true;
  }

  private isSubset(smallSet: Set<string>, largeSet: Set<string>): boolean {
    return [...smallSet].every((item) => largeSet.has(item));
  }

  private isSuperset(largeSet: Set<string>, smallSet: Set<string>): boolean {
    return [...smallSet].every((item) => largeSet.has(item));
  }
}
