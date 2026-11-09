import 'dotenv/config';
import { connectDb, nextId } from './db.js';
import { hashPassword } from './auth.js';
import { nowIso } from './helpers.js';

async function ensureDefaults(db) {
  if ((await db.collection('approvalLevels').countDocuments()) === 0) {
    for (const row of [
      { levelCode: 'L1', levelName: 'Level 1', module: 'disposal', stepOrder: 1, role: 'Asset Manager' },
      { levelCode: 'L1', levelName: 'Level 1', module: 'receipt', stepOrder: 1, role: 'Asset Manager' },
    ]) {
      const approvalLevelId = await nextId('approvalLevels');
      await db.collection('approvalLevels').insertOne({
        approvalLevelId,
        ...row,
        minAmount: null,
        isActive: true,
        createdDate: nowIso(),
        updatedDate: null,
        createdBy: null,
      });
    }
  }

  if ((await db.collection('labelTemplates').countDocuments()) === 0) {
    const templateId = await nextId('labelTemplates');
    await db.collection('labelTemplates').insertOne({
      templateId,
      name: 'Standard 78×34mm',
      mode: 'both',
      widthMm: 78,
      heightMm: 34,
      showCompany: true,
      showName: true,
      showRfid: true,
      showBarcode: true,
      showQr: true,
      companyPrefix: 'Property of',
      isDefault: true,
      createdDate: nowIso(),
      updatedDate: null,
    });
  }
}

export async function ensureSeed() {
  const db = await connectDb();
  const users = db.collection('users');
  const existing = await users.findOne({ username: 'admin' });

  if (!existing) {
    const userId = await nextId('users');
    await users.insertOne({
      userId,
      username: 'admin',
      passwordHash: await hashPassword('123'),
      email: 'admin@asset360.local',
      fullName: 'System Administrator',
      role: 'Super Admin',
      phone: null,
      departmentId: null,
      organizationId: 1,
      locationId: null,
      isActive: true,
      isMobileAppUser: false,
      createdDate: nowIso(),
      lastLogin: null,
    });

    if ((await db.collection('categories').countDocuments()) === 0) {
      const categoryId = await nextId('categories');
      await db.collection('categories').insertOne({ categoryId, categoryName: 'IT Equipment' });
      const subCategoryId = await nextId('subcategories');
      await db.collection('subcategories').insertOne({ subCategoryId, categoryId, subCategoryName: 'Laptops' });
      const assetTypeId = await nextId('assettypes');
      await db.collection('assettypes').insertOne({ assetTypeId, subCategoryId, typeName: 'Notebook' });
    }

    if ((await db.collection('locations').countDocuments()) === 0) {
      const locationId = await nextId('locations');
      await db.collection('locations').insertOne({
        locationId,
        parentLocationId: null,
        locationCode: 'HQ',
        locationName: 'Head Office',
        branchCode: 'HQ',
        branchName: 'Head Office',
        locationType: 'Site',
        description: 'Default site',
        departmentId: null,
        costCenter: null,
        latitude: null,
        longitude: null,
        isActive: true,
        createdDate: nowIso(),
        updatedDate: null,
      });
    }
  }

  await ensureDefaults(db);
  return { created: !existing };
}

const isCli = process.argv[1] && process.argv[1].includes('seed');
if (isCli) {
  ensureSeed()
    .then((r) => {
      console.log(r.created ? 'Seed complete.' : 'Admin user already exists (username: admin)');
      console.log('Login: admin / 123');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
