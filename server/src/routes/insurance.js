import { Router } from 'express';
import { getDb, nextId, publicDoc } from '../db.js';
import { nowIso, num } from '../helpers.js';

const router = Router();

/** Aligned with cloud Swagger AssetInsurancePolicy */
function policyBase(body = {}) {
  return {
    policyNumber: null,
    insuranceCompany: null,
    insuranceType: null,
    contactPerson: null,
    contactEmail: null,
    contactPhone: null,
    startDate: null,
    endDate: null,
    coverageDetails: null,
    exclusions: null,
    insuredValue: null,
    premiumAmount: null,
    deductibleAmount: null,
    policyDocumentPath: null,
    status: 'Active',
    createdBy: null,
    createdDate: nowIso(),
    updatedDate: null,
    ...body,
  };
}

/** Aligned with cloud Swagger AssetInsuranceClaim */
function claimBase(body = {}) {
  return {
    claimNumber: null,
    policyId: null,
    assetId: null,
    incidentId: null,
    incidentDate: null,
    claimDate: nowIso(),
    claimDescription: null,
    claimAmount: null,
    approvedAmount: null,
    insurerReference: null,
    claimDocumentPath: null,
    status: 'Submitted',
    decisionRemarks: null,
    createdBy: null,
    createdDate: nowIso(),
    settledDate: null,
    ...body,
  };
}

router.get('/policies', async (_req, res) => {
  const rows = await getDb().collection('insurancePolicies').find({}).sort({ policyId: -1 }).toArray();
  res.json(rows.map(publicDoc));
});

router.get('/policies/:id', async (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const policy = await db.collection('insurancePolicies').findOne({ policyId: id });
  if (!policy) return res.status(404).json({ message: 'Not found' });
  const mappings = await db.collection('insuranceAssetMaps').find({ policyId: id }).toArray();
  const assetIds = mappings.map((m) => m.assetId);
  const assets = assetIds.length ? await db.collection('assets').find({ assetId: { $in: assetIds } }).toArray() : [];
  res.json({
    ...publicDoc(policy),
    assets: assets.map(publicDoc),
    mappings: mappings.map(publicDoc),
  });
});

router.post('/policies', async (req, res) => {
  if (!req.body?.policyNumber) return res.status(400).json({ message: 'policyNumber is required' });
  if (!req.body?.insuranceCompany) return res.status(400).json({ message: 'insuranceCompany is required' });
  const id = await nextId('insurancePolicies');
  const body = policyBase({
    ...req.body,
    policyId: id,
    policyNumber: req.body.policyNumber,
    insuranceCompany: req.body.insuranceCompany,
  });
  await getDb().collection('insurancePolicies').insertOne(body);
  res.json(publicDoc(body));
});

router.put('/policies/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await getDb().collection('insurancePolicies').findOne({ policyId: id });
  if (!existing) return res.status(404).json({ message: 'Not found' });
  const body = { ...existing, ...req.body, policyId: id, updatedDate: nowIso() };
  delete body._id;
  await getDb().collection('insurancePolicies').replaceOne({ policyId: id }, body);
  res.json(publicDoc(body));
});

router.post('/map-asset', async (req, res) => {
  const db = getDb();
  const policyId = num(req.body.policyId);
  const assetId = num(req.body.assetId);
  if (!policyId || !assetId) return res.status(400).json({ message: 'policyId and assetId are required' });
  const policy = await db.collection('insurancePolicies').findOne({ policyId });
  if (!policy) return res.status(404).json({ message: 'Policy not found' });
  const asset = await db.collection('assets').findOne({ assetId });
  if (!asset) return res.status(404).json({ message: 'Asset not found' });

  const existing = await db.collection('insuranceAssetMaps').findOne({ policyId, assetId });
  if (existing) return res.json(publicDoc(existing));

  const mappingId = await nextId('insuranceAssetMaps');
  const mapping = {
    mappingId,
    policyId,
    assetId,
    assetInsuredValue: req.body.assetInsuredValue != null ? Number(req.body.assetInsuredValue) : null,
    createdDate: nowIso(),
  };
  await db.collection('insuranceAssetMaps').insertOne(mapping);
  await db.collection('assets').updateOne(
    { assetId },
    {
      $set: {
        insurancePolicyNumber: policy.policyNumber || asset.insurancePolicyNumber,
        insuranceStartDate: policy.startDate || asset.insuranceStartDate,
        insuranceEndDate: policy.endDate || asset.insuranceEndDate,
        updatedDate: nowIso(),
      },
    }
  );
  res.json(publicDoc(mapping));
});

router.get('/asset/:assetId', async (req, res) => {
  const db = getDb();
  const assetId = Number(req.params.assetId);
  const mappings = await db.collection('insuranceAssetMaps').find({ assetId }).toArray();
  const policyIds = mappings.map((m) => m.policyId);
  const policies = policyIds.length
    ? await db.collection('insurancePolicies').find({ policyId: { $in: policyIds } }).toArray()
    : [];
  const asset = await db.collection('assets').findOne({ assetId });
  res.json({
    asset: asset ? publicDoc(asset) : null,
    policies: policies.map(publicDoc),
    mappings: mappings.map(publicDoc),
  });
});

router.post('/claims', async (req, res) => {
  if (!req.body?.claimNumber) return res.status(400).json({ message: 'claimNumber is required' });
  if (!req.body?.claimDescription) return res.status(400).json({ message: 'claimDescription is required' });
  const id = await nextId('insuranceClaims');
  const body = claimBase({
    ...req.body,
    claimId: id,
    claimNumber: req.body.claimNumber,
    claimDescription: req.body.claimDescription,
    status: req.body.status || 'Submitted',
  });
  await getDb().collection('insuranceClaims').insertOne(body);
  res.json(publicDoc(body));
});

router.get('/claims', async (req, res) => {
  const filter = req.query.status ? { status: String(req.query.status) } : {};
  const rows = await getDb().collection('insuranceClaims').find(filter).sort({ claimId: -1 }).toArray();
  res.json(rows.map(publicDoc));
});

router.put('/claims/:id/decision', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await getDb().collection('insuranceClaims').findOne({ claimId: id });
  if (!existing) return res.status(404).json({ message: 'Not found' });
  const body = {
    ...existing,
    status: req.body.status || existing.status,
    approvedAmount: req.body.approvedAmount != null ? Number(req.body.approvedAmount) : existing.approvedAmount,
    decisionRemarks: req.body.remarks ?? req.body.decisionRemarks ?? existing.decisionRemarks,
    settledDate: /settle|approve/i.test(String(req.body.status || '')) ? nowIso() : existing.settledDate,
    updatedDate: nowIso(),
  };
  delete body._id;
  await getDb().collection('insuranceClaims').replaceOne({ claimId: id }, body);
  res.json(publicDoc(body));
});

router.get('/expiring', async (req, res) => {
  const days = Number(req.query.days) || 30;
  const now = Date.now();
  const until = now + days * 86400000;
  const rows = await getDb().collection('insurancePolicies').find({}).toArray();
  const expiring = rows.filter((p) => {
    if (!p.endDate) return false;
    const t = new Date(p.endDate).getTime();
    return Number.isFinite(t) && t >= now && t <= until;
  });
  res.json(expiring.map(publicDoc));
});

export default router;
