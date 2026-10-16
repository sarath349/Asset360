import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, Clock, Plus, Trash2, Wallet } from 'lucide-react';
import { ApiAsset, ApiDisposal, assetApi, disposalApi } from '../../api/assetApi';
import { useFetch } from '../../lib/hooks';
import { date, money } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { useNames } from '../../context/DataContext';
import { DataTable, Empty, ErrorState, Kpi, Loading, PageHeader, SearchInput, StatusBadge, Tabs } from '../../components/ui';
import { DisposalModal } from '../../components/assetModals';

export type DisposalStage = 'pending' | 'approved' | 'completed' | 'rejected';

export function disposalStage(d: Pick<ApiDisposal, 'approvalStatus'>): DisposalStage {
  const s = (d.approvalStatus || '').toLowerCase();
  if (s.includes('reject')) return 'rejected';
  if (s.includes('complete') || s.includes('dispos')) return 'completed';
  if (s.includes('approve')) return 'approved';
  return 'pending';
}

export default function DisposalPage() {
  const { can } = useAuth();
  const names = useNames();
  const { inScope } = useBranch();
  const navigate = useNavigate();
  const [tab, setTab] = useState('open');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const { data, loading, error, reload } = useFetch(() => Promise.all([disposalApi.list(), assetApi.list().catch(() => [] as ApiAsset[])]), []);
  const [rawAll, assets] = data || [[], []];
  const assetById = useMemo(() => new Map(assets.map((a) => [a.assetId, a])), [assets]);
  const all = useMemo(() => rawAll.filter((d) => inScope(assetById.get(d.assetId)?.locationId)), [rawAll, assetById, inScope]);
  const count = (s: DisposalStage) => all.filter((d) => disposalStage(d) === s).length;
  const completed = all.filter((d) => disposalStage(d) === 'completed');

  const list = useMemo(() => {
    let l = all;
    if (tab === 'open') l = l.filter((d) => ['pending', 'approved'].includes(disposalStage(d)));
    else if (tab !== 'all') l = l.filter((d) => disposalStage(d) === tab);
    if (q) {
      const s = q.toLowerCase();
      l = l.filter((d) => {
        const a = assetById.get(d.assetId);
        return [d.disposalRequestNumber, a?.assetCode, a?.assetName, d.retirementReason, d.buyerVendorName].some((x) => x?.toLowerCase().includes(s));
      });
    }
    return l.map((d) => ({ ...d, _id: String(d.disposalId) }));
  }, [all, tab, q, assetById]);

  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        title="Disposal & Retirement"
        subtitle="Request → Approval → Disposal with method, value, buyer, disposal certificate and data-wiping certificate."
        actions={can('disposal', 'create') && <button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> New request</button>}
      />
      <div className="grid grid-kpi mb">
        <Kpi label="Awaiting approval" value={count('pending')} icon={<Clock size={19} />} toneName="amber" onClick={() => setTab('pending')} />
        <Kpi label="Approved · to dispose" value={count('approved')} icon={<Archive size={19} />} toneName="blue" onClick={() => setTab('approved')} />
        <Kpi label="Disposed" value={completed.length} icon={<Trash2 size={19} />} toneName="slate" onClick={() => setTab('completed')} />
        <Kpi label="Recovered value" value={money(completed.reduce((s, d) => s + (d.disposalValue || 0), 0), { compact: true })} icon={<Wallet size={19} />} toneName="green" />
      </div>
      <div className="card">
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { key: 'open', label: 'Open', count: count('pending') + count('approved') },
            { key: 'pending', label: 'Pending approval', count: count('pending') },
            { key: 'approved', label: 'Approved', count: count('approved') },
            { key: 'completed', label: 'Completed', count: count('completed') },
            { key: 'rejected', label: 'Rejected', count: count('rejected') },
            { key: 'all', label: 'All', count: all.length },
          ]}
        />
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Search requests, assets, buyers…" />
        </div>
        {loading && !data ? (
          <Loading />
        ) : (
          <DataTable
            rows={list}
            onRowClick={(d) => navigate(`/disposal/${d.disposalId}`)}
            initialSort={{ key: 'requestDate', dir: 'desc' }}
            empty={<Empty title="No disposal requests" />}
            columns={[
              { key: 'requestDate', label: 'Request', sortValue: (d) => d.requestDate, render: (d) => <div><div className="cell-main mono">{d.disposalRequestNumber}</div><div className="cell-sub">{date(d.requestDate)} · {names.user(d.requestedBy) || '—'}</div></div> },
              {
                key: 'asset',
                label: 'Asset',
                sortValue: (d) => assetById.get(d.assetId)?.assetCode,
                render: (d) => {
                  const a = assetById.get(d.assetId);
                  return <div><div className="small bold">{a?.assetName || `Asset #${d.assetId}`}</div><div className="cell-sub mono">{a?.assetCode}</div></div>;
                },
              },
              { key: 'retirementReason', label: 'Reason', render: (d) => <span className="small ellipsis" style={{ maxWidth: 220, display: 'inline-block' }}>{d.retirementReason}</span> },
              { key: 'method', label: 'Method', render: (d) => d.disposalMethod || d.requestedDisposalMethod || '—' },
              { key: 'purchaseCost', label: 'Cost', className: 'right', render: (d) => money(assetById.get(d.assetId)?.purchaseCost) },
              { key: 'disposalValue', label: 'Sale value', className: 'right', render: (d) => (disposalStage(d) === 'completed' ? money(d.disposalValue) : '—') },
              { key: 'approvalStatus', label: 'Status', render: (d) => <StatusBadge status={d.approvalStatus || 'Pending'} /> },
            ]}
          />
        )}
      </div>
      <DisposalModal open={open} onClose={() => setOpen(false)} onDone={(d) => (d?.disposalId ? navigate(`/disposal/${d.disposalId}`) : reload())} />
    </>
  );
}
