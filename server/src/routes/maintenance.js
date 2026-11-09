import { Router } from 'express';
import { getDb, nextId, publicDoc } from '../db.js';
import { nowIso } from '../helpers.js';

const router = Router();

function base(body = {}) {
  return {
    clientId: null,
    kind: 'maintenance',
    type: 'Preventive maintenance',
    assetId: null,
    assetCode: null,
    assetName: null,
    locationId: null,
    title: null,
    description: null,
    priority: 'Medium',
    status: 'Open',
    createdBy: null,
    createdByName: null,
    dueDate: null,
    startedAt: null,
    completedAt: null,
    laborHours: null,
    spareParts: [],
    notes: null,
    beforePhotos: [],
    afterPhotos: [],
    photos: [],
    gps: null,
    prevAssetStatus: null,
    createdDate: nowIso(),
    updatedDate: null,
    ...body,
  };
}

async function setAssetStatus(db, assetId, status) {
  if (!assetId) return null;
  const asset = await db.collection('assets').findOne({ assetId: Number(assetId) });
  if (!asset) return null;
  const prev = asset.status || null;
  await db.collection('assets').updateOne({ assetId: Number(assetId) }, { $set: { status, updatedDate: nowIso() } });
  return prev;
}

router.get('/', async (_req, res) => {
  const rows = await getDb().collection('maintenanceJobs').find({}).sort({ jobId: -1 }).toArray();
  res.json(rows.map(publicDoc));
});

router.get('/:id', async (req, res) => {
  const row = await getDb().collection('maintenanceJobs').findOne({ jobId: Number(req.params.id) });
  if (!row) return res.status(404).json({ message: 'Not found' });
  res.json(publicDoc(row));
});

router.post('/', async (req, res) => {
  const id = await nextId('maintenanceJobs');
  const body = base({
    ...req.body,
    jobId: id,
    status: req.body.status || 'Open',
    createdDate: req.body.createdDate || nowIso(),
  });
  await getDb().collection('maintenanceJobs').insertOne(body);
  res.json(publicDoc(body));
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await getDb().collection('maintenanceJobs').findOne({ jobId: id });
  if (!existing) return res.status(404).json({ message: 'Not found' });
  const body = { ...existing, ...req.body, jobId: id, updatedDate: nowIso() };
  delete body._id;
  await getDb().collection('maintenanceJobs').replaceOne({ jobId: id }, body);
  res.json(publicDoc(body));
});

router.post('/start/:id', async (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const existing = await db.collection('maintenanceJobs').findOne({ jobId: id });
  if (!existing) return res.status(404).json({ message: 'Not found' });
  if (existing.status !== 'Open') return res.status(400).json({ message: 'Only open jobs can be started' });

  let prev = existing.prevAssetStatus;
  if (req.body.markAsset !== false && existing.assetId) {
    prev = await setAssetStatus(db, existing.assetId, 'Under Maintenance');
  }
  const body = {
    ...existing,
    ...req.body,
    jobId: id,
    status: 'In Progress',
    startedAt: nowIso(),
    prevAssetStatus: prev,
    updatedDate: nowIso(),
  };
  delete body._id;
  await db.collection('maintenanceJobs').replaceOne({ jobId: id }, body);
  res.json(publicDoc(body));
});

router.post('/complete/:id', async (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const existing = await db.collection('maintenanceJobs').findOne({ jobId: id });
  if (!existing) return res.status(404).json({ message: 'Not found' });
  if (!['Open', 'In Progress'].includes(existing.status)) {
    return res.status(400).json({ message: 'Job cannot be completed from this status' });
  }

  if (req.body.markAsset !== false && existing.assetId) {
    const restore = existing.prevAssetStatus && existing.prevAssetStatus !== 'Under Maintenance' ? existing.prevAssetStatus : 'Active';
    await setAssetStatus(db, existing.assetId, restore);
  }
  const body = {
    ...existing,
    ...req.body,
    jobId: id,
    status: 'Completed',
    completedAt: nowIso(),
    updatedDate: nowIso(),
  };
  delete body._id;
  await db.collection('maintenanceJobs').replaceOne({ jobId: id }, body);
  res.json(publicDoc(body));
});

router.post('/cancel/:id', async (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const existing = await db.collection('maintenanceJobs').findOne({ jobId: id });
  if (!existing) return res.status(404).json({ message: 'Not found' });
  if (['Completed', 'Cancelled'].includes(existing.status)) {
    return res.status(400).json({ message: 'Job is already closed' });
  }
  if (existing.assetId && existing.status === 'In Progress' && existing.prevAssetStatus) {
    const restore = existing.prevAssetStatus !== 'Under Maintenance' ? existing.prevAssetStatus : 'Active';
    await setAssetStatus(db, existing.assetId, restore);
  }
  const body = {
    ...existing,
    ...req.body,
    jobId: id,
    status: 'Cancelled',
    updatedDate: nowIso(),
  };
  delete body._id;
  await db.collection('maintenanceJobs').replaceOne({ jobId: id }, body);
  res.json(publicDoc(body));
});

router.delete('/:id', async (req, res) => {
  const result = await getDb().collection('maintenanceJobs').deleteOne({ jobId: Number(req.params.id) });
  if (!result.deletedCount) return res.status(404).json({ message: 'Not found' });
  res.json('Deleted');
});

export default router;
