import { Router } from 'express';
import { getDb, nextId, publicDoc } from '../db.js';
import { nowIso } from '../helpers.js';

const router = Router();

router.get('/', async (_req, res) => {
  const rows = await getDb().collection('contracts').find({}).sort({ contractId: -1 }).toArray();
  res.json(rows.map(publicDoc));
});

router.get('/expiry-alerts', async (_req, res) => {
  const now = new Date();
  const soon = new Date(now.getTime() + 60 * 86400000);
  const rows = await getDb()
    .collection('contracts')
    .find({
      endDate: { $gte: now.toISOString(), $lte: soon.toISOString() },
      status: { $not: /expired|cancelled/i },
    })
    .toArray();
  res.json(rows.map(publicDoc));
});

router.get('/:id/assets', async (req, res) => {
  const contractId = Number(req.params.id);
  const maps = await getDb().collection('contractAssets').find({ contractId }).toArray();
  const assetIds = maps.map((m) => m.assetId);
  const assets = await getDb().collection('assets').find({ assetId: { $in: assetIds } }).toArray();
  res.json(assets.map(publicDoc));
});

router.get('/:id/visits', async (req, res) => {
  const rows = await getDb()
    .collection('contractVisits')
    .find({ contractId: Number(req.params.id) })
    .sort({ visitId: -1 })
    .toArray();
  res.json(rows.map(publicDoc));
});

router.get('/:id/documents', async (req, res) => {
  const rows = await getDb()
    .collection('contractDocuments')
    .find({ contractId: Number(req.params.id) })
    .sort({ documentId: -1 })
    .toArray();
  res.json(rows.map(publicDoc));
});

router.get('/:id', async (req, res) => {
  const row = await getDb().collection('contracts').findOne({ contractId: Number(req.params.id) });
  if (!row) return res.status(404).json({ message: 'Not found' });
  res.json(publicDoc(row));
});

router.post('/', async (req, res) => {
  const id = await nextId('contracts');
  const body = {
    contractId: id,
    contractType: req.body.contractType || 'AMC',
    contractNumber: req.body.contractNumber || `CON-${id}`,
    vendorName: req.body.vendorName || '',
    contactPerson: req.body.contactPerson || null,
    contactEmail: req.body.contactEmail || null,
    contactPhone: req.body.contactPhone || null,
    startDate: req.body.startDate || nowIso(),
    endDate: req.body.endDate || nowIso(),
    coverage: req.body.coverage || null,
    contractValue: req.body.contractValue != null ? Number(req.body.contractValue) : null,
    sla: req.body.sla || null,
    totalVisits: req.body.totalVisits != null ? Number(req.body.totalVisits) : null,
    remainingVisits: req.body.remainingVisits != null ? Number(req.body.remainingVisits) : req.body.totalVisits != null ? Number(req.body.totalVisits) : null,
    status: req.body.status || 'Active',
    remarks: req.body.remarks || null,
    createdBy: req.body.createdBy != null ? Number(req.body.createdBy) : null,
    createdDate: nowIso(),
    updatedDate: null,
  };
  await getDb().collection('contracts').insertOne(body);
  res.json(publicDoc(body));
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await getDb().collection('contracts').findOne({ contractId: id });
  if (!existing) return res.status(404).json({ message: 'Not found' });
  const body = { ...existing, ...req.body, contractId: id, updatedDate: nowIso() };
  delete body._id;
  await getDb().collection('contracts').replaceOne({ contractId: id }, body);
  res.json(publicDoc(body));
});

router.post('/map-asset', async (req, res) => {
  const mappingId = await nextId('contractAssets');
  const body = {
    mappingId,
    contractId: Number(req.body.contractId),
    assetId: Number(req.body.assetId),
    createdDate: nowIso(),
  };
  await getDb().collection('contractAssets').insertOne(body);
  res.json(publicDoc(body));
});

router.post('/add-visit', async (req, res) => {
  const visitId = await nextId('contractVisits');
  const body = {
    visitId,
    contractId: Number(req.body.contractId),
    assetId: req.body.assetId != null ? Number(req.body.assetId) : null,
    visitDate: req.body.visitDate || nowIso(),
    visitType: req.body.visitType || null,
    technicianName: req.body.technicianName || null,
    description: req.body.description || null,
    findings: req.body.findings || null,
    actionTaken: req.body.actionTaken || null,
    status: req.body.status || 'Completed',
    nextVisitDate: req.body.nextVisitDate || null,
    createdBy: req.body.createdBy != null ? Number(req.body.createdBy) : null,
    createdDate: nowIso(),
  };
  await getDb().collection('contractVisits').insertOne(body);
  if (body.contractId) {
    await getDb().collection('contracts').updateOne(
      { contractId: body.contractId, remainingVisits: { $gt: 0 } },
      { $inc: { remainingVisits: -1 }, $set: { updatedDate: nowIso() } }
    );
  }
  res.json(publicDoc(body));
});

router.post('/add-document', async (req, res) => {
  const documentId = await nextId('contractDocuments');
  const body = {
    documentId,
    contractId: Number(req.body.contractId),
    documentName: req.body.documentName || 'Document',
    documentType: req.body.documentType || null,
    filePath: req.body.filePath || '',
    contentType: req.body.contentType || null,
    uploadedBy: req.body.uploadedBy != null ? Number(req.body.uploadedBy) : null,
    uploadedDate: nowIso(),
  };
  await getDb().collection('contractDocuments').insertOne(body);
  res.json(publicDoc(body));
});

export default router;
