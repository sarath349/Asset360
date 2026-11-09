import { Router } from 'express';
import { getDb, nextId, publicDoc } from '../db.js';
import { nowIso } from '../helpers.js';

const router = Router();

function baseAssignment(body = {}) {
  return {
    assetId: null,
    transactionType: null,
    fromEmployeeId: null,
    toEmployeeId: null,
    fromDepartmentId: null,
    toDepartmentId: null,
    fromLocationId: null,
    toLocationId: null,
    isTemporary: false,
    expectedReturnDate: null,
    transactionDate: nowIso(),
    requestedBy: null,
    approvedBy: null,
    approvalDate: null,
    handoverAcknowledged: false,
    acknowledgedByEmployeeId: null,
    acknowledgementDate: null,
    handoverRemarks: null,
    conditionAtHandover: null,
    fromSignaturePath: null,
    toSignaturePath: null,
    status: 'Completed',
    createdDate: nowIso(),
    ...body,
  };
}

async function applyToAsset(action, body) {
  const db = getDb();
  const assetId = Number(body.assetId);
  const asset = await db.collection('assets').findOne({ assetId });
  if (!asset) throw new Error('Asset not found');

  const patch = { updatedDate: nowIso() };
  if (action === 'assign' || action === 'transfer') {
    if (body.toEmployeeId != null) patch.assignedTo = Number(body.toEmployeeId);
    if (body.toDepartmentId != null) patch.departmentId = Number(body.toDepartmentId);
    if (body.toLocationId != null) patch.locationId = Number(body.toLocationId);
    if (!asset.status || asset.status === 'In Store') patch.status = 'Active';
  } else if (action === 'location-transfer') {
    if (body.toLocationId != null) patch.locationId = Number(body.toLocationId);
    if (body.toDepartmentId != null) patch.departmentId = Number(body.toDepartmentId);
  } else if (action === 'return') {
    patch.assignedTo = null;
    patch.status = 'In Store';
    if (body.toLocationId != null) patch.locationId = Number(body.toLocationId);
    if (body.toDepartmentId != null) patch.departmentId = Number(body.toDepartmentId);
  }

  await db.collection('assets').updateOne({ assetId }, { $set: patch });
  return { ...asset, ...patch };
}

router.get('/', async (_req, res) => {
  const rows = await getDb().collection('assignments').find({}).sort({ assignmentHistoryId: -1 }).toArray();
  res.json(rows.map(publicDoc));
});

router.get('/asset/:assetId', async (req, res) => {
  const rows = await getDb()
    .collection('assignments')
    .find({ assetId: Number(req.params.assetId) })
    .sort({ assignmentHistoryId: -1 })
    .toArray();
  res.json(rows.map(publicDoc));
});

async function runAction(action, req, res) {
  try {
    const id = await nextId('assignments');
    const body = baseAssignment({
      ...req.body,
      assignmentHistoryId: id,
      transactionType: req.body.transactionType || action,
    });
    await applyToAsset(action, body);
    await getDb().collection('assignments').insertOne(body);
    res.json(publicDoc(body));
  } catch (err) {
    res.status(400).json({ message: err.message || 'Assignment failed' });
  }
}

router.post('/assign', (req, res) => runAction('assign', req, res));
router.post('/transfer', (req, res) => runAction('transfer', req, res));
router.post('/location-transfer', (req, res) => runAction('location-transfer', req, res));
router.post('/return', (req, res) => runAction('return', req, res));

export default router;
