import { del, get, post, put } from './client';

// Typed wrappers for the AssetAPI backend (https://assetapi.secureworldme.com/swagger).

type Id = number | string;
type Range = { fromDate?: string; toDate?: string };

export interface ApiAsset {
  assetId: number;
  assetCode: string | null;
  assetName: string | null;
  description: string | null;
  categoryId: number | null;
  subCategoryId: number | null;
  assetTypeId: number | null;
  serialNumber: string | null;
  brand: string | null;
  model: string | null;
  purchaseDate: string | null;
  purchaseCost: number | null;
  vendorId: number | null;
  warrantyStartDate: string | null;
  warrantyEndDate: string | null;
  amcStartDate: string | null;
  amcEndDate: string | null;
  locationId: number | null;
  departmentId: number | null;
  assignedTo: number | null;
  status: string | null;
  qrCode: string | null;
  rfidTag: string | null;
  createdDate: string | null;
  updatedDate: string | null;
}

export interface ApiAssetSummary {
  assetId: number;
  assetCode: string | null;
  assetName: string | null;
  category: string | null;
  subCategory: string | null;
  status: string | null;
  brand: string | null;
  model: string | null;
}

export interface ApiCategory {
  categoryId: number;
  categoryName: string | null;
}

export interface ApiSubCategory {
  subCategoryId: number;
  categoryId: number | null;
  subCategoryName: string | null;
}

export interface ApiAssetType {
  assetTypeId: number;
  subCategoryId: number | null;
  typeName: string | null;
}

export interface ApiUser {
  userId: number;
  username: string | null;
  passwordHash: string | null;
  email: string | null;
  fullName: string | null;
  role: string | null;
  phone: string | null;
  departmentId: number | null;
  isActive: boolean;
  createdDate: string;
  lastLogin: string | null;
}

export interface ApiLocation {
  locationId: number;
  parentLocationId: number | null;
  locationCode: string | null;
  locationName: string | null;
  locationType: string | null;
  description: string | null;
  departmentId: number | null;
  costCenter: string | null;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  createdDate: string;
  updatedDate: string | null;
}

export interface ApiDepartment {
  departmentId: number;
  departmentCode: string | null;
  departmentName: string | null;
  locationId: number | null;
  description: string | null;
  isActive: boolean;
  createdDate: string;
  updatedDate: string | null;
}

export interface ApiEmployee {
  employeeId: number;
  employeeCode: string | null;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  departmentId: number | null;
  locationId: number | null;
  designation: string | null;
  dateOfJoining: string | null;
  isActive: boolean;
  createdDate: string;
  updatedDate: string | null;
}

export interface ApiAssignment {
  assignmentHistoryId: number;
  assetId: number;
  transactionType: string | null;
  fromEmployeeId: number | null;
  toEmployeeId: number | null;
  fromDepartmentId: number | null;
  toDepartmentId: number | null;
  fromLocationId: number | null;
  toLocationId: number | null;
  isTemporary: boolean;
  expectedReturnDate: string | null;
  transactionDate: string;
  requestedBy: number | null;
  approvedBy: number | null;
  approvalDate: string | null;
  handoverAcknowledged: boolean;
  acknowledgedByEmployeeId: number | null;
  acknowledgementDate: string | null;
  handoverRemarks: string | null;
  conditionAtHandover: string | null;
  fromSignaturePath: string | null;
  toSignaturePath: string | null;
  status: string | null;
  createdDate: string;
}

export interface ApiAuditCampaign {
  auditId: number;
  auditCode: string;
  auditName: string;
  siteId: number;
  areaId: number | null;
  startDate: string;
  endDate: string | null;
  assignedTo: number | null;
  status: string | null;
  remarks: string | null;
  createdBy: number | null;
  createdDate: string;
  completedDate: string | null;
}

export interface ApiAuditScan {
  scanLogId: number;
  auditId: number;
  auditItemId: number | null;
  assetId: number | null;
  scanCode: string | null;
  scanType: string | null;
  scannedLocationId: number | null;
  scanResult: string | null;
  scannedBy: number | null;
  scannedDate: string;
  remarks: string | null;
}

export interface ApiDepreciation {
  depreciationId: number;
  assetId: number;
  purchaseValue: number;
  depreciationMethod: string;
  usefulLifeMonths: number;
  residualValue: number;
  annualDepreciationRate: number | null;
  depreciationStartDate: string;
  lastCalculatedDate: string | null;
  accumulatedDepreciation: number;
  currentBookValue: number;
  status: string | null;
  createdBy: number | null;
  createdDate: string;
  updatedDate: string | null;
}

