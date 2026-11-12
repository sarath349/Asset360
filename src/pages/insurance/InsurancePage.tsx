import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, FileWarning, Plus, Shield, ShieldCheck } from 'lucide-react';
import { ApiInsuranceClaim, ApiInsurancePolicy, insuranceApi } from '../../api/assetApi';
import { useFetch } from '../../lib/hooks';
import { date, money, toInputDate } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { AssetSelect } from '../../components/pickers';
import { DataTable, Empty, ErrorState, Field, Kpi, Loading, Modal, PageHeader, StatusBadge, Tabs } from '../../components/ui';

const emptyPolicy = (): Partial<ApiInsurancePolicy> => ({
  policyNumber: `POL-${Date.now().toString().slice(-6)}`,
  insuranceCompany: '',
  insuranceType: 'Asset',
  contactPerson: null,
  contactEmail: null,
  contactPhone: null,
  startDate: toInputDate(new Date()),
  endDate: null,
  coverageDetails: null,
  exclusions: null,
  insuredValue: null,
  premiumAmount: null,
  deductibleAmount: null,
  policyDocumentPath: null,
  status: 'Active',
});

const emptyClaim = (policyId?: number | null): Partial<ApiInsuranceClaim> => ({
  claimNumber: `CLM-${Date.now().toString().slice(-6)}`,
  policyId: policyId || null,
  assetId: null,
  incidentDate: null,
  claimDate: toInputDate(new Date()),
  claimDescription: '',
  claimAmount: null,
  insurerReference: null,
  claimDocumentPath: null,
  status: 'Submitted',
});

