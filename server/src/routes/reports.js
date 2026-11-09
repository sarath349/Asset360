import { Router } from 'express';
import { getDb, publicDoc } from '../db.js';
import { inDateRange } from '../helpers.js';

const router = Router();

router.get('/assets-by-location', async (_req, res) => {
  const db = getDb();
  const [assets, locations] = await Promise.all([db.collection('assets').find({}).toArray(), db.collection('locations').find({}).toArray()]);
  const locMap = new Map(locations.map((l) => [l.locationId, l.locationName]));
  const map = new Map();
  for (const a of assets) {
    const label = locMap.get(a.locationId) || 'Unassigned';
    const cur = map.get(label) || { location: label, count: 0, value: 0 };
    cur.count += 1;
    cur.value += Number(a.purchaseCost) || 0;
    map.set(label, cur);
  }
  res.json([...map.values()]);
});

router.get('/assets-by-category', async (_req, res) => {
  const db = getDb();
  const [assets, categories] = await Promise.all([db.collection('assets').find({}).toArray(), db.collection('categories').find({}).toArray()]);
  const catMap = new Map(categories.map((c) => [c.categoryId, c.categoryName]));
  const map = new Map();
  for (const a of assets) {
    const label = catMap.get(a.categoryId) || 'Unassigned';
    const cur = map.get(label) || { category: label, count: 0, value: 0 };
    cur.count += 1;
    cur.value += Number(a.purchaseCost) || 0;
    map.set(label, cur);
  }
  res.json([...map.values()]);
});

router.get('/asset-value', async (_req, res) => {
  const db = getDb();
  const [assets, deps] = await Promise.all([db.collection('assets').find({}).toArray(), db.collection('depreciations').find({}).toArray()]);
  const depMap = new Map();
  for (const d of deps) {
    if (!depMap.has(d.assetId)) depMap.set(d.assetId, d);
  }
  res.json(
    assets.map((a) => {
      const d = depMap.get(a.assetId);
      return {
        assetId: a.assetId,
        assetCode: a.assetCode,
        assetName: a.assetName,
        purchaseValue: Number(a.purchaseCost) || 0,
        accumulatedDepreciation: d?.accumulatedDepreciation || 0,
        bookValue: d?.currentBookValue ?? (Number(a.purchaseCost) || 0),
      };
    })
  );
});

router.get('/warranty-expiry', async (req, res) => {
  const assets = await getDb().collection('assets').find({}).toArray();
  res.json(
    assets
      .filter((a) => inDateRange(a.warrantyEndDate, req.query.fromDate, req.query.toDate))
      .map((a) => ({
        assetId: a.assetId,
        assetCode: a.assetCode,
        assetName: a.assetName,
        warrantyEndDate: a.warrantyEndDate,
      }))
  );
});

router.get('/amc-expiry', async (req, res) => {
  const assets = await getDb().collection('assets').find({}).toArray();
  res.json(
    assets
      .filter((a) => inDateRange(a.amcEndDate, req.query.fromDate, req.query.toDate))
      .map((a) => ({
        assetId: a.assetId,
        assetCode: a.assetCode,
        assetName: a.assetName,
        amcEndDate: a.amcEndDate,
      }))
  );
});

router.get('/depreciation', async (req, res) => {
  const rows = await getDb().collection('depreciationHistory').find({}).toArray();
  res.json(
    rows
      .filter((r) => inDateRange(r.calculatedDate, req.query.fromDate, req.query.toDate))
      .map(publicDoc)
  );
});

router.get('/disposals', async (req, res) => {
  const rows = await getDb().collection('disposals').find({}).toArray();
  res.json(
    rows
      .filter((r) => inDateRange(r.disposalDate || r.requestDate, req.query.fromDate, req.query.toDate))
      .map(publicDoc)
  );
});

router.get('/asset-lifecycle', async (_req, res) => {
  const assets = await getDb().collection('assets').find({}).toArray();
  res.json(
    assets.map((a) => ({
      assetId: a.assetId,
      assetCode: a.assetCode,
      assetName: a.assetName,
      status: a.status,
      purchaseDate: a.purchaseDate,
      locationId: a.locationId,
      subLocationId: a.subLocationId,
      departmentId: a.departmentId,
      assignedTo: a.assignedTo,
      warrantyEndDate: a.warrantyEndDate,
      amcEndDate: a.amcEndDate,
      createdDate: a.createdDate,
      updatedDate: a.updatedDate,
    }))
  );
});

router.get('/audit-discrepancies/:auditId', async (req, res) => {
  const auditId = Number(req.params.auditId);
  const db = getDb();
  const [items, scans, assets] = await Promise.all([
    db.collection('auditItems').find({ auditId }).toArray(),
    db.collection('auditScans').find({ auditId }).toArray(),
    db.collection('assets').find({}).toArray(),
  ]);
  const assetMap = new Map(assets.map((a) => [a.assetId, a]));
  const missing = items
    .filter((i) => !i.scanned)
    .map((i) => ({
      type: 'Missing',
      assetId: i.assetId,
      assetCode: assetMap.get(i.assetId)?.assetCode || null,
      assetName: assetMap.get(i.assetId)?.assetName || null,
    }));
  const unexpected = scans
    .filter((s) => s.scanResult === 'Unexpected')
    .map((s) => ({
      type: 'Unexpected',
      assetId: s.assetId,
      scanCode: s.scanCode,
      assetCode: assetMap.get(s.assetId)?.assetCode || null,
      assetName: assetMap.get(s.assetId)?.assetName || null,
    }));
  res.json([...missing, ...unexpected]);
});

export default router;