export interface ApiDisposal {
  disposalId: number;
  disposalRequestNumber: string;
  assetId: number;
  retirementReason: string;
  assetCondition: string | null;
  requestedDisposalMethod: string | null;
  requestDate: string;
  requestedBy: number | null;
  approvalStatus: string | null;
  approvedBy: number | null;
  approvalDate: string | null;
  approvalRemarks: string | null;
  disposalMethod: string | null;
  disposalDate: string | null;
  disposalValue: number | null;
  buyerVendorName: string | null;
  buyerVendorContact: string | null;
  disposalCertificatePath: string | null;
  dataWipingRequired: boolean;
  dataWipingCompleted: boolean;
  dataWipingCertificatePath: string | null;
  dataWipingDate: string | null;
  finalAssetStatus: string | null;
  disposalRemarks: string | null;
  createdDate: string;
  updatedDate: string | null;
}

export interface ApiContract {
  contractId: number;
  contractType: string;
  contractNumber: string;
  vendorName: string;
  contactPerson: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  startDate: string;
  endDate: string;
  coverage: string | null;
  contractValue: number | null;
  sla: string | null;
  totalVisits: number | null;
  remainingVisits: number | null;
  status: string | null;
  remarks: string | null;
  createdBy: number | null;
  createdDate: string;
  updatedDate: string | null;
}

export interface ApiContractVisit {
  visitId: number;
  contractId: number;
  assetId: number | null;
  visitDate: string;
  visitType: string | null;
  technicianName: string | null;
  description: string | null;
  findings: string | null;
  actionTaken: string | null;
  status: string | null;
  nextVisitDate: string | null;
  createdBy: number | null;
  createdDate: string;
}

export interface ApiContractDocument {
  documentId: number;
  contractId: number;
  documentName: string;
  documentType: string | null;
  filePath: string;
  contentType: string | null;
  uploadedBy: number | null;
  uploadedDate: string;
}

export interface ChartPoint {
  label: string;
  value: number;
}

export interface ApiDashboard {
  summary: {
    totalAssets: number;
    assetValue: number;
    activeAssets: number;
    assetsUnderRepair: number;
    missingAssets: number;
    warrantyExpiring: number;
    amcExpiring: number;
    maintenanceDue: number;
    overdueMaintenance: number;
  };
  assetsByLocation: ChartPoint[];
  assetsByCategory: ChartPoint[];
  assetDistribution: ChartPoint[];
  assetValueByCategory: ChartPoint[];
  warrantyExpiryByMonth: ChartPoint[];
  amcExpiryByMonth: ChartPoint[];
  depreciationByMonth: ChartPoint[];
}

export interface LoginResponse {
  success: boolean;
  token: string;
  userId: number;
  username: string;
  role: string | null;
}

// The backend stores DateTime columns that are not nullable, so new records always carry a timestamp.
export const nowIso = () => new Date().toISOString();

function crud<T>(path: string, idKey: keyof T & string) {
  return {
    list: () => get<T[]>(path),
    get: (id: Id) => get<T>(`${path}/${id}`),
    create: (x: Partial<T>) => post<T>(path, { createdDate: nowIso(), ...x, [idKey]: 0 }),
    update: (id: Id, x: Partial<T>) => put<T>(`${path}/${id}`, { ...x, [idKey]: Number(id), updatedDate: nowIso() }),
    remove: (id: Id) => del<string>(`${path}/${id}`),
  };
}

export const authApi = {
  login: (username: string, password: string) => post<LoginResponse>('/auth/login', { username, password }),
};

export const assetApi = {
  list: () => get<ApiAsset[]>('/assets'),
  listFull: () => get<ApiAssetSummary[]>('/assets/full'),
  get: (id: Id) => get<ApiAsset>(`/assets/${id}`),
  create: (a: Partial<ApiAsset>) => post<ApiAsset>('/assets', { ...a, assetId: 0 }),
  update: (id: Id, a: Partial<ApiAsset>) => put<ApiAsset>(`/assets/${id}`, { ...a, assetId: Number(id) }),
  remove: (id: Id) => del<string>(`/assets/${id}`),
};

export const categoryApi = {
  list: () => get<ApiCategory[]>('/category'),
  get: (id: Id) => get<ApiCategory>(`/category/${id}`),
  create: (c: Partial<ApiCategory>) => post<ApiCategory>('/category', { ...c, categoryId: 0 }),
  update: (id: Id, c: Partial<ApiCategory>) => put<ApiCategory>(`/category/${id}`, { ...c, categoryId: Number(id) }),
  remove: (id: Id) => del<string>(`/category/${id}`),
};

