import { Router } from 'express';
import { getDb, nextId, publicDoc } from '../db.js';
import { nowIso, num } from '../helpers.js';

const router = Router();

function base(body = {}) {
  return {
    loanNumber: null,
    borrowerEmployeeId: null,
    borrowerName: null,
    departmentId: null,
    purpose: null,
    requestedFrom: null,
    requestedTo: null,
    status: 'Pending',
    requestedBy: null,
    decidedBy: null,
    decisionDate: null,
    decisionRemarks: null,
    issuedBy: null,
    issuedDate: null,
    items: [],
    remarks: null,
    createdDate: nowIso(),
    updatedDate: null,
    ...body,
  };
}

function normalizeItems(items = []) {
  return (Array.isArray(items) ? items : []).map((it, i) => ({
    loanItemId: it.loanItemId || i + 1,
    assetId: num(it.assetId),
    assetCode: it.assetCode || null,
    assetName: it.assetName || null,
    status: it.status || 'Requested',
    issuedDate: it.issuedDate || null,
    returnedDate: it.returnedDate || null,
    conditionOut: it.conditionOut || null,
    conditionIn: it.conditionIn || null,
    remarks: it.remarks || null,
  }));
}

router.get('/', async (_req, res) => {
  const rows = await getDb().collection('assetLoans').find({}).sort({ loanId: -1 }).toArray();
  res.json(rows.map(publicDoc));
});

router.get('/my', async (req, res) => {
  const userId = num(req.query.userId) ?? num(req.user?.userId) ?? num(req.user?.UserId);
  const employeeId = num(req.query.employeeId);
  const filter = employeeId
    ? { borrowerEmployeeId: employeeId }
    : userId
      ? { $or: [{ requestedBy: userId }, { borrowerEmployeeId: userId }] }
      : {};
  const rows = await getDb().collection('assetLoans').find(filter).sort({ loanId: -1 }).toArray();
  res.json(rows.map(publicDoc));
});

router.get('/:id', async (req, res) => {
  const row = await getDb().collection('assetLoans').findOne({ loanId: Number(req.params.id) });
  if (!row) return res.status(404).json({ message: 'Not found' });
  res.json(publicDoc(row));
});

router.post('/', async (req, res) => {
  const id = await nextId('assetLoans');
  const items = normalizeItems(req.body.items);
  const body = base({
    ...req.body,
    loanId: id,
    loanNumber: req.body.loanNumber || `LOAN-${String(id).padStart(4, '0')}`,
    status: req.body.status || 'Pending',
    items,
  });
  await getDb().collection('assetLoans').insertOne(body);
  res.json(publicDoc(body));
});

router.put('/:id/decision', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await getDb().collection('assetLoans').findOne({ loanId: id });
  if (!existing) return res.status(404).json({ message: 'Not found' });
  if (!/pending/i.test(existing.status || '')) {
    return res.status(400).json({ message: 'Only pending loans can be decided' });
  }
  const approve = /approve/i.test(String(req.body.decision || req.body.status || ''));
  const body = {
    ...existing,
    ...req.body,
    loanId: id,
    status: approve ? 'Approved' : 'Rejected',
    decidedBy: num(req.body.decidedBy) ?? existing.decidedBy,
    decisionDate: nowIso(),
    decisionRemarks: req.body.decisionRemarks || req.body.remarks || null,
    updatedDate: nowIso(),
  };
  delete body._id;
  await getDb().collection('assetLoans').replaceOne({ loanId: id }, body);
  res.json(publicDoc(body));
});

router.put('/:id/issue', async (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const existing = await db.collection('assetLoans').findOne({ loanId: id });
  if (!existing) return res.status(404).json({ message: 'Not found' });
  if (!/approve/i.test(existing.status || '')) {
    return res.status(400).json({ message: 'Approve the loan before issuing assets' });
  }
  const issuedAt = nowIso();
  const items = normalizeItems(existing.items).map((it) => ({
    ...it,
    status: it.status === 'Returned' ? it.status : 'Issued',
    issuedDate: it.status === 'Returned' ? it.issuedDate : issuedAt,
  }));
  for (const it of items) {
    if (it.assetId && it.status === 'Issued') {
      await db.collection('assets').updateOne(
        { assetId: it.assetId },
        { $set: { status: 'Loaned', assignedTo: existing.borrowerEmployeeId || null, updatedDate: nowIso() } }
      );
    }
  }
  const body = {
    ...existing,
    ...req.body,
    loanId: id,
    status: 'Issued',
    items,
    issuedBy: num(req.body.issuedBy) ?? existing.issuedBy,
    issuedDate: issuedAt,
    updatedDate: nowIso(),
  };
  delete body._id;
  await db.collection('assetLoans').replaceOne({ loanId: id }, body);
  res.json(publicDoc(body));
});

router.put('/items/:id/return', async (req, res) => {
  const db = getDb();
  const itemId = Number(req.params.id);
  const loan = await db.collection('assetLoans').findOne({ 'items.loanItemId': itemId });
  if (!loan) return res.status(404).json({ message: 'Loan item not found' });
  const returnedAt = nowIso();
  const items = normalizeItems(loan.items).map((it) => {
    if (it.loanItemId !== itemId) return it;
    return {
      ...it,
      status: 'Returned',
      returnedDate: returnedAt,
      conditionIn: req.body.conditionIn || it.conditionIn,
      remarks: req.body.remarks || it.remarks,
    };
  });
  const target = items.find((it) => it.loanItemId === itemId);
  if (target?.assetId) {
    await db.collection('assets').updateOne(
      { assetId: target.assetId },
      { $set: { status: 'Active', updatedDate: nowIso() } }
    );
  }
  const allReturned = items.every((it) => it.status === 'Returned');
  const body = {
    ...loan,
    items,
    status: allReturned ? 'Returned' : loan.status,
    updatedDate: nowIso(),
  };
  delete body._id;
  await db.collection('assetLoans').replaceOne({ loanId: loan.loanId }, body);
  res.json(publicDoc(body));
});

export default router;
