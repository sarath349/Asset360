import { Router } from 'express';
import { getDb, nextId, publicDoc } from '../db.js';
import { calcDepreciation, nowIso } from '../helpers.js';

const router = Router();

router.get('/', async (_req, res) => {
  const rows = await getDb().collection('depreciations').find({}).sort({ depreciationId: -1 }).toArray();
  res.json(rows.map(publicDoc));
});

router.post('/', async (req, res) => {
  const id = await nextId('depreciations');
  const body = {
    depreciationId: id,
    assetId: Number(req.body.assetId),
    purchaseValue: Number(req.body.purchaseValue) || 0,
    depreciationMethod: req.body.depreciationMethod || 'StraightLine',
    usefulLifeMonths: Number(req.body.usefulLifeMonths) || 36,
    residualValue: Number(req.body.residualValue) || 0,
    annualDepreciationRate: req.body.annualDepreciationRate != null ? Number(req.body.annualDepreciationRate) : null,
    depreciationStartDate: req.body.depreciationStartDate || nowIso(),
    lastCalculatedDate: null,
    accumulatedDepreciation: 0,
    currentBookValue: Number(req.body.purchaseValue) || 0,
    status: 'Active',
    createdBy: req.body.createdBy != null ? Number(req.body.createdBy) : null,
    createdDate: nowIso(),
    updatedDate: null,
  };
  const calc = calcDepreciation(body);
  Object.assign(body, calc);
  await getDb().collection('depreciations').insertOne(body);
  res.json(publicDoc(body));
});

router.get('/asset/:assetId', async (req, res) => {
  const rows = await getDb()
    .collection('depreciations')
    .find({ assetId: Number(req.params.assetId) })
    .sort({ depreciationId: -1 })
    .toArray();
  // Frontend accepts array or single object.
  res.json(rows.length === 1 ? publicDoc(rows[0]) : rows.map(publicDoc));
});

router.post('/calculate/:depreciationId', async (req, res) => {
  const id = Number(req.params.depreciationId);
  const existing = await getDb().collection('depreciations').findOne({ depreciationId: id });
  if (!existing) return res.status(404).json({ message: 'Not found' });
  const calc = calcDepreciation(existing);
  const updated = { ...existing, ...calc, updatedDate: nowIso() };
  delete updated._id;
  await getDb().collection('depreciations').replaceOne({ depreciationId: id }, updated);

  await getDb().collection('depreciationHistory').insertOne({
    historyId: await nextId('depreciationHistory'),
    depreciationId: id,
    assetId: existing.assetId,
    calculatedDate: calc.lastCalculatedDate,
    accumulatedDepreciation: calc.accumulatedDepreciation,
    currentBookValue: calc.currentBookValue,
  });

  res.json(publicDoc(updated));
});

router.get('/history/:assetId', async (req, res) => {
  const rows = await getDb()
    .collection('depreciationHistory')
    .find({ assetId: Number(req.params.assetId) })
    .sort({ historyId: -1 })
    .toArray();
  res.json(rows.map(publicDoc));
});

router.get('/report/:assetId', async (req, res) => {
  const assetId = Number(req.params.assetId);
  const rows = await getDb().collection('depreciations').find({ assetId }).toArray();
  const history = await getDb().collection('depreciationHistory').find({ assetId }).sort({ historyId: -1 }).toArray();
  res.json({
    assetId,
    schedules: rows.map(publicDoc),
    history: history.map(publicDoc),
  });
});

export default router;