export const subCategoryApi = {
  list: () => get<ApiSubCategory[]>('/subcategory'),
  get: (id: Id) => get<ApiSubCategory>(`/subcategory/${id}`),
  create: (s: Partial<ApiSubCategory>) => post<ApiSubCategory>('/subcategory', { ...s, subCategoryId: 0 }),
  update: (id: Id, s: Partial<ApiSubCategory>) => put<ApiSubCategory>(`/subcategory/${id}`, { ...s, subCategoryId: Number(id) }),
  remove: (id: Id) => del<string>(`/subcategory/${id}`),
};

export const assetTypeApi = {
  list: () => get<ApiAssetType[]>('/assettypes'),
  get: (id: Id) => get<ApiAssetType>(`/assettypes/${id}`),
  bySubCategory: (subCategoryId: Id) => get<ApiAssetType[]>(`/assettypes/by-subcategory/${subCategoryId}`),
  create: (t: Partial<ApiAssetType>) => post<ApiAssetType>('/assettypes', { ...t, assetTypeId: 0 }),
  update: (id: Id, t: Partial<ApiAssetType>) => put<ApiAssetType>(`/assettypes/${id}`, { ...t, assetTypeId: Number(id) }),
  remove: (id: Id) => del<string>(`/assettypes/${id}`),
};

export const userApi = {
  list: () => get<ApiUser[]>('/users'),
  get: (id: Id) => get<ApiUser>(`/users/${id}`),
  create: (u: Partial<ApiUser>) => post<ApiUser>('/users', { ...u, userId: 0 }),
  update: (id: Id, u: Partial<ApiUser>) => put<ApiUser>(`/users/${id}`, { ...u, userId: Number(id) }),
  remove: (id: Id) => del<string>(`/users/${id}`),
};

export const locationApi = {
  ...crud<ApiLocation>('/locations', 'locationId'),
  byParent: (parentId: Id) => get<ApiLocation[]>(`/locations/by-parent/${parentId}`),
};

export const departmentApi = crud<ApiDepartment>('/departments', 'departmentId');

export const employeeApi = crud<ApiEmployee>('/employees', 'employeeId');

export type AssignmentAction = 'assign' | 'transfer' | 'location-transfer' | 'return';

export const assignmentApi = {
  list: () => get<ApiAssignment[]>('/assetassignments'),
  byAsset: (assetId: Id) => get<ApiAssignment[]>(`/assetassignments/asset/${assetId}`),
  run: (action: AssignmentAction, body: Partial<ApiAssignment>) =>
    post<any>(`/assetassignments/${action}`, {
      assignmentHistoryId: 0,
      isTemporary: false,
      handoverAcknowledged: false,
      transactionDate: nowIso(),
      createdDate: nowIso(),
      ...body,
    }),
};

export const auditApi = {
  campaigns: () => get<ApiAuditCampaign[]>('/assetaudit/campaigns'),
  create: (c: Partial<ApiAuditCampaign>) => post<ApiAuditCampaign>('/assetaudit/create', { auditId: 0, createdDate: nowIso(), ...c }),
  start: (auditId: Id) => post<any>(`/assetaudit/start/${auditId}`),
  assets: (auditId: Id) => get<any>(`/assetaudit/assets/${auditId}`),
  scan: (s: Partial<ApiAuditScan>) => post<any>('/assetaudit/scan', { scanLogId: 0, scannedDate: nowIso(), ...s }),
  complete: (auditId: Id) => post<any>(`/assetaudit/complete/${auditId}`),
  report: (auditId: Id) => get<any>(`/assetaudit/report/${auditId}`),
  scanHistory: (auditId: Id) => get<any>(`/assetaudit/scan-history/${auditId}`),
};

export const depreciationApi = {
  list: () => get<ApiDepreciation[]>('/assetdepreciation'),
  create: (d: Partial<ApiDepreciation>) =>
    post<ApiDepreciation>('/assetdepreciation', { depreciationId: 0, accumulatedDepreciation: 0, createdDate: nowIso(), ...d }),
  byAsset: (assetId: Id) => get<any>(`/assetdepreciation/asset/${assetId}`),
  calculate: (depreciationId: Id) => post<any>(`/assetdepreciation/calculate/${depreciationId}`),
  history: (assetId: Id) => get<any>(`/assetdepreciation/history/${assetId}`),
  report: (assetId: Id) => get<any>(`/assetdepreciation/report/${assetId}`),
};

