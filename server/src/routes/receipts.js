import { Router } from 'express';
import { getDb, nextId, publicDoc } from '../db.js';
import { nowIso, num } from '../helpers.js';

const router = Router();

function base(body = {}) {
  return {
    receiptNumber: null,
    vendorName: null,
    poNumber: null,
    receiptDate: nowIso(),
    receivedBy: null,
    locationId: null,
    departmentId: null,
    remarks: null,
    approvalStatus: 'Pending',
    approvedBy: null,
    approvalDate: null,
    approvalRemarks: null,
    lines: [],
    postedAssetIds: [],
    createdDate: nowIso(),
    updatedDate: null,
    ...body,
  };
}

function normalizeLines(lines = []) {
  return (Array.isArray(lines) ? lines : []).map((l, i) => ({
    lineId: l.lineId || i + 1,
    assetName: l.assetName || null,
    categoryId: num(l.categoryId),
    subCategoryId: num(l.subCategoryId),
    assetTypeId: num(l.assetTypeId),
    qty: Math.max(1, Number(l.qty) || 1),
    unitCost: num(l.unitCost, 0),
    currency: l.currency || 'AED',
    brand: l.brand || null,
    model: l.model || null,
    serialNumbers: Array.isArray(l.serialNumbers) ? l.serialNumbers.filter(Boolean) : String(l.serialNumbers || '')
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean),
    condition: l.condition || 'New',
    ownershipType: l.ownershipType || 'Owned',
  }));
}

router.get('/', async (_req, res) => {
  const rows = await getDb().collection('receipts').find({}).sort({ receiptId: -1 }).toArray();
  res.json(rows.map(publicDoc));
});

router.get('/:id', async (req, res) => {
  const row = await getDb().collection('receipts').findOne({ receiptId: Number(req.params.id) });
  if (!row) return res.status(404).json({ message: 'Not found' });
  res.json(publicDoc(row));
});

router.post('/', async (req, res) => {
  const id = await nextId('receipts');
  const body = base({
    ...req.body,
    receiptId: id,
    receiptNumber: req.body.receiptNumber || `RCV-${String(id).padStart(4, '0')}`,
    lines: normalizeLines(req.body.lines),
    approvalStatus: req.body.approvalStatus || 'Pending',
  });
  await getDb().collection('receipts').insertOne(body);
  res.json(publicDoc(body));
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await getDb().collection('receipts').findOne({ receiptId: id });
  if (!existing) return res.status(404).json({ message: 'Not found' });
  if (/posted|complete/i.test(existing.approvalStatus || '')) {
    return res.status(400).json({ message: 'Posted receipts cannot be edited' });
  }
  const body = {
    ...existing,
    ...req.body,
    receiptId: id,
    lines: normalizeLines(req.body.lines ?? existing.lines),
    updatedDate: nowIso(),
  };
  delete body._id;
  await getDb().collection('receipts').replaceOne({ receiptId: id }, body);
  res.json(publicDoc(body));
});

router.post('/approve/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await getDb().collection('receipts').findOne({ receiptId: id });
  if (!existing) return res.status(404).json({ message: 'Not found' });
  if (!/pending/i.test(existing.approvalStatus || '')) {
    return res.status(400).json({ message: 'Only pending receipts can be approved' });
  }
  const body = {
    ...existing,
    ...req.body,
    receiptId: id,
    approvalStatus: 'Approved',
    approvalDate: nowIso(),
    updatedDate: nowIso(),
  };
  delete body._id;
  await getDb().collection('receipts').replaceOne({ receiptId: id }, body);
  res.json(publicDoc(body));
});

router.post('/reject/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await getDb().collection('receipts').findOne({ receiptId: id });
  if (!existing) return res.status(404).json({ message: 'Not found' });
  const body = {
    ...existing,
    ...req.body,
    receiptId: id,
    approvalStatus: 'Rejected',
    approvalDate: nowIso(),
    updatedDate: nowIso(),
  };
  delete body._id;
  await getDb().collection('receipts').replaceOne({ receiptId: id }, body);
  res.json(publicDoc(body));
});

router.post('/post/:id', async (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const existing = await db.collection('receipts').findOne({ receiptId: id });
  if (!existing) return res.status(404).json({ message: 'Not found' });
  if (!/approve/i.test(existing.approvalStatus || '')) {
    return res.status(400).json({ message: 'Approve the receipt before posting assets' });
  }
  if (/posted/i.test(existing.approvalStatus || '')) {
    return res.status(400).json({ message: 'Receipt already posted' });
  }

  const lines = normalizeLines(existing.lines);
  const postedAssetIds = [];
  for (const line of lines) {
    if (!line.assetName || !line.categoryId) {
      return res.status(400).json({ message: 'Each line needs an asset name and category' });
    }
    const qty = line.qty || 1;
    const serials = line.serialNumbers || [];
    for (let i = 0; i < qty; i++) {
      const assetId = await nextId('assets');
      const serial = serials[i] || null;
      const assetCode = `AST-${String(assetId).padStart(5, '0')}`;
      const asset = {
        assetId,
        assetCode,
        assetName: qty > 1 ? `${line.assetName} (${i + 1}/${qty})` : line.assetName,
        description: `Received via ${existing.receiptNumber}`,
        remarks: existing.remarks || null,
        categoryId: line.categoryId,
        subCategoryId: line.subCategoryId,
        assetTypeId: line.assetTypeId,
        serialNumber: serial,
        brand: line.brand,
        model: line.model,
        manufacturer: null,
        yearOfManufacture: null,
        color: null,
        specifications: null,
        quantity: 1,
        purchaseDate: existing.receiptDate || nowIso(),
        purchaseCost: line.unitCost,
        currency: line.currency || 'AED',
        vendorId: null,
        vendorName: existing.vendorName || null,
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
        locationId: existing.locationId,
        subLocationId: null,
        departmentId: existing.departmentId,
        assignedTo: null,
        custodianEmployeeId: null,
        status: 'In Store',
        condition: line.condition || 'New',
        ownershipType: line.ownershipType || 'Owned',
        qrCode: assetCode,
        rfidTag: null,
        images: [],
        documents: [],
        latitude: null,
        longitude: null,
        geoAddress: null,
        createdDate: nowIso(),
        updatedDate: null,
      };
      await db.collection('assets').insertOne(asset);
      postedAssetIds.push(assetId);
    }
  }

  const body = {
    ...existing,
    receiptId: id,
    approvalStatus: 'Posted',
    postedAssetIds,
    updatedDate: nowIso(),
  };
  delete body._id;
  await db.collection('receipts').replaceOne({ receiptId: id }, body);
  res.json(publicDoc(body));
});

router.delete('/:id', async (req, res) => {
  const existing = await getDb().collection('receipts').findOne({ receiptId: Number(req.params.id) });
  if (!existing) return res.status(404).json({ message: 'Not found' });
  if (/posted/i.test(existing.approvalStatus || '')) {
    return res.status(400).json({ message: 'Posted receipts cannot be deleted' });
  }
  await getDb().collection('receipts').deleteOne({ receiptId: Number(req.params.id) });
  res.json('Deleted');
});

export default router;
