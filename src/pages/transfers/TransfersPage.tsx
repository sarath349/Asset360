import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight, MapPin, Plus, Undo2, UserCheck } from 'lucide-react';
import { ApiAsset, assetApi, AssignmentAction, assignmentApi } from '../../api/assetApi';
import { useFetch } from '../../lib/hooks';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { useNames } from '../../context/DataContext';
import { ErrorState, Kpi, Loading, PageHeader, SearchInput, Tabs } from '../../components/ui';
import { AssignmentModal } from '../../components/assetModals';
import { AssignmentTable } from '../../components/AssignmentTable';

const kind = (type: string | null) => {
  const t = (type || '').toLowerCase();
  if (t.includes('location')) return 'location';
  if (t.includes('return')) return 'return';
  if (t.includes('transfer')) return 'transfer';
  return 'assign';
};

export default function TransfersPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const names = useNames();
  const { inScope } = useBranch();
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [modal, setModal] = useState<AssignmentAction | null>(null);
  const { data, loading, error, reload } = useFetch(() => Promise.all([assignmentApi.list(), assetApi.list().catch(() => [] as ApiAsset[])]), []);
  const [rawList, assets] = data || [[], []];
  const assetById = useMemo(() => new Map(assets.map((a) => [a.assetId, a])), [assets]);
  const list = useMemo(
    () => rawList.filter((t) => inScope(assetById.get(t.assetId)?.locationId) || inScope(t.toLocationId) || inScope(t.fromLocationId)),
    [rawList, assetById, inScope]
  );

  const count = (k: string) => list.filter((t) => kind(t.transactionType) === k).length;
  const rows = useMemo(() => {
    let l = tab === 'all' ? list : list.filter((t) => kind(t.transactionType) === tab);
    if (q) {
      const s = q.toLowerCase();
      l = l.filter((t) => {
        const a = assetById.get(t.assetId);
        return [a?.assetCode, a?.assetName, names.employee(t.toEmployeeId), names.employee(t.fromEmployeeId), names.location(t.toLocationId), t.transactionType].some((v) => v?.toLowerCase().includes(s));
      });
    }
    return l;
  }, [list, tab, q, assetById, names]);

  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        title="Assignment & Transfer"
        subtitle="Assign, move and return assets with a complete custody history"
        actions={can('transfers', 'create') && <button className="btn btn-primary" onClick={() => setModal('assign')}><Plus size={16} /> New assignment / transfer</button>}
      />
      <div className="grid grid-kpi mb">
        <Kpi label="Assignments" value={count('assign')} icon={<UserCheck size={19} />} onClick={() => setTab('assign')} />
        <Kpi label="Employee transfers" value={count('transfer')} icon={<ArrowLeftRight size={19} />} toneName="cyan" onClick={() => setTab('transfer')} />
        <Kpi label="Location moves" value={count('location')} icon={<MapPin size={19} />} toneName="purple" onClick={() => setTab('location')} />
        <Kpi label="Returns" value={count('return')} icon={<Undo2 size={19} />} toneName="slate" onClick={() => setTab('return')} />
      </div>
      <div className="card">
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { key: 'all', label: 'All', count: list.length },
            { key: 'assign', label: 'Assignments', count: count('assign') },
            { key: 'transfer', label: 'Transfers', count: count('transfer') },
            { key: 'location', label: 'Location moves', count: count('location') },
            { key: 'return', label: 'Returns', count: count('return') },
          ]}
        />
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Search asset, employee or location…" />
          <div className="spacer" />
          {can('transfers', 'create') && (
            <>
              <button className="btn btn-sm" onClick={() => setModal('location-transfer')}><MapPin size={14} /> Move location</button>
              <button className="btn btn-sm" onClick={() => setModal('return')}><Undo2 size={14} /> Return</button>
            </>
          )}
        </div>
        {loading && !data ? (
          <Loading />
        ) : (
          <AssignmentTable
            rows={rows}
            onRowClick={(t) => navigate(`/assets/${t.assetId}?tab=custody`)}
            showAsset={(id) => {
              const a = assetById.get(id);
              return (
                <div>
                  <div className="cell-main">{a?.assetName || `Asset #${id}`}</div>
                  <div className="cell-sub mono">{a?.assetCode}</div>
                </div>
              );
            }}
          />
        )}
      </div>
      <AssignmentModal open={modal !== null} defaultAction={modal || undefined} onClose={() => setModal(null)} onDone={reload} />
    </>
  );
}
