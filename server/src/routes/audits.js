import { Router } from 'express';
import { getDb, nextId, publicDoc } from '../db.js';
import { nowIso } from '../helpers.js';

const router = Router();

router.get('/campaigns', async (_req, res) => {
  const rows = await getDb().collection('audits').find({}).sort({ auditId: -1 }).toArray();
  res.json(rows.map(publicDoc));
});

router.post('/create', async (req, res) => {
  const id = await nextId('audits');
  const body = {
    auditCode: req.body.auditCode || `AUD-${String(id).padStart(4, '0')}`,
    auditName: req.body.auditName || `Audit ${id}`,
    siteId: Number(req.body.siteId) || 0,
    areaId: req.body.areaId != null ? Number(req.body.areaId) : null,
    categoryId: req.body.categoryId != null ? Number(req.body.categoryId) : null,
    subCategoryId: req.body.subCategoryId != null ? Number(req.body.subCategoryId) : null,
    startDate: req.body.startDate || nowIso(),
    endDate: req.body.endDate || null,
    assignedTo: req.body.assignedTo != null ? Number(req.body.assignedTo) : null,
    status: 'Planned',
    remarks: req.body.remarks || null,
    createdBy: req.body.createdBy != null ? Number(req.body.createdBy) : null,
    createdDate: nowIso(),
    completedDate: null,
    auditId: id,
  };
  await getDb().collection('audits').insertOne(body);
  res.json(publicDoc(body));
});

router.post('/start/:auditId', async (req, res) => {
  const auditId = Number(req.params.auditId);
  const db = getDb();
  const audit = await db.collection('audits').findOne({ auditId });
  if (!audit) return res.status(404).json({ message: 'Audit not found' });

  const locationFilter = audit.areaId
    ? { $or: [{ locationId: audit.areaId }, { subLocationId: audit.areaId }] }
    : { $or: [{ locationId: audit.siteId }, { subLocationId: audit.siteId }] };

  const filter = { ...locationFilter };
  if (audit.categoryId) filter.categoryId = Number(audit.categoryId);
  if (audit.subCategoryId) filter.subCategoryId = Number(audit.subCategoryId);

  const assets = await db.collection('assets').find(filter).toArray();
  await db.collection('auditItems').deleteMany({ auditId });
  if (assets.length) {
    await db.collection('auditItems').insertMany(
      assets.map((a) => ({
        auditId,
        assetId: a.assetId,
        expectedLocationId: a.locationId,
        status: 'Pending',
        scanned: false,
      }))
    );
  }

  await db.collection('audits').updateOne({ auditId }, { $set: { status: 'In Progress' } });
  res.json({ success: true, assetCount: assets.length });
});

router.get('/assets/:auditId', async (req, res) => {
  const auditId = Number(req.params.auditId);
  const db = getDb();
  const items = await db.collection('auditItems').find({ auditId }).toArray();
  const assetIds = items.map((i) => i.assetId);
  const assets = await db.collection('assets').find({ assetId: { $in: assetIds } }).toArray();
  const assetMap = new Map(assets.map((a) => [a.assetId, a]));
  res.json(
    items.map((i) => ({
      ...publicDoc(i),
      assetCode: assetMap.get(i.assetId)?.assetCode || null,
      assetName: assetMap.get(i.assetId)?.assetName || null,
      status: i.scanned ? 'Found' : i.status || 'Pending',
    }))
  );
});

router.post('/scan', async (req, res) => {
  const db = getDb();
  const auditId = Number(req.body.auditId);
  const audit = await db.collection('audits').findOne({ auditId });
  if (!audit) return res.status(404).json({ message: 'Audit not found' });

  const code = String(req.body.scanCode || '').trim();
  let asset = null;
  if (code) {
    asset = await db.collection('assets').findOne({
      $or: [{ assetCode: code }, { qrCode: code }, { rfidTag: code }, { serialNumber: code }],
    });
  }

  const scanLogId = await nextId('auditScans');
  let scanResult = 'Unexpected';
  let auditItemId = null;

  if (asset) {
    const item = await db.collection('auditItems').findOne({ auditId, assetId: asset.assetId });
    if (item) {
      auditItemId = item._id?.toString?.() || null;
      scanResult = 'Found';
      await db.collection('auditItems').updateOne({ auditId, assetId: asset.assetId }, { $set: { scanned: true, status: 'Found', scannedDate: nowIso() } });
    } else {
      scanResult = 'Unexpected';
    }
  } else {
    scanResult = 'NotFound';
  }

  const scan = {
    scanLogId,
    auditId,
    auditItemId,
    assetId: asset?.assetId || null,
    scanCode: code || null,
    scanType: req.body.scanType || 'QR',
    scannedLocationId: req.body.scannedLocationId != null ? Number(req.body.scannedLocationId) : null,
    scanResult,
    scannedBy: req.body.scannedBy != null ? Number(req.body.scannedBy) : null,
    scannedDate: nowIso(),
    remarks: req.body.remarks || null,
  };
  await db.collection('auditScans').insertOne(scan);
  res.json(publicDoc(scan));
});

router.post('/complete/:auditId', async (req, res) => {
  const auditId = Number(req.params.auditId);
  const db = getDb();
  const audit = await db.collection('audits').findOne({ auditId });
  if (!audit) return res.status(404).json({ message: 'Audit not found' });
  await db.collection('auditItems').updateMany({ auditId, scanned: { $ne: true } }, { $set: { status: 'Missing' } });
  await db.collection('audits').updateOne({ auditId }, { $set: { status: 'Completed', completedDate: nowIso() } });
  res.json({ success: true });
});

router.get('/report/:auditId', async (req, res) => {
  const auditId = Number(req.params.auditId);
  const db = getDb();
  const items = await db.collection('auditItems').find({ auditId }).toArray();
  const scans = await db.collection('auditScans').find({ auditId }).toArray();
  const found = items.filter((i) => i.scanned).length;
  const missing = items.filter((i) => !i.scanned).length;
  const unexpected = scans.filter((s) => s.scanResult === 'Unexpected').length;
  res.json({
    auditId,
    totalInScope: items.length,
    found,
    missing,
    unexpected,
    scans: scans.length,
    items: items.map(publicDoc),
  });
});

router.get('/scan-history/:auditId', async (req, res) => {
  const rows = await getDb()
    .collection('auditScans')
    .find({ auditId: Number(req.params.auditId) })
    .sort({ scanLogId: -1 })
    .toArray();
  res.json(rows.map(publicDoc));
});

export default router;
