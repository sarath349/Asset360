import { Router } from 'express';
import { getDb } from '../db.js';
import { addMonthsChart, chartFromMap } from '../helpers.js';

const router = Router();

router.get('/', async (_req, res) => {
  const db = getDb();
  const [assets, categories, locations, depreciations, contracts] = await Promise.all([
    db.collection('assets').find({}).toArray(),
    db.collection('categories').find({}).toArray(),
    db.collection('locations').find({}).toArray(),
    db.collection('depreciations').find({}).toArray(),
    db.collection('contracts').find({}).toArray(),
  ]);

  const catMap = new Map(categories.map((c) => [c.categoryId, c.categoryName || `Category ${c.categoryId}`]));
  const locMap = new Map(locations.map((l) => [l.locationId, l.locationName || `Location ${l.locationId}`]));

  const soon = Date.now() + 30 * 86400000;
  const warrantyExpiring = assets.filter((a) => a.warrantyEndDate && new Date(a.warrantyEndDate).getTime() <= soon && new Date(a.warrantyEndDate).getTime() >= Date.now()).length;
  const amcExpiring = assets.filter((a) => a.amcEndDate && new Date(a.amcEndDate).getTime() <= soon && new Date(a.amcEndDate).getTime() >= Date.now()).length;

  const byLocation = new Map();
  const byCategory = new Map();
  const byStatus = new Map();
  const valueByCategory = new Map();

  for (const a of assets) {
    const loc = locMap.get(a.locationId) || 'Unassigned';
    const cat = catMap.get(a.categoryId) || 'Unassigned';
    const status = a.status || 'Unknown';
    byLocation.set(loc, (byLocation.get(loc) || 0) + 1);
    byCategory.set(cat, (byCategory.get(cat) || 0) + 1);
    byStatus.set(status, (byStatus.get(status) || 0) + 1);
    valueByCategory.set(cat, (valueByCategory.get(cat) || 0) + (Number(a.purchaseCost) || 0));
  }

  const depByMonth = new Map();
  for (const d of depreciations) {
    const key = (d.lastCalculatedDate || d.createdDate || '').slice(0, 7) || 'n/a';
    depByMonth.set(key, (depByMonth.get(key) || 0) + (Number(d.accumulatedDepreciation) || 0));
  }

  res.json({
    summary: {
      totalAssets: assets.length,
      assetValue: assets.reduce((s, a) => s + (Number(a.purchaseCost) || 0), 0),
      activeAssets: assets.filter((a) => /active/i.test(a.status || '')).length,
      assetsUnderRepair: assets.filter((a) => /repair|maintenance/i.test(a.status || '')).length,
      missingAssets: assets.filter((a) => /missing/i.test(a.status || '')).length,
      warrantyExpiring,
      amcExpiring,
      maintenanceDue: contracts.filter((c) => c.remainingVisits != null && c.remainingVisits <= 0).length,
      overdueMaintenance: 0,
    },
    assetsByLocation: chartFromMap(byLocation),
    assetsByCategory: chartFromMap(byCategory),
    assetDistribution: chartFromMap(byStatus),
    assetValueByCategory: chartFromMap(valueByCategory),
    warrantyExpiryByMonth: addMonthsChart(assets, 'warrantyEndDate'),
    amcExpiryByMonth: addMonthsChart(assets, 'amcEndDate'),
    depreciationByMonth: chartFromMap(depByMonth),
  });
});

export default router;
