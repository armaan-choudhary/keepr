export interface ILocalStorageEngine {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(prefix?: string): Promise<string[]>;
  getAll<T>(prefix?: string): Promise<Map<string, T>>;
}

export interface IStorageAdapter {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix?: string): Promise<string[]>;
  clear(): Promise<void>;
}

export class InMemoryStorageAdapter implements IStorageAdapter {
  private readonly store = new Map<string, string>();

  async read(key: string): Promise<string | null> {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  async write(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async keys(prefix?: string): Promise<string[]> {
    const allKeys = Array.from(this.store.keys());
    if (!prefix) return allKeys;
    return allKeys.filter((k) => k.startsWith(prefix));
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

export class DurableStorageEngine implements ILocalStorageEngine {
  private readonly adapter: IStorageAdapter;

  constructor(adapter?: IStorageAdapter) {
    this.adapter = adapter ?? new InMemoryStorageAdapter();
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.adapter.read(key);
    if (raw === null || raw === undefined) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    const serialized = JSON.stringify(value);
    await this.adapter.write(key, serialized);
  }

  async remove(key: string): Promise<void> {
    await this.adapter.delete(key);
  }

  async clear(): Promise<void> {
    await this.adapter.clear();
  }

  async keys(prefix?: string): Promise<string[]> {
    return this.adapter.keys(prefix);
  }

  async getAll<T>(prefix?: string): Promise<Map<string, T>> {
    const matchingKeys = await this.keys(prefix);
    const results = new Map<string, T>();
    for (const key of matchingKeys) {
      const val = await this.get<T>(key);
      if (val !== null) {
        results.set(key, val);
      }
    }
    return results;
  }
}