export default function InsurancePage() {
  const { can, user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('policies');
  const [edit, setEdit] = useState<Partial<ApiInsurancePolicy> | null>(null);
  const [claim, setClaim] = useState<Partial<ApiInsuranceClaim> | null>(null);
  const [mapPolicyId, setMapPolicyId] = useState<number | null>(null);
  const [mapAssetId, setMapAssetId] = useState<number | null>(null);
  const [mapValue, setMapValue] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: policies, loading, error, reload } = useFetch(() => insuranceApi.policies(), []);
  const { data: claims, reload: reloadClaims } = useFetch(() => insuranceApi.claims(), []);
  const { data: expiring } = useFetch(() => insuranceApi.expiring(30), []);

  const policyRows = useMemo(() => (policies || []).map((p) => ({ ...p, _id: String(p.policyId) })), [policies]);
  const claimRows = useMemo(() => (claims || []).map((c) => ({ ...c, _id: String(c.claimId) })), [claims]);

  const savePolicy = async () => {
    if (!edit?.policyNumber?.trim() || !edit?.insuranceCompany?.trim()) {
      return toast.error('Policy number and insurance company are required');
    }
    setBusy(true);
    try {
      const body: Partial<ApiInsurancePolicy> = {
        ...edit,
        policyNumber: edit.policyNumber!.trim(),
        insuranceCompany: edit.insuranceCompany!.trim(),
        createdBy: edit.createdBy ?? user?.userId ?? null,
      };
      if (edit.policyId) await insuranceApi.updatePolicy(edit.policyId, body);
      else await insuranceApi.createPolicy(body);
      setEdit(null);
      await reload();
      toast.success('Policy saved');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const saveClaim = async () => {
    if (!claim?.claimNumber?.trim() || !claim?.claimDescription?.trim()) {
      return toast.error('Claim number and description are required');
    }
    if (!claim.policyId) return toast.error('Policy is required');
    setBusy(true);
    try {
      await insuranceApi.createClaim({
        ...claim,
        claimNumber: claim.claimNumber!.trim(),
        claimDescription: claim.claimDescription!.trim(),
        createdBy: user?.userId || null,
      });
      setClaim(null);
      await reloadClaims();
      toast.success('Claim submitted');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const linkAsset = async () => {
    if (!mapPolicyId || !mapAssetId) return toast.error('Select policy and asset');
    setBusy(true);
    try {
      await insuranceApi.mapAsset({
        policyId: mapPolicyId,
        assetId: mapAssetId,
        assetInsuredValue: mapValue,
      });
      setMapPolicyId(null);
      setMapAssetId(null);
      setMapValue(null);
      toast.success('Asset linked to policy');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const decide = async (c: ApiInsuranceClaim, status: string) => {
    try {
      await insuranceApi.decideClaim(c.claimId, { status, remarks: status === 'Rejected' ? 'Rejected' : null });
      await reloadClaims();
      toast.success(`Claim ${status.toLowerCase()}`);
    } catch (err) {
      toast.error(err);
    }
  };

  if (error && !policies) return <ErrorState message={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        title="Insurance"
        subtitle="Policies, asset mapping and claims — wired to AssetAPI /api/assetinsurance."
        actions={
          can('insurance', 'create') && (
            <>
              <button className="btn" onClick={() => { setMapPolicyId(policies?.[0]?.policyId || null); setMapAssetId(null); setMapValue(null); }}>
                Link asset
              </button>
              <button className="btn" onClick={() => setClaim(emptyClaim(policies?.[0]?.policyId || null))}>
                New claim
              </button>
              <button className="btn btn-primary" onClick={() => setEdit(emptyPolicy())}>
                <Plus size={16} /> New policy
              </button>
            </>
          )
        }
      />

      <div className="grid grid-kpi mb">
        <Kpi label="Policies" value={(policies || []).length} icon={<Shield size={19} />} />
        <Kpi label="Expiring (30d)" value={(expiring || []).length} icon={<CalendarClock size={19} />} toneName="amber" />
        <Kpi label="Claims" value={(claims || []).length} icon={<FileWarning size={19} />} toneName="blue" />
        <Kpi label="Active" value={(policies || []).filter((p) => /active/i.test(p.status || '')).length} icon={<ShieldCheck size={19} />} toneName="green" />
      </div>

      <div className="card">
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { key: 'policies', label: 'Policies', count: (policies || []).length },
            { key: 'claims', label: 'Claims', count: (claims || []).length },
            { key: 'expiring', label: 'Expiring', count: (expiring || []).length },
          ]}
        />
        {loading && !policies ? (
          <Loading />
        ) : tab === 'claims' ? (
          <DataTable
            rows={claimRows}
            empty={<Empty title="No claims" />}
            columns={[
              { key: 'claimNumber', label: 'Claim', render: (c: ApiInsuranceClaim) => <span className="mono bold">{c.claimNumber}</span> },
              { key: 'policyId', label: 'Policy', render: (c: ApiInsuranceClaim) => policies?.find((p) => p.policyId === c.policyId)?.policyNumber || c.policyId },
              { key: 'assetId', label: 'Asset', render: (c: ApiInsuranceClaim) => (c.assetId ? <Link to={`/assets/${c.assetId}`}>#{c.assetId}</Link> : '—') },
              { key: 'claimAmount', label: 'Amount', className: 'right', render: (c: ApiInsuranceClaim) => money(c.claimAmount) },
              { key: 'claimDate', label: 'Date', render: (c: ApiInsuranceClaim) => date(c.claimDate) },
              { key: 'status', label: 'Status', render: (c: ApiInsuranceClaim) => <StatusBadge status={c.status || undefined} /> },
              {
                key: 'actions',
                label: '',
                render: (c: ApiInsuranceClaim) =>
                  can('insurance', 'edit') && /submit/i.test(c.status || '') ? (
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn btn-sm btn-success" onClick={() => decide(c, 'Approved')}>Approve</button>
                      <button className="btn btn-sm btn-danger" onClick={() => decide(c, 'Rejected')}>Reject</button>
                    </div>
                  ) : null,
              },
            ]}
          />
        ) : tab === 'expiring' ? (
          <DataTable
            rows={(expiring || []).map((p) => ({ ...p, _id: String(p.policyId) }))}
            empty={<Empty title="No policies expiring in 30 days" />}
            columns={[
              { key: 'policyNumber', label: 'Policy', render: (p: ApiInsurancePolicy) => <span className="mono bold">{p.policyNumber}</span> },
              { key: 'insuranceCompany', label: 'Company', render: (p: ApiInsurancePolicy) => p.insuranceCompany },
              { key: 'endDate', label: 'Ends', render: (p: ApiInsurancePolicy) => date(p.endDate) },
              { key: 'status', label: 'Status', render: (p: ApiInsurancePolicy) => <StatusBadge status={p.status || undefined} /> },
            ]}
          />
        ) : (
          <DataTable
            rows={policyRows}
            empty={<Empty title="No insurance policies" message="Register a policy and link assets to it." />}
            columns={[
              { key: 'policyNumber', label: 'Policy', render: (p: ApiInsurancePolicy) => <span className="mono bold">{p.policyNumber}</span> },
              { key: 'insuranceCompany', label: 'Company', render: (p: ApiInsurancePolicy) => p.insuranceCompany },
              { key: 'insuranceType', label: 'Type', render: (p: ApiInsurancePolicy) => p.insuranceType || '—' },
              { key: 'startDate', label: 'Start', render: (p: ApiInsurancePolicy) => date(p.startDate) },
              { key: 'endDate', label: 'End', render: (p: ApiInsurancePolicy) => date(p.endDate) },
              { key: 'insuredValue', label: 'Insured value', className: 'right', render: (p: ApiInsurancePolicy) => money(p.insuredValue) },
              { key: 'status', label: 'Status', render: (p: ApiInsurancePolicy) => <StatusBadge status={p.status || undefined} /> },
              {
                key: 'actions',
                label: '',
                render: (p: ApiInsurancePolicy) =>
                  can('insurance', 'edit') && (
                    <button className="btn btn-sm" onClick={() => setEdit(p)}>Edit</button>
                  ),
              },
            ]}
          />
        )}
      </div>

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.policyId ? 'Edit policy' : 'New policy'}
        size="lg"
        footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={savePolicy}>Save</button></>}
      >
        {edit && (
          <div className="form-grid">
            <Field label="Policy number" required>
              <input className="input mono" value={edit.policyNumber || ''} onChange={(e) => setEdit({ ...edit, policyNumber: e.target.value })} />
            </Field>
            <Field label="Insurance company" required>
              <input className="input" value={edit.insuranceCompany || ''} onChange={(e) => setEdit({ ...edit, insuranceCompany: e.target.value })} />
            </Field>
            <Field label="Insurance type">
              <input className="input" value={edit.insuranceType || ''} onChange={(e) => setEdit({ ...edit, insuranceType: e.target.value })} placeholder="e.g. Asset, Fire, All risk" />
            </Field>
            <Field label="Status">
              <select className="select" value={edit.status || 'Active'} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                {['Active', 'Expired', 'Cancelled', 'Pending'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Start date">
              <input type="date" className="input" value={toInputDate(edit.startDate)} onChange={(e) => setEdit({ ...edit, startDate: e.target.value || null })} />
            </Field>
            <Field label="End date">
              <input type="date" className="input" value={toInputDate(edit.endDate)} onChange={(e) => setEdit({ ...edit, endDate: e.target.value || null })} />
            </Field>
            <Field label="Insured value">
              <input type="number" className="input" value={edit.insuredValue ?? ''} onChange={(e) => setEdit({ ...edit, insuredValue: e.target.value ? Number(e.target.value) : null })} />
            </Field>
            <Field label="Premium amount">
              <input type="number" className="input" value={edit.premiumAmount ?? ''} onChange={(e) => setEdit({ ...edit, premiumAmount: e.target.value ? Number(e.target.value) : null })} />
            </Field>
            <Field label="Deductible amount">
              <input type="number" className="input" value={edit.deductibleAmount ?? ''} onChange={(e) => setEdit({ ...edit, deductibleAmount: e.target.value ? Number(e.target.value) : null })} />
            </Field>
            <Field label="Contact person">
              <input className="input" value={edit.contactPerson || ''} onChange={(e) => setEdit({ ...edit, contactPerson: e.target.value })} />
            </Field>
            <Field label="Contact email">
              <input type="email" className="input" value={edit.contactEmail || ''} onChange={(e) => setEdit({ ...edit, contactEmail: e.target.value })} />
            </Field>
            <Field label="Contact phone">
              <input className="input" value={edit.contactPhone || ''} onChange={(e) => setEdit({ ...edit, contactPhone: e.target.value })} />
            </Field>
            <Field label="Policy document path" className="full">
              <input className="input mono" value={edit.policyDocumentPath || ''} onChange={(e) => setEdit({ ...edit, policyDocumentPath: e.target.value })} placeholder="URL or file path" />
            </Field>
            <Field label="Coverage details" className="full">
              <textarea className="textarea" value={edit.coverageDetails || ''} onChange={(e) => setEdit({ ...edit, coverageDetails: e.target.value })} />
            </Field>
            <Field label="Exclusions" className="full">
              <textarea className="textarea" value={edit.exclusions || ''} onChange={(e) => setEdit({ ...edit, exclusions: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={!!claim}
        onClose={() => setClaim(null)}
        title="Submit insurance claim"
        size="lg"
        footer={<><button className="btn" onClick={() => setClaim(null)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={saveClaim}>Submit</button></>}
      >
        {claim && (
          <div className="form-grid">
            <Field label="Claim number" required>
              <input className="input mono" value={claim.claimNumber || ''} onChange={(e) => setClaim({ ...claim, claimNumber: e.target.value })} />
            </Field>
            <Field label="Policy" required>
              <select className="select" value={claim.policyId ?? ''} onChange={(e) => setClaim({ ...claim, policyId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Select policy…</option>
                {(policies || []).map((p) => (
                  <option key={p.policyId} value={p.policyId}>{p.policyNumber} · {p.insuranceCompany}</option>
                ))}
              </select>
            </Field>
            <Field label="Asset">
              <AssetSelect value={claim.assetId ? String(claim.assetId) : null} onChange={(v) => setClaim({ ...claim, assetId: v ? Number(v) : null })} />
            </Field>
            <Field label="Incident id">
              <input type="number" className="input" value={claim.incidentId ?? ''} onChange={(e) => setClaim({ ...claim, incidentId: e.target.value ? Number(e.target.value) : null })} placeholder="Optional" />
            </Field>
            <Field label="Claim amount">
              <input type="number" className="input" value={claim.claimAmount ?? ''} onChange={(e) => setClaim({ ...claim, claimAmount: e.target.value ? Number(e.target.value) : null })} />
            </Field>
            <Field label="Incident date">
              <input type="date" className="input" value={toInputDate(claim.incidentDate)} onChange={(e) => setClaim({ ...claim, incidentDate: e.target.value || null })} />
            </Field>
            <Field label="Claim date">
              <input type="date" className="input" value={toInputDate(claim.claimDate)} onChange={(e) => setClaim({ ...claim, claimDate: e.target.value || null })} />
            </Field>
            <Field label="Insurer reference">
              <input className="input mono" value={claim.insurerReference || ''} onChange={(e) => setClaim({ ...claim, insurerReference: e.target.value })} />
            </Field>
            <Field label="Claim document path" className="full">
              <input className="input mono" value={claim.claimDocumentPath || ''} onChange={(e) => setClaim({ ...claim, claimDocumentPath: e.target.value })} />
            </Field>
            <Field label="Claim description" required className="full">
              <textarea className="textarea" value={claim.claimDescription || ''} onChange={(e) => setClaim({ ...claim, claimDescription: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={mapPolicyId != null}
        onClose={() => setMapPolicyId(null)}
        title="Link asset to policy"
        footer={<><button className="btn" onClick={() => setMapPolicyId(null)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={linkAsset}>Link</button></>}
      >
        <div className="form-grid">
          <Field label="Policy" required>
            <select className="select" value={mapPolicyId || ''} onChange={(e) => setMapPolicyId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Select policy…</option>
              {(policies || []).map((p) => (
                <option key={p.policyId} value={p.policyId}>{p.policyNumber} · {p.insuranceCompany}</option>
              ))}
            </select>
          </Field>
          <Field label="Asset" required>
            <AssetSelect value={mapAssetId ? String(mapAssetId) : null} onChange={(v) => setMapAssetId(v ? Number(v) : null)} />
          </Field>
          <Field label="Asset insured value" className="full">
            <input type="number" className="input" value={mapValue ?? ''} onChange={(e) => setMapValue(e.target.value ? Number(e.target.value) : null)} placeholder="Optional" />
          </Field>
        </div>
      </Modal>
    </>
  );
}
