import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRequired } from './auth.js';
import { nowIso } from './helpers.js';
import { makeCrud, usersCrud } from './routes/crud.js';
import authRoutes from './routes/auth.js';
import assetsRoutes from './routes/assets.js';
import assignmentsRoutes from './routes/assignments.js';
import auditsRoutes from './routes/audits.js';
import depreciationRoutes from './routes/depreciation.js';
import disposalsRoutes from './routes/disposals.js';
import contractsRoutes from './routes/contracts.js';
import dashboardRoutes from './routes/dashboard.js';
import reportsRoutes from './routes/reports.js';
import locationsRoutes from './routes/locations.js';
import maintenanceRoutes from './routes/maintenance.js';
import receiptsRoutes from './routes/receipts.js';
import approvalLevelsRoutes from './routes/approvalLevels.js';
import labelTemplatesRoutes from './routes/labelTemplates.js';
import { getDb, publicDoc } from './db.js';
import { Router } from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp({ staticDir, uploadsDir } = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use('/uploads', express.static(uploadsDir || path.join(__dirname, '..', 'uploads')));

  app.get('/api/health', (_req, res) => res.json({ ok: true, time: nowIso() }));
  app.use('/api/auth', authRoutes);
  app.use('/api', authRequired);

  app.use('/api/assets', assetsRoutes);
  app.use('/api/category', makeCrud({ collection: 'categories', idField: 'categoryId', counter: 'categories', defaults: () => ({ categoryName: null }) }));
  app.use(
    '/api/subcategory',
    makeCrud({
      collection: 'subcategories',
      idField: 'subCategoryId',
      counter: 'subcategories',
      defaults: () => ({ categoryId: null, subCategoryName: null }),
    })
  );

  const assetTypes = Router();
  assetTypes.get('/by-subcategory/:subCategoryId', async (req, res) => {
    const rows = await getDb()
      .collection('assettypes')
      .find({ subCategoryId: Number(req.params.subCategoryId) })
      .toArray();
    res.json(rows.map(publicDoc));
  });
  assetTypes.use(
    makeCrud({
      collection: 'assettypes',
      idField: 'assetTypeId',
      counter: 'assettypes',
      defaults: () => ({ subCategoryId: null, typeName: null }),
    })
  );
  app.use('/api/assettypes', assetTypes);

  app.use('/api/locations', locationsRoutes);

  app.use('/api/users', usersCrud());
  app.use(
    '/api/departments',
    makeCrud({
      collection: 'departments',
      idField: 'departmentId',
      counter: 'departments',
      defaults: () => ({
        departmentCode: null,
        departmentName: null,
        locationId: null,
        description: null,
        isActive: true,
        createdDate: nowIso(),
        updatedDate: null,
      }),
    })
  );
  app.use(
    '/api/employees',
    makeCrud({
      collection: 'employees',
      idField: 'employeeId',
      counter: 'employees',
      defaults: () => ({
        employeeCode: null,
        fullName: null,
        email: null,
        phone: null,
        departmentId: null,
        locationId: null,
        designation: null,
        dateOfJoining: null,
        isActive: true,
        createdDate: nowIso(),
        updatedDate: null,
      }),
    })
  );

  app.use('/api/assetassignments', assignmentsRoutes);
  app.use('/api/assetaudit', auditsRoutes);
  app.use('/api/assetdepreciation', depreciationRoutes);
  app.use('/api/assetdisposals', disposalsRoutes);
  app.use('/api/assetcontracts', contractsRoutes);
  app.use('/api/maintenance', maintenanceRoutes);
  app.use('/api/receipts', receiptsRoutes);
  app.use('/api/approvallevels', approvalLevelsRoutes);
  app.use('/api/labeltemplates', labelTemplatesRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/reports', reportsRoutes);

  if (staticDir) {
    app.use(express.static(staticDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
      res.sendFile(path.join(staticDir, 'index.html'), (err) => (err ? next() : undefined));
    });
  }

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ message: err.message || 'Server error' });
  });

  return app;
}
