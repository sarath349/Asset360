import { useEffect, useState } from 'react';
import {
  ApiAsset, ApiAssignment, ApiDepreciation, ApiDisposal, assetApi, AssignmentAction, assignmentApi, CONDITIONS, DEPRECIATION_METHODS, depreciationMethodLabel, DISPOSAL_METHODS, depreciationApi,
  disposalApi,
} from '../api/assetApi';
import { useAuth } from '../context/AuthContext';
import { useNames } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { toInputDate } from '../lib/format';
import { tryGpsText } from '../lib/geo';
import { Field, Modal, Switch } from './ui';
import { AssetSelect, DepartmentPicker, EmployeePicker, LocationPicker } from './pickers';

const toId = (v: string | null | undefined) => (v ? Number(v) : null);
const toKey = (v: number | null | undefined) => (v ? String(v) : null);

// Loads the full asset record when only an id was picked, so "from" fields reflect current custody.
function useAsset(initial?: ApiAsset | null) {
  const [asset, setAsset] = useState<ApiAsset | null>(initial || null);
  useEffect(() => setAsset(initial || null), [initial]);
  const pick = (id: string | null) => {
    if (!id) return setAsset(null);
    assetApi.get(id).then(setAsset).catch(() => setAsset(null));
  };
  return { asset, pick };
}

function AssetSummary({ asset }: { asset: ApiAsset }) {
  const names = useNames();
  return (
    <div className="alert alert-info">
      <div>
        <b className="mono">{asset.assetCode || `#${asset.assetId}`}</b> · {asset.assetName}
        <div className="xs" style={{ marginTop: 3 }}>
          With <b>{asset.assignedTo ? names.employee(asset.assignedTo) : 'Store'}</b> at {names.location(asset.locationId) || '—'} · {names.department(asset.departmentId) || 'No department'}
        </div>
      </div>
    </div>
  );
}

export const ASSIGNMENT_ACTIONS: { value: AssignmentAction; label: string; hint: string }[] = [
  { value: 'assign', label: 'Assign to employee', hint: 'Issue an asset from store to an employee' },
  { value: 'transfer', label: 'Employee → Employee', hint: 'Hand over from the current holder to another employee' },
  { value: 'location-transfer', label: 'Location transfer', hint: 'Physically move the asset to another location' },
  { value: 'return', label: 'Return to store', hint: 'The employee returns the asset' },
];

const ACTION_TYPE: Record<AssignmentAction, string> = { assign: 'Assign', transfer: 'Transfer', 'location-transfer': 'Location Transfer', return: 'Return' };

