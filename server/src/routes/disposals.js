import { Router } from 'express';
import { getDb, nextId, publicDoc } from '../db.js';
import { nowIso } from '../helpers.js';

const router = Router();

function base(body = {}) {
  return {
    disposalRequestNumber: null,
    assetId: null,
    retirementReason: '',
    assetCondition: null,
    requestedDisposalMethod: null,
    requestDate: nowIso(),
    requestedBy: null,
    approvalStatus: 'Pending',
    approvedBy: null,
    approvalDate: null,
    approvalRemarks: null,
    disposalMethod: null,
    disposalDate: null,
    disposalValue: null,
    buyerVendorName: null,
    buyerVendorContact: null,
    disposalCertificatePath: null,
    dataWipingRequired: false,
    dataWipingCompleted: false,
    dataWipingCertificatePath: null,
    dataWipingDate: null,
    finalAssetStatus: null,
    disposalRemarks: null,
    createdDate: nowIso(),
    updatedDate: null,
    ...body,
  };
}

router.get('/', async (_req, res) => {
  const rows = await getDb().collection('disposals').find({}).sort({ disposalId: -1 }).toArray();
  res.json(rows.map(publicDoc));
});

router.get('/pending', async (_req, res) => {
  const rows = await getDb()
    .collection('disposals')
    .find({ approvalStatus: /pending/i })
    .sort({ disposalId: -1 })
    .toArray();
  res.json(rows.map(publicDoc));
});

router.get('/asset/:assetId', async (req, res) => {
  const rows = await getDb()
    .collection('disposals')
    .find({ assetId: Number(req.params.assetId) })
    .sort({ disposalId: -1 })
    .toArray();
  res.json(rows.map(publicDoc));
});

router.get('/:id', async (req, res) => {
  const row = await getDb().collection('disposals').findOne({ disposalId: Number(req.params.id) });
  if (!row) return res.status(404).json({ message: 'Not found' });
  res.json(publicDoc(row));
});

router.post('/', async (req, res) => {
  const id = await nextId('disposals');
  const body = base({
    ...req.body,
    disposalId: id,
    disposalRequestNumber: req.body.disposalRequestNumber || `DSP-${String(id).padStart(4, '0')}`,
    approvalStatus: req.body.approvalStatus || 'Pending',
  });
  await getDb().collection('disposals').insertOne(body);
  res.json(publicDoc(body));
});

router.post('/approve/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await getDb().collection('disposals').findOne({ disposalId: id });
  if (!existing) return res.status(404).json({ message: 'Not found' });
  const body = {
    ...existing,
    ...req.body,
    disposalId: id,
    approvalStatus: 'Approved',
    approvalDate: nowIso(),
    updatedDate: nowIso(),
  };
  delete body._id;
  await getDb().collection('disposals').replaceOne({ disposalId: id }, body);
  res.json(publicDoc(body));
});

router.post('/reject/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await getDb().collection('disposals').findOne({ disposalId: id });
  if (!existing) return res.status(404).json({ message: 'Not found' });
  const body = {
    ...existing,
    ...req.body,
    disposalId: id,
    approvalStatus: 'Rejected',
    approvalDate: nowIso(),
    updatedDate: nowIso(),
  };
  delete body._id;
  await getDb().collection('disposals').replaceOne({ disposalId: id }, body);
  res.json(publicDoc(body));
});

router.post('/complete/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await getDb().collection('disposals').findOne({ disposalId: id });
  if (!existing) return res.status(404).json({ message: 'Not found' });
  if (!/approve/i.test(existing.approvalStatus || '')) {
    return res.status(400).json({ message: 'Approve the disposal request before completing it' });
  }
  const finalStatus = req.body.finalAssetStatus || 'Disposed';
  const body = {
    ...existing,
    ...req.body,
    disposalId: id,
    approvalStatus: 'Completed',
    disposalDate: req.body.disposalDate || nowIso(),
    finalAssetStatus: finalStatus,
    updatedDate: nowIso(),
  };
  delete body._id;
  await getDb().collection('disposals').replaceOne({ disposalId: id }, body);
  await getDb().collection('assets').updateOne(
    { assetId: Number(body.assetId) },
    { $set: { status: finalStatus, updatedDate: nowIso(), assignedTo: null } }
  );
  res.json(publicDoc(body));
});

export default router;
