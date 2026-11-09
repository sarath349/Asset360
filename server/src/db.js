import fs from 'node:fs';
import { MongoClient } from 'mongodb';
import { EmbeddedDb } from './embeddedDb.js';

let client;
let db;
let mode = 'mongo';

function useEmbedded() {
  return process.env.ASSET360_EMBEDDED === '1' || Boolean(process.env.DATA_DIR);
}

export async function connectDb(options = {}) {
  if (db) return db;

  if (options.dataDir) process.env.DATA_DIR = options.dataDir;
  if (options.embedded) process.env.ASSET360_EMBEDDED = '1';

  if (useEmbedded()) {
    const dataDir = process.env.DATA_DIR || './data';
    fs.mkdirSync(dataDir, { recursive: true });
    db = new EmbeddedDb(dataDir);
    mode = 'embedded';
    console.log(`Asset360 DB: embedded file store at ${dataDir}`);
    return db;
  }

  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/asset360';
  client = new MongoClient(uri);
  await client.connect();
  db = client.db();
  mode = 'mongo';
  await ensureIndexes(db);
  console.log(`Asset360 DB: MongoDB at ${uri}`);
  return db;
}

export function getDb() {
  if (!db) throw new Error('Database not connected');
  return db;
}

export function getDbMode() {
  return mode;
}

export async function nextId(name) {
  const result = await getDb().collection('counters').findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  // Mongo driver may return doc or { value: doc }; embedded returns doc.
  const doc = result?.seq != null ? result : result?.value;
  if (!doc?.seq) {
    // Fallback read
    const again = await getDb().collection('counters').findOne({ _id: name });
    return again.seq;
  }
  return doc.seq;
}

export function publicDoc(doc, { keepPasswordHash = false } = {}) {
  if (!doc) return doc;
  if (Array.isArray(doc)) return doc.map((d) => publicDoc(d, { keepPasswordHash }));
  const { _id, ...rest } = doc;
  if (!keepPasswordHash) delete rest.passwordHash;
  return rest;
}

async function ensureIndexes(database) {
  await database.collection('users').createIndex({ username: 1 }, { unique: true });
  await database.collection('assets').createIndex({ assetId: 1 }, { unique: true });
  await database.collection('assets').createIndex({ assetCode: 1 });
  await database.collection('assets').createIndex({ qrCode: 1 });
  await database.collection('assets').createIndex({ locationId: 1 });
  await database.collection('categories').createIndex({ categoryId: 1 }, { unique: true });
  await database.collection('subcategories').createIndex({ subCategoryId: 1 }, { unique: true });
  await database.collection('assettypes').createIndex({ assetTypeId: 1 }, { unique: true });
  await database.collection('locations').createIndex({ locationId: 1 }, { unique: true });
  await database.collection('sublocations').createIndex({ subLocationId: 1 }, { unique: true });
  await database.collection('sublocations').createIndex({ locationId: 1 });
  await database.collection('departments').createIndex({ departmentId: 1 }, { unique: true });
  await database.collection('employees').createIndex({ employeeId: 1 }, { unique: true });
  await database.collection('assignments').createIndex({ assignmentHistoryId: 1 }, { unique: true });
  await database.collection('audits').createIndex({ auditId: 1 }, { unique: true });
  await database.collection('auditScans').createIndex({ scanLogId: 1 }, { unique: true });
  await database.collection('depreciations').createIndex({ depreciationId: 1 }, { unique: true });
  await database.collection('disposals').createIndex({ disposalId: 1 }, { unique: true });
  await database.collection('contracts').createIndex({ contractId: 1 }, { unique: true });
}
