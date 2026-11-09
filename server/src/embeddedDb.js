import fs from 'node:fs';
import path from 'node:path';
import Datastore from '@seald-io/nedb';

/**
 * Lightweight Mongo-compatible layer on NeDB (pure JS files).
 * Used for single-installer desktop builds — no external MongoDB process.
 */

function normalizeQuery(query = {}) {
  if (!query || typeof query !== 'object') return query;
  const out = {};
  for (const [k, v] of Object.entries(query)) {
    if (k === '$or' && Array.isArray(v)) {
      out.$or = v.map(normalizeQuery);
      continue;
    }
    if (v instanceof RegExp) {
      out[k] = v;
      continue;
    }
    if (v && typeof v === 'object' && v.$regex) {
      const flags = v.$options || undefined;
      out[k] = v.$regex instanceof RegExp ? v.$regex : new RegExp(v.$regex, flags);
      continue;
    }
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      const ops = {};
      for (const [op, val] of Object.entries(v)) {
        if (op === '$not' && val instanceof RegExp) ops.$where = function () { return !val.test(this[k]); };
        else ops[op] = val;
      }
      // Prefer direct ops NeDB understands; fall back to leaving as-is.
      if (ops.$where) {
        // NeDB field-level $not is limited; apply post-filter in find instead via _postFilter.
        out[k] = v;
      } else {
        out[k] = ops;
      }
      continue;
    }
    out[k] = v;
  }
  return out;
}

function matchesNotRegex(doc, query) {
  for (const [k, v] of Object.entries(query || {})) {
    if (v && typeof v === 'object' && v.$not instanceof RegExp) {
      const val = doc[k] == null ? '' : String(doc[k]);
      if (v.$not.test(val)) return false;
    }
  }
  return true;
}

function stripNotOps(query = {}) {
  const out = { ...query };
  for (const [k, v] of Object.entries(out)) {
    if (v && typeof v === 'object' && v.$not instanceof RegExp) {
      const { $not, ...rest } = v;
      if (Object.keys(rest).length) out[k] = rest;
      else delete out[k];
    }
  }
  return out;
}

class Cursor {
  constructor(collection, query) {
    this.collection = collection;
    this.query = query || {};
    this._sort = null;
  }
  sort(spec) {
    this._sort = spec;
    return this;
  }
  async toArray() {
    return this.collection._find(this.query, this._sort);
  }
}

class Collection {
  constructor(ds) {
    this.ds = ds;
  }

  async _find(query, sortSpec) {
    const raw = stripNotOps(query);
    let rows = await this.ds.findAsync(normalizeQuery(raw));
    rows = rows.filter((d) => matchesNotRegex(d, query));
    if (sortSpec) {
      const entries = Object.entries(sortSpec);
      rows.sort((a, b) => {
        for (const [key, dir] of entries) {
          const av = a[key];
          const bv = b[key];
          if (av === bv) continue;
          if (av == null) return 1 * dir;
          if (bv == null) return -1 * dir;
          return (av > bv ? 1 : -1) * dir;
        }
        return 0;
      });
    }
    return rows;
  }

  find(query = {}) {
    return new Cursor(this, query);
  }

  async findOne(query = {}) {
    const rows = await this._find(query, null);
    return rows[0] || null;
  }

  async insertOne(doc) {
    const inserted = await this.ds.insertAsync({ ...doc });
    return { insertedId: inserted._id, acknowledged: true };
  }

  async insertMany(docs) {
    const inserted = await this.ds.insertAsync(docs.map((d) => ({ ...d })));
    return { insertedCount: inserted.length, acknowledged: true };
  }

  async updateOne(filter, update) {
    const result = await this.ds.updateAsync(normalizeQuery(stripNotOps(filter)), update, { multi: false, upsert: false });
    return { matchedCount: result, modifiedCount: result, acknowledged: true };
  }

  async updateMany(filter, update) {
    const result = await this.ds.updateAsync(normalizeQuery(stripNotOps(filter)), update, { multi: true, upsert: false });
    return { matchedCount: result, modifiedCount: result, acknowledged: true };
  }

  async replaceOne(filter, doc) {
    const existing = await this.findOne(filter);
    if (!existing) return { matchedCount: 0, modifiedCount: 0 };
    const { _id, ...rest } = doc;
    const result = await this.ds.updateAsync({ _id: existing._id }, { ...rest, _id: existing._id }, { multi: false });
    return { matchedCount: result ? 1 : 0, modifiedCount: result ? 1 : 0 };
  }

  async deleteOne(filter) {
    const result = await this.ds.removeAsync(normalizeQuery(stripNotOps(filter)), { multi: false });
    return { deletedCount: result };
  }

  async deleteMany(filter) {
    const result = await this.ds.removeAsync(normalizeQuery(stripNotOps(filter)), { multi: true });
    return { deletedCount: result };
  }

  async countDocuments(filter = {}) {
    return this.ds.countAsync(normalizeQuery(stripNotOps(filter)));
  }

  async findOneAndUpdate(filter, update, options = {}) {
    const upsert = Boolean(options.upsert);
    await this.ds.updateAsync(normalizeQuery(stripNotOps(filter)), update, { multi: false, upsert });
    const doc = await this.findOne(filter);
    // Return shape similar to Mongo driver's findOneAndUpdate with returnDocument: 'after'
    return doc;
  }

  async createIndex() {
    return null;
  }
}

export class EmbeddedDb {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.collections = new Map();
    fs.mkdirSync(dataDir, { recursive: true });
  }

  collection(name) {
    if (this.collections.has(name)) return this.collections.get(name);
    const filename = path.join(this.dataDir, `${name}.db`);
    const ds = new Datastore({ filename, autoload: true, timestampData: false });
    const col = new Collection(ds);
    this.collections.set(name, col);
    return col;
  }
}
