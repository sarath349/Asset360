import { Router } from 'express';
import { getDb, nextId, publicDoc } from '../db.js';
import { nowIso } from '../helpers.js';

const router = Router();

function base(body = {}) {
  return {
    levelCode: null,
    levelName: null,
    module: 'disposal',
    stepOrder: 1,
    role: null,
    minAmount: null,
    isActive: true,
    createdDate: nowIso(),
    updatedDate: null,
    createdBy: null,
    ...body,
  };
}

router.get('/', async (req, res) => {
  const filter = {};
  if (req.query.module) filter.module = String(req.query.module);
  const rows = await getDb().collection('approvalLevels').find(filter).sort({ module: 1, stepOrder: 1, approvalLevelId: 1 }).toArray();
  res.json(rows.map(publicDoc));
});

router.get('/:id', async (req, res) => {
  const row = await getDb().collection('approvalLevels').findOne({ approvalLevelId: Number(req.params.id) });
  if (!row) return res.status(404).json({ message: 'Not found' });
  res.json(publicDoc(row));
});

router.post('/', async (req, res) => {
  const id = await nextId('approvalLevels');
  const body = base({
    ...req.body,
    approvalLevelId: id,
    levelCode: req.body.levelCode || `L${id}`,
    levelName: req.body.levelName || `Level ${id}`,
    stepOrder: Number(req.body.stepOrder) || 1,
  });
  await getDb().collection('approvalLevels').insertOne(body);
  res.json(publicDoc(body));
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await getDb().collection('approvalLevels').findOne({ approvalLevelId: id });
  if (!existing) return res.status(404).json({ message: 'Not found' });
  const body = { ...existing, ...req.body, approvalLevelId: id, updatedDate: nowIso() };
  delete body._id;
  await getDb().collection('approvalLevels').replaceOne({ approvalLevelId: id }, body);
  res.json(publicDoc(body));
});

router.delete('/:id', async (req, res) => {
  const result = await getDb().collection('approvalLevels').deleteOne({ approvalLevelId: Number(req.params.id) });
  if (!result.deletedCount) return res.status(404).json({ message: 'Not found' });
  res.json('Deleted');
});

export default router;
