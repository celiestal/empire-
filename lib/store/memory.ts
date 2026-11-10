import type { Backend, CollectionName, Collections, Singletons } from "./index";

/** In-process store. Survives hot reloads in dev, resets on restart. */
export class MemoryStore implements Backend {
  private data = new Map<string, Map<string, unknown>>();
  private singletons = new Map<string, unknown>();

  static shared(): MemoryStore {
    const g = globalThis as { __empireMemoryStore?: MemoryStore };
    g.__empireMemoryStore ??= new MemoryStore();
    return g.__empireMemoryStore;
  }

  private coll(name: string): Map<string, unknown> {
    let c = this.data.get(name);
    if (!c) {
      c = new Map();
      this.data.set(name, c);
    }
    return c;
  }

  async list<C extends CollectionName>(collection: C): Promise<Collections[C][]> {
    return [...this.coll(collection).values()].map((v) => structuredClone(v) as Collections[C]);
  }

  async get<C extends CollectionName>(collection: C, id: string): Promise<Collections[C] | null> {
    const v = this.coll(collection).get(id);
    return v ? (structuredClone(v) as Collections[C]) : null;
  }

  async put<C extends CollectionName>(collection: C, record: Collections[C]): Promise<void> {
    this.coll(collection).set(record.id, structuredClone(record));
  }

  async getSingleton<K extends keyof Singletons>(key: K): Promise<Singletons[K] | null> {
    const v = this.singletons.get(key);
    return v ? (structuredClone(v) as Singletons[K]) : null;
  }

  async putSingleton<K extends keyof Singletons>(key: K, value: Singletons[K]): Promise<void> {
    this.singletons.set(key, structuredClone(value));
  }
}
