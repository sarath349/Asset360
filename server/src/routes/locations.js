import { Router } from 'express';
import { getDb, nextId, publicDoc } from '../db.js';
import { nowIso } from '../helpers.js';

const router = Router();

function locationDefaults(body = {}) {
  return {
    locationCode: null,
    locationName: null,
    branchCode: null,
    branchName: null,
    description: null,
    departmentId: null,
    costCenter: null,
    latitude: null,
    longitude: null,
    isActive: true,
    // Legacy fields kept so older UI clients keep working.
    parentLocationId: null,
    locationType: 'Location',
    createdDate: nowIso(),
    updatedDate: null,
    ...body,
  };
}

function subLocationDefaults(body = {}) {
  return {
    locationId: null,
    parentSubLocationId: null,
    subLocationCode: null,
    subLocationName: null,
    subLocationType: 'Area',
    description: null,
    departmentId: null,
    costCenter: null,
    latitude: null,
    longitude: null,
    isActive: true,
    createdDate: nowIso(),
    updatedDate: null,
    ...body,
  };
}

/** Distinct branches from locations (branchCode / branchName). */
router.get('/branches', async (_req, res) => {
  const rows = await getDb().collection('locations').find({ isActive: { $ne: false } }).sort({ locationId: 1 }).toArray();
  const seen = new Set();
  const branches = [];
  for (const loc of rows) {
    const code = loc.branchCode || loc.locationCode || `LOC-${loc.locationId}`;
    if (seen.has(code)) continue;
    seen.add(code);
    branches.push({
      branchCode: code,
      branchName: loc.branchName || loc.locationName || code,
      locationId: loc.locationId,
      locationCode: loc.locationCode,
      locationName: loc.locationName,
    });
  }
  res.json(branches);
});

/** Flat sublocation routes — must be registered before /:id */
router.get('/sublocations/:id', async (req, res) => {
  const row = await getDb().collection('sublocations').findOne({ subLocationId: Number(req.params.id) });
  if (!row) return res.status(404).json({ message: 'Not found' });
  res.json(publicDoc(row));
});

router.put('/sublocations/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await getDb().collection('sublocations').findOne({ subLocationId: id });
  if (!existing) return res.status(404).json({ message: 'Not found' });
  const body = {
    ...existing,
    ...req.body,
    subLocationId: id,
    locationId: existing.locationId,
    updatedDate: nowIso(),
  };
  delete body._id;
  await getDb().collection('sublocations').replaceOne({ subLocationId: id }, body);
  res.json(publicDoc(body));
});

router.delete('/sublocations/:id', async (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const assetsHere = await db.collection('assets').countDocuments({ subLocationId: id });
  if (assetsHere) return res.status(400).json({ message: `Move or delete ${assetsHere} asset(s) in this sublocation first` });

  // Cascade child sublocations.
  const all = await db.collection('sublocations').find({}).toArray();
  const toRemove = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of all) {
      if (s.parentSubLocationId && toRemove.has(s.parentSubLocationId) && !toRemove.has(s.subLocationId)) {
        toRemove.add(s.subLocationId);
        grew = true;
      }
    }
  }
  for (const sid of toRemove) {
    await db.collection('sublocations').deleteOne({ subLocationId: sid });
  }
  res.json('Deleted');
});

router.get('/', async (_req, res) => {
  const rows = await getDb().collection('locations').find({}).sort({ locationId: 1 }).toArray();
  res.json(rows.map(publicDoc));
});

router.get('/by-parent/:parentId', async (req, res) => {
  const rows = await getDb()
    .collection('locations')
    .find({ parentLocationId: Number(req.params.parentId) })
    .toArray();
  res.json(rows.map(publicDoc));
});

/** Nested: GET/POST /api/locations/:locationId/sublocations */
router.get('/:locationId/sublocations', async (req, res) => {
  const locationId = Number(req.params.locationId);
  if (!Number.isFinite(locationId)) return res.status(400).json({ message: 'Invalid locationId' });
  const location = await getDb().collection('locations').findOne({ locationId });
  if (!location) return res.status(404).json({ message: 'Location not found' });
  const rows = await getDb().collection('sublocations').find({ locationId }).sort({ subLocationId: 1 }).toArray();
  res.json(rows.map(publicDoc));
});

router.post('/:locationId/sublocations', async (req, res) => {
  const locationId = Number(req.params.locationId);
  if (!Number.isFinite(locationId)) return res.status(400).json({ message: 'Invalid locationId' });
  const location = await getDb().collection('locations').findOne({ locationId });
  if (!location) return res.status(404).json({ message: 'Location not found' });
  if (!req.body?.subLocationCode) return res.status(400).json({ message: 'subLocationCode is required' });
  if (!req.body?.subLocationName) return res.status(400).json({ message: 'subLocationName is required' });
  if (!req.body?.subLocationType) return res.status(400).json({ message: 'subLocationType is required' });

  const id = await nextId('sublocations');
  const body = subLocationDefaults({
    ...req.body,
    subLocationId: id,
    locationId,
    parentSubLocationId: req.body.parentSubLocationId ?? null,
  });
  await getDb().collection('sublocations').insertOne(body);
  res.json(publicDoc(body));
});

router.get('/:id', async (req, res) => {
  const row = await getDb().collection('locations').findOne({ locationId: Number(req.params.id) });
  if (!row) return res.status(404).json({ message: 'Not found' });
  res.json(publicDoc(row));
});

router.post('/', async (req, res) => {
  const id = await nextId('locations');
  const body = locationDefaults({ ...req.body, locationId: id });
  if (!body.locationCode) return res.status(400).json({ message: 'locationCode is required' });
  if (!body.locationName) return res.status(400).json({ message: 'locationName is required' });
  if (!body.branchCode) body.branchCode = body.locationCode;
  if (!body.branchName) body.branchName = body.locationName;
  if (!body.locationType) body.locationType = 'Location';
  await getDb().collection('locations').insertOne(body);
  res.json(publicDoc(body));
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await getDb().collection('locations').findOne({ locationId: id });
  if (!existing) return res.status(404).json({ message: 'Not found' });
  const body = { ...existing, ...req.body, locationId: id, updatedDate: nowIso() };
  delete body._id;
  if (!body.branchCode) body.branchCode = body.locationCode;
  if (!body.branchName) body.branchName = body.locationName;
  await getDb().collection('locations').replaceOne({ locationId: id }, body);
  res.json(publicDoc(body));
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const assetsHere = await db.collection('assets').countDocuments({ locationId: id });
  if (assetsHere) return res.status(400).json({ message: `Move or delete ${assetsHere} asset(s) at this location first` });

  // Cascade: remove nested sublocations (deepest first), then the location.
  const subs = await db.collection('sublocations').find({ locationId: id }).toArray();
  const depthOf = (s) => {
    let d = 0;
    let cur = s.parentSubLocationId;
    const seen = new Set();
    while (cur && !seen.has(cur) && d < 50) {
      seen.add(cur);
      d += 1;
      cur = subs.find((x) => x.subLocationId === cur)?.parentSubLocationId;
    }
    return d;
  };
  for (const s of [...subs].sort((a, b) => depthOf(b) - depthOf(a))) {
    await db.collection('sublocations').deleteOne({ subLocationId: s.subLocationId });
  }

  const result = await db.collection('locations').deleteOne({ locationId: id });
  if (!result.deletedCount) return res.status(404).json({ message: 'Not found' });
  res.json('Deleted');
});

export default router;
