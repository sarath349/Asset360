import { Router } from 'express';
import { getDb, nextId, publicDoc } from '../db.js';
import { nowIso } from '../helpers.js';

const router = Router();

function assetDefaults(body = {}) {
  return {
    assetCode: null,
    assetName: null,
    description: null,
    remarks: null,
    categoryId: null,
    subCategoryId: null,
    assetTypeId: null,
    serialNumber: null,
    brand: null,
    model: null,
    manufacturer: null,
    yearOfManufacture: null,
    color: null,
    specifications: null,
    quantity: 1,
    purchaseDate: null,
    purchaseCost: null,
    currency: 'AED',
    vendorId: null,
    vendorName: null,
    warrantyStartDate: null,
    warrantyEndDate: null,
    amcStartDate: null,
    amcEndDate: null,
    insuranceStartDate: null,
    insuranceEndDate: null,
    insurancePolicyNumber: null,
    externalTagNumber: null,
    placedInServiceDate: null,
    refValue1: null,
    refValue2: null,
    refValue3: null,
    locationId: null,
    subLocationId: null,
    departmentId: null,
    assignedTo: null,
    custodianEmployeeId: null,
    status: 'In Store',
    condition: null,
    ownershipType: 'Owned',
    qrCode: null,
    rfidTag: null,
    images: [],
    documents: [],
    latitude: null,
    longitude: null,
    geoAddress: null,
    createdDate: nowIso(),
    updatedDate: null,
    ...body,
  };
}

router.get('/', async (_req, res) => {
  const rows = await getDb().collection('assets').find({}).sort({ assetId: 1 }).toArray();
  res.json(rows.map(publicDoc));
});

router.get('/full', async (_req, res) => {
  const db = getDb();
  const [assets, categories, subcategories] = await Promise.all([
    db.collection('assets').find({}).toArray(),
    db.collection('categories').find({}).toArray(),
    db.collection('subcategories').find({}).toArray(),
  ]);
  const catMap = new Map(categories.map((c) => [c.categoryId, c.categoryName]));
  const subMap = new Map(subcategories.map((s) => [s.subCategoryId, s.subCategoryName]));
  res.json(
    assets.map((a) => ({
      assetId: a.assetId,
      assetCode: a.assetCode,
      assetName: a.assetName,
      category: catMap.get(a.categoryId) || null,
      subCategory: subMap.get(a.subCategoryId) || null,
      status: a.status,
      brand: a.brand,
      model: a.model,
    }))
  );
});

router.post('/bulk', async (req, res) => {
  const items = Array.isArray(req.body?.assets) ? req.body.assets : Array.isArray(req.body) ? req.body : [];
  if (!items.length) return res.status(400).json({ message: 'Provide an assets array' });
  const db = getDb();
  const created = [];
  const errors = [];
  for (let i = 0; i < items.length; i++) {
    const row = i + 1;
    const raw = items[i] || {};
    try {
      if (!raw.assetName && !raw.assetCode) {
        errors.push({ row, message: 'assetName or assetCode is required' });
        continue;
      }
      if (raw.assetCode) {
        const dup = await db.collection('assets').findOne({ assetCode: String(raw.assetCode).trim() });
        if (dup) {
          errors.push({ row, message: `Duplicate asset code ${raw.assetCode}` });
          continue;
        }
      }
      const id = await nextId('assets');
      const body = assetDefaults({ ...raw, assetId: id, createdDate: nowIso() });
      if (!body.assetCode) body.assetCode = `AST-${String(id).padStart(5, '0')}`;
      if (!body.qrCode) body.qrCode = body.assetCode;
      await db.collection('assets').insertOne(body);
      created.push(publicDoc(body));
    } catch (err) {
      errors.push({ row, message: err.message || 'Failed' });
    }
  }
  res.json({ created: created.length, assets: created, errors });
});

router.get('/:id', async (req, res) => {
  const row = await getDb().collection('assets').findOne({ assetId: Number(req.params.id) });
  if (!row) return res.status(404).json({ message: 'Not found' });
  res.json(publicDoc(row));
});

router.post('/', async (req, res) => {
  const id = await nextId('assets');
  const body = assetDefaults({ ...req.body, assetId: id });
  if (!body.qrCode) body.qrCode = body.assetCode || `AST-${id}`;
  if (!body.assetCode) body.assetCode = `AST-${String(id).padStart(5, '0')}`;
  await getDb().collection('assets').insertOne(body);
  res.json(publicDoc(body));
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await getDb().collection('assets').findOne({ assetId: id });
  if (!existing) return res.status(404).json({ message: 'Not found' });
  const body = { ...existing, ...req.body, assetId: id, updatedDate: nowIso() };
  delete body._id;
  await getDb().collection('assets').replaceOne({ assetId: id }, body);
  res.json(publicDoc(body));
});

router.delete('/:id', async (req, res) => {
  const result = await getDb().collection('assets').deleteOne({ assetId: Number(req.params.id) });
  if (!result.deletedCount) return res.status(404).json({ message: 'Not found' });
  res.json('Deleted');
});

export default router;
