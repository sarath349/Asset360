import { Router } from 'express';
import { getDb, nextId, publicDoc } from '../db.js';
import { nowIso } from '../helpers.js';

const router = Router();

function base(body = {}) {
  return {
    name: 'Standard',
    mode: 'both',
    widthMm: 78,
    heightMm: 34,
    showCompany: true,
    showName: true,
    showRfid: true,
    showBarcode: true,
    showQr: true,
    companyPrefix: 'Property of',
    isDefault: false,
    createdDate: nowIso(),
    updatedDate: null,
    ...body,
  };
}

router.get('/', async (_req, res) => {
  const rows = await getDb().collection('labelTemplates').find({}).sort({ templateId: 1 }).toArray();
  res.json(rows.map(publicDoc));
});

router.get('/:id', async (req, res) => {
  const row = await getDb().collection('labelTemplates').findOne({ templateId: Number(req.params.id) });
  if (!row) return res.status(404).json({ message: 'Not found' });
  res.json(publicDoc(row));
});

router.post('/', async (req, res) => {
  const db = getDb();
  const id = await nextId('labelTemplates');
  const body = base({ ...req.body, templateId: id });
  if (body.isDefault) {
    await db.collection('labelTemplates').updateMany({}, { $set: { isDefault: false } });
  }
  await db.collection('labelTemplates').insertOne(body);
  res.json(publicDoc(body));
});

router.put('/:id', async (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const existing = await db.collection('labelTemplates').findOne({ templateId: id });
  if (!existing) return res.status(404).json({ message: 'Not found' });
  const body = { ...existing, ...req.body, templateId: id, updatedDate: nowIso() };
  delete body._id;
  if (body.isDefault) {
    await db.collection('labelTemplates').updateMany({ templateId: { $ne: id } }, { $set: { isDefault: false } });
  }
  await db.collection('labelTemplates').replaceOne({ templateId: id }, body);
  res.json(publicDoc(body));
});

router.delete('/:id', async (req, res) => {
  const result = await getDb().collection('labelTemplates').deleteOne({ templateId: Number(req.params.id) });
  if (!result.deletedCount) return res.status(404).json({ message: 'Not found' });
  res.json('Deleted');
});

export default router;