export function AssignmentModal({ open, onClose, asset: initial, defaultAction, onDone, captureGps }: { open: boolean; onClose: () => void; asset?: ApiAsset | null; defaultAction?: AssignmentAction; onDone?: () => void; captureGps?: boolean }) {
  const toast = useToast();
  const { user } = useAuth();
  const { asset, pick } = useAsset(initial);
  const [action, setAction] = useState<AssignmentAction>('assign');
  const [f, setF] = useState<Partial<ApiAssignment>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAction(defaultAction || (initial?.assignedTo ? 'transfer' : 'assign'));
    setF({ conditionAtHandover: 'Good' });
    pick(initial ? String(initial.assetId) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, defaultAction]);

  const set = <K extends keyof ApiAssignment>(k: K, v: ApiAssignment[K] | null) => setF((p) => ({ ...p, [k]: v }));
  const needsEmployee = action === 'assign' || action === 'transfer';

  const submit = async () => {
    if (!asset) return toast.error('Select an asset');
    if (needsEmployee && !f.toEmployeeId) return toast.error('Select the employee receiving the asset');
    if (action === 'location-transfer' && !f.toLocationId) return toast.error('Select the destination location');
    if (action === 'return' && !f.toDepartmentId) return toast.error('Select the department receiving the returned asset');
    if (f.isTemporary && !f.expectedReturnDate) return toast.error('Enter the expected return date');
    setBusy(true);
    // The API has no GPS fields on a handover, so the fix is appended to the remarks.
    const gps = captureGps ? await tryGpsText() : '';
    const body: Partial<ApiAssignment> = {
      ...f,
      handoverRemarks: [f.handoverRemarks, gps].filter(Boolean).join(' · ') || null,
      assetId: asset.assetId,
      transactionType: ACTION_TYPE[action],
      fromEmployeeId: asset.assignedTo,
      fromDepartmentId: asset.departmentId,
      fromLocationId: asset.locationId,
      toEmployeeId: needsEmployee ? f.toEmployeeId : null,
      toDepartmentId: f.toDepartmentId || (action === 'return' ? null : asset.departmentId),
      toLocationId: f.toLocationId || (action === 'return' ? null : asset.locationId),
      expectedReturnDate: f.isTemporary ? f.expectedReturnDate : null,
      requestedBy: user?.userId || null,
    };
    try {
      try {
        await assignmentApi.run(action, body);
        toast.success(`${ACTION_TYPE[action]} recorded for ${asset.assetCode || `#${asset.assetId}`}`);
      } catch (err) {
        // The AssetAPI's assignment endpoints (assign, transfer, location-transfer, return) currently reject every
        // request with this placeholder message, so apply the change to the asset record directly.
        if (!(err instanceof Error) || !/assetId route parameter/i.test(err.message)) throw err;
        const status = asset.status || '';
        const patch: Partial<ApiAsset> =
          action === 'return'
            ? {
                assignedTo: null,
                departmentId: body.toDepartmentId ?? asset.departmentId,
                locationId: body.toLocationId ?? asset.locationId,
                status: status === 'Active' ? 'In Store' : status,
              }
            : action === 'location-transfer'
              ? { locationId: body.toLocationId ?? asset.locationId, departmentId: body.toDepartmentId ?? asset.departmentId }
              : {
                  assignedTo: body.toEmployeeId ?? null,
                  departmentId: body.toDepartmentId ?? asset.departmentId,
                  locationId: body.toLocationId ?? asset.locationId,
                  status: status === 'In Store' ? 'Active' : status,
                };
        await assetApi.update(asset.assetId, { ...asset, ...patch });
        toast.info(`${asset.assetCode || `#${asset.assetId}`} updated, but the API did not record assignment history (backend ${action} endpoint is not implemented).`);
      }
      onDone?.();
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Assign / Transfer asset"
      size="lg"
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>Submit</button>
        </>
      }
    >
      <div className="stack">
        {!initial && (
          <Field label="Asset" required>
            <AssetSelect value={asset ? String(asset.assetId) : null} onChange={pick} />
          </Field>
        )}
        {asset && <AssetSummary asset={asset} />}
        <div className="grid grid-2" style={{ gap: 8 }}>
          {ASSIGNMENT_ACTIONS.map((t) => (
            <button
              type="button"
              key={t.value}
              onClick={() => setAction(t.value)}
              className="card"
              style={{
                textAlign: 'left',
                padding: 12,
                cursor: 'pointer',
                borderColor: action === t.value ? 'var(--primary)' : undefined,
                boxShadow: action === t.value ? '0 0 0 3px var(--primary-50)' : undefined,
                background: '#fff',
              }}
            >
              <div className="bold small">{t.label}</div>
              <div className="xs muted" style={{ marginTop: 3 }}>{t.hint}</div>
            </button>
          ))}
        </div>
        <div className="form-grid">
          {needsEmployee && (
            <Field label="To employee" required>
              <EmployeePicker value={toKey(f.toEmployeeId)} onChange={(v) => set('toEmployeeId', toId(v))} />
            </Field>
          )}
          <Field label={action === 'return' ? 'Return to location (store)' : 'To location'} required={action === 'location-transfer'} hint={action !== 'location-transfer' ? 'Leave empty to keep the current location' : undefined}>
            <LocationPicker value={toKey(f.toLocationId)} onChange={(v) => set('toLocationId', toId(v))} />
          </Field>
          <Field label="To department" required={action === 'return'} hint={action === 'return' ? undefined : 'Optional'}>
            <DepartmentPicker value={toKey(f.toDepartmentId)} onChange={(v) => set('toDepartmentId', toId(v))} />
          </Field>
          <Field label="Condition at handover">
            <select className="select" value={f.conditionAtHandover || ''} onChange={(e) => set('conditionAtHandover', e.target.value)}>
              {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          {needsEmployee && (
            <>
              <label className="row small" style={{ gap: 10 }}>
                <Switch checked={Boolean(f.isTemporary)} onChange={(v) => set('isTemporary', v)} /> Temporary assignment (loan)
              </label>
              {f.isTemporary && (
                <Field label="Expected return date" required>
                  <input type="date" className="input" value={toInputDate(f.expectedReturnDate)} onChange={(e) => set('expectedReturnDate', e.target.value)} />
                </Field>
              )}
            </>
          )}
          <Field label="Handover remarks" className="full">
            <textarea className="textarea" value={f.handoverRemarks || ''} onChange={(e) => set('handoverRemarks', e.target.value)} placeholder="e.g. New joiner, project allocation, relocation…" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

export function DisposalModal({ open, onClose, asset: initial, onDone }: { open: boolean; onClose: () => void; asset?: ApiAsset | null; onDone?: (d: ApiDisposal) => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const { asset, pick } = useAsset(initial);
  const [f, setF] = useState<Partial<ApiDisposal>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF({ disposalRequestNumber: `DSP-${Date.now().toString().slice(-8)}`, assetCondition: 'Poor', requestedDisposalMethod: 'Scrap', dataWipingRequired: false });
    pick(initial ? String(initial.assetId) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);
  const set = <K extends keyof ApiDisposal>(k: K, v: ApiDisposal[K] | null) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!asset || !f.retirementReason?.trim() || !f.disposalRequestNumber?.trim()) return toast.error('Asset, request number and reason are required');
    setBusy(true);
    try {
      const prior = await disposalApi.byAsset(asset.assetId).catch(() => [] as ApiDisposal[]);
      const open = (Array.isArray(prior) ? prior : []).find((p) => !/reject|complete|dispos/i.test(p.approvalStatus || ''));
      if (open) {
        toast.error(`${asset.assetCode || `#${asset.assetId}`} already has an open disposal request (${open.disposalRequestNumber}).`);
        return;
      }
      const d = await disposalApi.create({ ...f, assetId: asset.assetId, retirementReason: f.retirementReason.trim(), requestedBy: user?.userId || null });
      toast.success(`${f.disposalRequestNumber} submitted for approval`);
      onDone?.(d);
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Retirement / disposal request"
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" onClick={submit} disabled={busy}>Submit request</button>
        </>
      }
    >
      <div className="stack">
        {!initial && (
          <Field label="Asset" required>
            <AssetSelect value={asset ? String(asset.assetId) : null} onChange={pick} />
          </Field>
        )}
        {asset && <AssetSummary asset={asset} />}
        <div className="form-grid">
          <Field label="Request number" required>
            <input className="input mono" value={f.disposalRequestNumber || ''} onChange={(e) => set('disposalRequestNumber', e.target.value)} />
          </Field>
          <Field label="Asset condition">
            <select className="select" value={f.assetCondition || ''} onChange={(e) => set('assetCondition', e.target.value)}>
              {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Proposed disposal method">
            <select className="select" value={f.requestedDisposalMethod || ''} onChange={(e) => set('requestedDisposalMethod', e.target.value)}>
              {DISPOSAL_METHODS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
          <label className="row small" style={{ gap: 10 }}>
            <Switch checked={Boolean(f.dataWipingRequired)} onChange={(v) => set('dataWipingRequired', v)} /> Data wiping required
          </label>
          <Field label="Reason" required className="full">
            <textarea className="textarea" value={f.retirementReason || ''} onChange={(e) => set('retirementReason', e.target.value)} placeholder="e.g. End of life, beyond economical repair, obsolete…" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

export function DepreciationModal({ open, onClose, asset: initial, onDone }: { open: boolean; onClose: () => void; asset?: ApiAsset | null; onDone?: () => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const { asset, pick } = useAsset(initial);
  const [f, setF] = useState<Partial<ApiDepreciation>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    pick(initial ? String(initial.assetId) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);
  useEffect(() => {
    if (!open) return;
    setF({
      depreciationMethod: DEPRECIATION_METHODS[0],
      usefulLifeMonths: 60,
      residualValue: 0,
      purchaseValue: asset?.purchaseCost ?? undefined,
      depreciationStartDate: toInputDate(asset?.purchaseDate) || toInputDate(new Date()),
    });
  }, [open, asset]);
  const set = <K extends keyof ApiDepreciation>(k: K, v: ApiDepreciation[K] | null) => setF((p) => ({ ...p, [k]: v }));
  const num = (v: string) => (v === '' ? (null as any) : Number(v));

  const submit = async () => {
    if (!asset) return toast.error('Select an asset');
    if (!f.purchaseValue || !f.usefulLifeMonths) return toast.error('Purchase value and useful life are required');
    setBusy(true);
    try {
      const existing = await depreciationApi.byAsset(asset.assetId).catch(() => null);
      if (existing && (Array.isArray(existing) ? existing.length : existing.depreciationId)) {
        toast.error(`${asset.assetCode || `#${asset.assetId}`} already has a depreciation schedule. Use Recalculate on it instead.`);
        return;
      }
      const created = await depreciationApi.create({
        ...f,
        assetId: asset.assetId,
        purchaseValue: Number(f.purchaseValue),
        usefulLifeMonths: Number(f.usefulLifeMonths),
        residualValue: Number(f.residualValue || 0),
        currentBookValue: Number(f.purchaseValue),
        status: 'Active',
        createdBy: user?.userId || null,
      });
      // Post the first calculation straight away so book value and the dashboard reflect the new schedule.
      if (created?.depreciationId) await depreciationApi.calculate(created.depreciationId).catch(() => undefined);
      toast.success(`Depreciation set up for ${asset.assetCode || `#${asset.assetId}`}`);
      onDone?.();
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Set up depreciation"
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>Save schedule</button>
        </>
      }
    >
      <div className="stack">
        {!initial && (
          <Field label="Asset" required>
            <AssetSelect value={asset ? String(asset.assetId) : null} onChange={pick} />
          </Field>
        )}
        {asset && <AssetSummary asset={asset} />}
        <div className="form-grid">
          <Field label="Method" required>
            <select className="select" value={f.depreciationMethod || ''} onChange={(e) => set('depreciationMethod', e.target.value)}>
              {DEPRECIATION_METHODS.map((m) => <option key={m} value={m}>{depreciationMethodLabel(m)}</option>)}
            </select>
          </Field>
          <Field label="Start date" required>
            <input type="date" className="input" value={toInputDate(f.depreciationStartDate)} onChange={(e) => set('depreciationStartDate', e.target.value)} />
          </Field>
          <Field label="Purchase value" required>
            <input type="number" min={0} step="0.01" className="input" value={f.purchaseValue ?? ''} onChange={(e) => set('purchaseValue', num(e.target.value))} />
          </Field>
          <Field label="Residual (salvage) value">
            <input type="number" min={0} step="0.01" className="input" value={f.residualValue ?? ''} onChange={(e) => set('residualValue', num(e.target.value))} />
          </Field>
          <Field label="Useful life (months)" required hint={f.usefulLifeMonths ? `${Math.round((Number(f.usefulLifeMonths) / 12) * 10) / 10} years` : undefined}>
            <input type="number" min={1} className="input" value={f.usefulLifeMonths ?? ''} onChange={(e) => set('usefulLifeMonths', num(e.target.value))} />
          </Field>
          <Field label="Annual rate (%)" hint="Used by declining balance">
            <input type="number" min={0} step="0.01" className="input" value={f.annualDepreciationRate ?? ''} onChange={(e) => set('annualDepreciationRate', num(e.target.value))} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
