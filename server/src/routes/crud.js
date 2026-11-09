import { Router } from 'express';
import { getDb, nextId, publicDoc } from '../db.js';
import { nowIso } from '../helpers.js';
import { normalizeUserPassword } from '../auth.js';

/**
 * Generic CRUD matching the frontend helpers:
 * list GET /, get GET /:id, create POST /, update PUT /:id, delete DELETE /:id
 */
export function makeCrud({
  collection,
  idField,
  counter,
  defaults = () => ({}),
  beforeCreate,
  beforeUpdate,
  transformOut = (d) => publicDoc(d),
}) {
  const router = Router();

  router.get('/', async (_req, res) => {
    const rows = await getDb().collection(collection).find({}).sort({ [idField]: 1 }).toArray();
    res.json(rows.map(transformOut));
  });

  router.get('/:id', async (req, res) => {
    const id = Number(req.params.id);
    const row = await getDb().collection(collection).findOne({ [idField]: id });
    if (!row) return res.status(404).json({ message: 'Not found' });
    res.json(transformOut(row));
  });

  router.post('/', async (req, res) => {
    try {
      let body = { ...defaults(), ...req.body };
      if (beforeCreate) body = await beforeCreate(body);
      const id = await nextId(counter);
      body[idField] = id;
      if (!body.createdDate) body.createdDate = nowIso();
      await getDb().collection(collection).insertOne(body);
      res.json(transformOut(body));
    } catch (err) {
      res.status(400).json({ message: err.message || 'Create failed' });
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await getDb().collection(collection).findOne({ [idField]: id });
      if (!existing) return res.status(404).json({ message: 'Not found' });
      let body = { ...existing, ...req.body, [idField]: id, updatedDate: nowIso() };
      delete body._id;
      if (beforeUpdate) body = await beforeUpdate(body, existing);
      await getDb().collection(collection).replaceOne({ [idField]: id }, body);
      res.json(transformOut(body));
    } catch (err) {
      res.status(400).json({ message: err.message || 'Update failed' });
    }
  });

  router.delete('/:id', async (req, res) => {
    const id = Number(req.params.id);
    const result = await getDb().collection(collection).deleteOne({ [idField]: id });
    if (!result.deletedCount) return res.status(404).json({ message: 'Not found' });
    res.json('Deleted');
  });

  return router;
}

export const usersCrud = () =>
  makeCrud({
    collection: 'users',
    idField: 'userId',
    counter: 'users',
    defaults: () => ({
      username: null,
      email: null,
      fullName: null,
      role: null,
      phone: null,
      departmentId: null,
      organizationId: null,
      locationId: null,
      isActive: true,
      isMobileAppUser: false,
      lastLogin: null,
      createdDate: nowIso(),
    }),
    beforeCreate: async (body) => {
      if (!body.username) throw new Error('Username is required');
      const prepared = await normalizeUserPassword(body, null);
      if (!prepared.passwordHash) throw new Error('Password is required');
      return prepared;
    },
    beforeUpdate: async (body, existing) => normalizeUserPassword(body, existing),
    transformOut: (d) => publicDoc(d, { keepPasswordHash: false }),
  });