export const disposalApi = {
  list: () => get<ApiDisposal[]>('/assetdisposals'),
  pending: () => get<ApiDisposal[]>('/assetdisposals/pending'),
  get: (id: Id) => get<ApiDisposal>(`/assetdisposals/${id}`),
  byAsset: (assetId: Id) => get<ApiDisposal[]>(`/assetdisposals/asset/${assetId}`),
  create: (d: Partial<ApiDisposal>) =>
    post<ApiDisposal>('/assetdisposals', {
      disposalId: 0,
      requestDate: nowIso(),
      createdDate: nowIso(),
      dataWipingRequired: false,
      dataWipingCompleted: false,
      approvalStatus: 'Pending',
      ...d,
    }),
  approve: (d: ApiDisposal) => post<any>(`/assetdisposals/approve/${d.disposalId}`, d),
  reject: (d: ApiDisposal) => post<any>(`/assetdisposals/reject/${d.disposalId}`, d),
  complete: (d: ApiDisposal) => post<any>(`/assetdisposals/complete/${d.disposalId}`, d),
};

export const contractApi = {
  list: () => get<ApiContract[]>('/assetcontracts'),
  get: (id: Id) => get<ApiContract>(`/assetcontracts/${id}`),
  create: (c: Partial<ApiContract>) => post<ApiContract>('/assetcontracts', { contractId: 0, createdDate: nowIso(), ...c }),
  update: (id: Id, c: Partial<ApiContract>) => put<ApiContract>(`/assetcontracts/${id}`, { ...c, contractId: Number(id), updatedDate: nowIso() }),
  mapAsset: (contractId: Id, assetId: Id) => post<any>('/assetcontracts/map-asset', { mappingId: 0, contractId: Number(contractId), assetId: Number(assetId), createdDate: nowIso() }),
  assets: (id: Id) => get<any>(`/assetcontracts/${id}/assets`),
  addVisit: (v: Partial<ApiContractVisit>) => post<any>('/assetcontracts/add-visit', { visitId: 0, createdDate: nowIso(), ...v }),
  visits: (id: Id) => get<ApiContractVisit[]>(`/assetcontracts/${id}/visits`),
  addDocument: (d: Partial<ApiContractDocument>) => post<any>('/assetcontracts/add-document', { documentId: 0, uploadedDate: nowIso(), ...d }),
  documents: (id: Id) => get<ApiContractDocument[]>(`/assetcontracts/${id}/documents`),
  expiryAlerts: () => get<any[]>('/assetcontracts/expiry-alerts'),
};

export const dashboardApi = {
  get: () => get<ApiDashboard>('/dashboard'),
};

export const reportApi = {
  assetsByLocation: () => get<any>('/reports/assets-by-location'),
  assetsByCategory: () => get<any>('/reports/assets-by-category'),
  assetValue: () => get<any>('/reports/asset-value'),
  warrantyExpiry: (r: Range = {}) => get<any>('/reports/warranty-expiry', r),
  amcExpiry: (r: Range = {}) => get<any>('/reports/amc-expiry', r),
  depreciation: (r: Range = {}) => get<any>('/reports/depreciation', r),
  auditDiscrepancies: (auditId: Id) => get<any>(`/reports/audit-discrepancies/${auditId}`),
  disposals: (r: Range = {}) => get<any>('/reports/disposals', r),
};

export const ASSET_STATUSES = ['In Store', 'Active', 'In Repair', 'Under Maintenance', 'Missing', 'Damaged', 'Retired', 'Disposed'];

export const USER_ROLES = ['Super Admin', 'Admin', 'Asset Manager', 'Facility Manager', 'Department Manager', 'Technician', 'Auditor', 'Employee'];

export const LOCATION_TYPES = ['Company', 'Site', 'Building', 'Floor', 'Area', 'Room', 'Zone', 'Rack'];

export const CONTRACT_TYPES = ['AMC', 'CMC', 'Warranty', 'Extended Warranty', 'Service', 'Lease'];

// Values must match the AssetAPI exactly; use depreciationMethodLabel for display.
export const DEPRECIATION_METHODS = ['StraightLine', 'DecliningBalance'];
export const depreciationMethodLabel = (m?: string | null) => (m ? m.replace(/([a-z])([A-Z])/g, '$1 $2') : '—');

export const DISPOSAL_METHODS = ['Sale', 'Scrap', 'Recycle', 'Donate', 'Return to Vendor', 'Write-off'];

export const CONDITIONS = ['New', 'Good', 'Fair', 'Poor', 'Damaged'];

export const userDisplayName = (u?: Pick<ApiUser, 'fullName' | 'username'> | null) => u?.fullName || u?.username || '—';
