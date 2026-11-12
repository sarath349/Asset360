import { useMemo, useState } from 'react';
import { CheckCircle2, Clock, Package, Plus, Truck } from 'lucide-react';
import { ApiAssetLoan, ApiLoanItem, CONDITIONS, loanApi } from '../../api/assetApi';
import { useFetch } from '../../lib/hooks';
import { date } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useData } from '../../context/DataContext';
import { AssetSelect, EmployeePicker } from '../../components/pickers';
import { DataTable, Empty, ErrorState, Field, Kpi, Loading, Modal, PageHeader, StatusBadge, Tabs } from '../../components/ui';

type LoanAsset = { assetId: number; assetCode: string | null; assetName: string | null };
const EMPTY_FORM = { borrowerEmployeeId: null as number | null, borrowerName: '', purpose: '', returnDate: '', remarks: '', assets: [] as LoanAsset[] };

export default function LoansPage() {
  const { can, user } = useAuth();
  const { employees } = useData();
  const toast = useToast();
  const [tab, setTab] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<ApiAssetLoan | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data, loading, error, reload } = useFetch(() => loanApi.list(), []);
  const all = data || [];
  const rows = useMemo(() => {
    let list = all;
    if (tab === 'pending') list = list.filter((l) => /pending/i.test(l.status));
    else if (tab === 'issued') list = list.filter((l) => /issued|approved/i.test(l.status));
    else if (tab === 'mine') list = list.filter((l) => l.requestedBy === user?.userId || l.borrowerEmployeeId === user?.userId);
    return list.map((l) => ({ ...l, _id: String(l.loanId) }));
  }, [all, tab, user?.userId]);

  const save = async () => {
    const employee = employees.find((e) => e.employeeId === form.borrowerEmployeeId);
    if (!employee && !form.borrowerName.trim()) return toast.error('Choose the borrower or type a name');
    if (!form.purpose.trim()) return toast.error('Enter the purpose of the loan');
    if (!form.returnDate) return toast.error('Choose the expected return date');
    if (!form.assets.length) return toast.error('Pick at least one asset');
    setBusy(true);
    try {
      await loanApi.create({
        assetIds: form.assets.map((a) => a.assetId),
        borrowerType: employee ? 'Employee' : 'External',
        borrowerEmployeeId: employee?.employeeId ?? null,
        borrowerName: form.borrowerName.trim() || employee?.name || null,
        borrowerEmail: employee?.email || null,
        borrowerPhone: employee?.phone || null,
        loanPurpose: form.purpose.trim(),
        expectedReturnDate: new Date(form.returnDate).toISOString(),
        remarks: form.remarks.trim() || null,
      });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      await reload();
      toast.success('Loan request created');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const decide = async (loan: ApiAssetLoan, decision: 'Approve' | 'Reject') => {
    setBusy(true);
    try {
      await loanApi.decide(loan.loanId, { decision, decidedBy: user?.userId || null });
      await reload();
      setDetail(null);
      toast.success(decision === 'Approve' ? 'Loan approved' : 'Loan rejected');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const issue = async (loan: ApiAssetLoan) => {
    setBusy(true);
    try {
      await loanApi.issue(loan.loanId, { issuedBy: user?.userId || null });
      await reload();
      setDetail(null);
      toast.success('Assets issued');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const returnItem = async (item: ApiLoanItem) => {
    setBusy(true);
    try {
      await loanApi.returnItem(item.loanItemId, { conditionIn: item.conditionOut || 'Good' });
      await reload();
      toast.success('Asset returned');
      const refreshed = await loanApi.get(detail!.loanId);
      setDetail(refreshed);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        title="Asset loans"
        subtitle="Request, approve, issue and return temporary asset loans."
        actions={can('loans', 'create') && <button className="btn btn-primary" onClick={() => setCreateOpen(true)}><Plus size={16} /> New loan</button>}
      />
      <div className="grid grid-kpi mb">
        <Kpi label="All loans" value={all.length} icon={<Package size={19} />} />
        <Kpi label="Pending" value={all.filter((l) => /pending/i.test(l.status)).length} icon={<Clock size={19} />} toneName="amber" />
        <Kpi label="Issued" value={all.filter((l) => /issued/i.test(l.status)).length} icon={<Truck size={19} />} toneName="blue" />
        <Kpi label="Returned" value={all.filter((l) => /return/i.test(l.status)).length} icon={<CheckCircle2 size={19} />} toneName="green" />
      </div>
      <div className="card">
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { key: 'all', label: 'All', count: all.length },
            { key: 'pending', label: 'Pending', count: all.filter((l) => /pending/i.test(l.status)).length },
            { key: 'issued', label: 'Active', count: all.filter((l) => /issued|approved/i.test(l.status)).length },
            { key: 'mine', label: 'My loans', count: all.filter((l) => l.requestedBy === user?.userId || l.borrowerEmployeeId === user?.userId).length },
          ]}
        />
        {loading && !data ? (
          <Loading />
        ) : (
          <DataTable
            rows={rows}
            onRowClick={(l) => setDetail(l)}
            empty={<Empty title="No loans yet" message="Create a loan request for temporary asset issue." />}
            columns={[
              { key: 'loanNumber', label: 'Loan', render: (l: ApiAssetLoan) => <span className="mono bold">{l.loanNumber}</span> },
              { key: 'borrowerName', label: 'Borrower', render: (l: ApiAssetLoan) => l.borrowerName || '—' },
              { key: 'purpose', label: 'Purpose', render: (l: ApiAssetLoan) => l.purpose || '—' },
              { key: 'items', label: 'Assets', className: 'right', render: (l: ApiAssetLoan) => l.items?.length || 0 },
              { key: 'requestedFrom', label: 'From', render: (l: ApiAssetLoan) => date(l.requestedFrom) },
              { key: 'requestedTo', label: 'To', render: (l: ApiAssetLoan) => date(l.requestedTo) },
              { key: 'status', label: 'Status', render: (l: ApiAssetLoan) => <StatusBadge status={l.status} /> },
            ]}
          />
        )}
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New loan request"
        size="lg"
        footer={<><button className="btn" onClick={() => setCreateOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>Submit</button></>}
      >
        <div className="form-grid">
          <Field label="Borrower (employee)">
            <EmployeePicker
              value={form.borrowerEmployeeId != null ? String(form.borrowerEmployeeId) : null}
              onChange={(v) => {
                const e = employees.find((x) => x._id === v);
                setForm({ ...form, borrowerEmployeeId: e ? e.employeeId : null, borrowerName: e ? e.name : form.borrowerName });
              }}
            />
          </Field>
          <Field label="Borrower name" hint="Type a name if the borrower is not an employee">
            <input className="input" value={form.borrowerName} onChange={(e) => setForm({ ...form, borrowerName: e.target.value })} />
          </Field>
          <Field label="Purpose" required className="full">
            <textarea className="textarea" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
          </Field>
          <Field label="Expected return date" required>
            <input type="date" className="input" value={form.returnDate} onChange={(e) => setForm({ ...form, returnDate: e.target.value })} />
          </Field>
          <Field label="Remarks">
            <input className="input" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          </Field>
          <Field label="Assets" required className="full">
            {/* Picking an asset adds it straight to the list below. */}
            <AssetSelect
              value={null}
              placeholder="Search and pick an asset to add…"
              exclude={form.assets.map((a) => a.assetId)}
              onChange={(_v, a) => {
                if (!a || form.assets.some((x) => x.assetId === a.assetId)) return;
                setForm({ ...form, assets: [...form.assets, { assetId: a.assetId, assetCode: a.assetCode, assetName: a.assetName }] });
              }}
            />
          </Field>
          <div className="full">
            {form.assets.length ? (
              <ul className="stack" style={{ gap: 6 }}>
                {form.assets.map((it) => (
                  <li key={it.assetId} className="row-between">
                    <span>{it.assetCode} · {it.assetName}</span>
                    <button className="btn btn-sm btn-danger" type="button" onClick={() => setForm({ ...form, assets: form.assets.filter((x) => x.assetId !== it.assetId) })}>Remove</button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="No assets added" />
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.loanNumber || 'Loan'}
        size="lg"
        footer={
          detail && (
            <>
              <button className="btn" onClick={() => setDetail(null)}>Close</button>
              {can('loans', 'approve') && /pending/i.test(detail.status) && (
                <>
                  <button className="btn btn-danger" disabled={busy} onClick={() => decide(detail, 'Reject')}>Reject</button>
                  <button className="btn btn-success" disabled={busy} onClick={() => decide(detail, 'Approve')}>Approve</button>
                </>
              )}
              {can('loans', 'edit') && /approve/i.test(detail.status) && (
                <button className="btn btn-primary" disabled={busy} onClick={() => issue(detail)}>Issue assets</button>
              )}
            </>
          )
        }
      >
        {detail && (
          <div className="stack" style={{ gap: 14 }}>
            <div className="row" style={{ gap: 10 }}>
              <StatusBadge status={detail.status} />
              <span className="muted small">{detail.purpose}</span>
            </div>
            <div className="small muted">Borrower: {detail.borrowerName || '—'} · {date(detail.requestedFrom)} → {date(detail.requestedTo)}</div>
            <DataTable
              rows={(detail.items || []).map((i) => ({ ...i, _id: String(i.loanItemId) }))}
              empty={<Empty title="No items" />}
              columns={[
                { key: 'assetCode', label: 'Asset', render: (i: ApiLoanItem) => <div><div className="cell-main">{i.assetName}</div><div className="cell-sub mono">{i.assetCode}</div></div> },
                { key: 'status', label: 'Status', render: (i: ApiLoanItem) => <StatusBadge status={i.status} /> },
                { key: 'conditionOut', label: 'Out', render: (i: ApiLoanItem) => i.conditionOut || '—' },
                {
                  key: 'actions',
                  label: '',
                  render: (i: ApiLoanItem) =>
                    /issued/i.test(i.status) && can('loans', 'edit') ? (
                      <button className="btn btn-sm" disabled={busy} onClick={() => returnItem(i)}>Return</button>
                    ) : null,
                },
              ]}
            />
            <Field label="Condition on return (default)">
              <select className="select" defaultValue="Good">
                {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
          </div>
        )}
      </Modal>
    </>
  );
}
