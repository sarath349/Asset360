import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PackagePlus, Plus } from 'lucide-react';
import { ApiReceipt, receiptApi } from '../../api/assetApi';
import { useFetch } from '../../lib/hooks';
import { date } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { useNames } from '../../context/DataContext';
import { DataTable, Empty, ErrorState, Kpi, Loading, PageHeader, SearchInput, StatusBadge, Tabs } from '../../components/ui';
import { NewReceiptModal } from './ReceiptDetailPage';

export function receiptStage(r: Pick<ApiReceipt, 'approvalStatus'>) {
  const s = (r.approvalStatus || '').toLowerCase();
  if (s.includes('reject')) return 'rejected';
  if (s.includes('post')) return 'posted';
  if (s.includes('approve')) return 'approved';
  return 'pending';
}

export default function ReceiptsPage() {
  const { can } = useAuth();
  const names = useNames();
  const { inScope } = useBranch();
  const navigate = useNavigate();
  const [tab, setTab] = useState('open');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const { data, loading, error, reload } = useFetch(() => receiptApi.list(), []);

  const all = useMemo(() => (data || []).filter((r) => !r.locationId || inScope(r.locationId)), [data, inScope]);
  const count = (stage: string) => all.filter((r) => receiptStage(r) === stage).length;

  const list = useMemo(() => {
    let l = all;
    if (tab === 'open') l = l.filter((r) => ['pending', 'approved'].includes(receiptStage(r)));
    else if (tab !== 'all') l = l.filter((r) => receiptStage(r) === tab);
    if (q) {
      const s = q.toLowerCase();
      l = l.filter((r) => [r.receiptNumber, r.vendorName, r.poNumber, r.remarks].some((x) => x?.toLowerCase().includes(s)));
    }
    return l.map((r) => ({ ...r, _id: String(r.receiptId) }));
  }, [all, tab, q]);

  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        title="Receipt"
        subtitle="Goods-in / asset intake. Approve a receipt, then post it to create assets in the register."
        actions={can('procurement', 'create') && <button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> New receipt</button>}
      />
      <div className="grid grid-kpi mb">
        <Kpi label="Pending" value={count('pending')} icon={<PackagePlus size={19} />} toneName="amber" onClick={() => setTab('pending')} />
        <Kpi label="Approved" value={count('approved')} icon={<PackagePlus size={19} />} toneName="blue" onClick={() => setTab('approved')} />
        <Kpi label="Posted" value={count('posted')} icon={<PackagePlus size={19} />} toneName="green" onClick={() => setTab('posted')} />
        <Kpi label="All" value={all.length} icon={<PackagePlus size={19} />} />
      </div>
      <div className="card">
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { key: 'open', label: 'Open', count: count('pending') + count('approved') },
            { key: 'pending', label: 'Pending', count: count('pending') },
            { key: 'approved', label: 'Approved', count: count('approved') },
            { key: 'posted', label: 'Posted', count: count('posted') },
            { key: 'rejected', label: 'Rejected', count: count('rejected') },
            { key: 'all', label: 'All', count: all.length },
          ]}
        />
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Search receipts, vendors, PO…" />
        </div>
        {loading && !data ? (
          <Loading />
        ) : (
          <DataTable
            rows={list}
            onRowClick={(r) => navigate(`/receipts/${r.receiptId}`)}
            initialSort={{ key: 'receiptDate', dir: 'desc' }}
            empty={<Empty title="No receipts yet" />}
            columns={[
              {
                key: 'receiptNumber',
                label: 'Receipt',
                render: (r: ApiReceipt) => (
                  <div>
                    <div className="cell-main mono">{r.receiptNumber}</div>
                    <div className="cell-sub">{date(r.receiptDate)} · {names.user(r.receivedBy) || '—'}</div>
                  </div>
                ),
              },
              { key: 'vendorName', label: 'Vendor', render: (r: ApiReceipt) => r.vendorName || '—' },
              { key: 'poNumber', label: 'PO', render: (r: ApiReceipt) => r.poNumber || '—' },
              { key: 'lines', label: 'Lines', className: 'right', render: (r: ApiReceipt) => r.lines?.length || 0 },
              { key: 'assets', label: 'Assets', className: 'right', render: (r: ApiReceipt) => r.postedAssetIds?.length || '—' },
              { key: 'approvalStatus', label: 'Status', render: (r: ApiReceipt) => <StatusBadge status={r.approvalStatus || 'Pending'} /> },
            ]}
          />
        )}
      </div>
      <NewReceiptModal open={open} onClose={() => setOpen(false)} onDone={(id) => (id ? navigate(`/receipts/${id}`) : reload())} />
    </>
  );
}
