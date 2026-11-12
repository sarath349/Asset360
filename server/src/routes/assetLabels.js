import { Router } from 'express';
import { getDb, nextId, publicDoc } from '../db.js';
import { nowIso, num } from '../helpers.js';

const router = Router();

function templateBase(body = {}) {
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

function toZpl(assets = [], template = {}) {
  const w = Math.round((Number(template.widthMm) || 78) * 8);
  const h = Math.round((Number(template.heightMm) || 34) * 8);
  return assets
    .map((a) => {
      const code = a.assetCode || a.code || String(a.assetId || '');
      const name = a.assetName || a.name || '';
      return [
        '^XA',
        `^PW${w}`,
        `^LL${h}`,
        `^FO40,30^A0N,28,28^FD${code}^FS`,
        name ? `^FO40,70^A0N,22,22^FD${String(name).slice(0, 40)}^FS` : '',
        `^FO40,110^BQN,2,4^FDQA,${code}^FS`,
        '^XZ',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');
}

function toCsv(assets = []) {
  const header = 'assetId,assetCode,assetName,rfidTag';
  const lines = assets.map((a) =>
    [a.assetId ?? '', a.assetCode || a.code || '', a.assetName || a.name || '', a.rfidTag || a.rfid || '']
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(',')
  );
  return [header, ...lines].join('\n');
}

router.get('/templates', async (_req, res) => {
  const rows = await getDb().collection('labelTemplates').find({}).sort({ templateId: 1 }).toArray();
  res.json(rows.map(publicDoc));
});

router.post('/templates', async (req, res) => {
  const db = getDb();
  const id = await nextId('labelTemplates');
  const body = templateBase({ ...req.body, templateId: id });
  if (body.isDefault) {
    await db.collection('labelTemplates').updateMany({}, { $set: { isDefault: false } });
  }
  await db.collection('labelTemplates').insertOne(body);
  res.json(publicDoc(body));
});

router.put('/templates/:id', async (req, res) => {
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

router.post('/print-batch', async (req, res) => {
  const db = getDb();
  const templateId = num(req.body.templateId);
  const assetIds = (Array.isArray(req.body.assetIds) ? req.body.assetIds : []).map(Number).filter(Boolean);
  if (!assetIds.length) return res.status(400).json({ message: 'assetIds are required' });

  const template = templateId
    ? await db.collection('labelTemplates').findOne({ templateId })
    : await db.collection('labelTemplates').findOne({ isDefault: true }) ||
      (await db.collection('labelTemplates').findOne({}));

  const assets = await db.collection('assets').find({ assetId: { $in: assetIds } }).toArray();
  const jobId = await nextId('labelPrintJobs');
  const format = req.body.format === 'csv' ? 'csv' : 'zpl';
  const payload = format === 'csv' ? toCsv(assets) : toZpl(assets, template || {});
  const job = {
    jobId,
    templateId: template?.templateId || null,
    assetIds,
    format,
    status: 'Ready',
    payload,
    createdBy: num(req.body.createdBy),
    createdDate: nowIso(),
    printedDate: null,
    updatedDate: null,
  };
  await db.collection('labelPrintJobs').insertOne(job);
  res.json(publicDoc(job));
});

router.get('/jobs/:id/download', async (req, res) => {
  const job = await getDb().collection('labelPrintJobs').findOne({ jobId: Number(req.params.id) });
  if (!job) return res.status(404).json({ message: 'Not found' });
  const contentType = job.format === 'csv' ? 'text/csv' : 'application/zpl';
  const filename = `label-job-${job.jobId}.${job.format === 'csv' ? 'csv' : 'zpl'}`;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(job.payload || '');
});

router.put('/jobs/:id/printed', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await getDb().collection('labelPrintJobs').findOne({ jobId: id });
  if (!existing) return res.status(404).json({ message: 'Not found' });
  const body = {
    ...existing,
    status: 'Printed',
    printedDate: nowIso(),
    updatedDate: nowIso(),
    printedBy: num(req.body.printedBy) ?? existing.printedBy,
  };
  delete body._id;
  await getDb().collection('labelPrintJobs').replaceOne({ jobId: id }, body);
  res.json(publicDoc(body));
});

export default router;
