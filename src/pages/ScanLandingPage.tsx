import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import { ApiAsset } from '../api/assetApi';
import { findAsset } from '../lib/assetLookup';
import { Empty, Loading } from '../components/ui';

/** Where a printed QR label lands (…/scan/<asset code>): resolves the asset and opens it for this device. */
export default function ScanLandingPage() {
  const { code = '' } = useParams();
  const [state, setState] = useState<{ asset: ApiAsset | null } | { error: string } | null>(null);

  useEffect(() => {
    let live = true;
    setState(null);
    findAsset(decodeURIComponent(code))
      .then((asset) => live && setState({ asset }))
      .catch((err) => live && setState({ error: err.message }));
    return () => {
      live = false;
    };
  }, [code]);

  if (!state) return <Loading />;
  if ('error' in state) return <Empty title="Could not look up the asset" message={state.error} />;
  if (state.asset) {
    const phone = window.matchMedia('(max-width: 720px)').matches;
    return <Navigate to={phone ? `/m/asset/${state.asset.assetId}` : `/assets/${state.asset.assetId}`} replace />;
  }
  return (
    <Empty
      icon={<SearchX size={24} />}
      title="No asset matches this code"
      message={<>Nothing in the register matches <b className="mono">{decodeURIComponent(code)}</b>.</>}
      action={<Link className="btn btn-sm" to={`/assets?q=${encodeURIComponent(code)}`}>Search the register</Link>}
    />
  );
}
