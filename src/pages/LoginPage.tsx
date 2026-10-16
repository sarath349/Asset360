import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Boxes, ClipboardCheck, GitBranch, QrCode, ShieldCheck, TrendingDown, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={location.state?.from || '/'} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(username.trim(), password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-art">
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-logo">
            <Boxes size={19} color="#fff" />
          </div>
          <div className="brand-name">AssetPro</div>
        </div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1>Every asset. Every location. Every lifecycle stage.</h1>
          <p className="mt">
            Register, tag, assign, audit, maintain and dispose of assets across all your sites — with complete history, AMC tracking and
            finance-ready depreciation.
          </p>
        </div>
        <div className="login-features">
          <div className="login-feature"><QrCode size={18} /> QR & barcode labels, RFID tags</div>
          <div className="login-feature"><ClipboardCheck size={18} /> Physical audit campaigns</div>
          <div className="login-feature"><GitBranch size={18} /> Full lifecycle history</div>
          <div className="login-feature"><TrendingDown size={18} /> Depreciation & book value</div>
          <div className="login-feature"><ShieldCheck size={18} /> Role based access</div>
          <div className="login-feature"><Boxes size={18} /> AMC & warranty tracking</div>
        </div>
      </div>
      <div className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <h2 style={{ fontSize: 26, fontWeight: 800 }}>Welcome back</h2>
          <p className="muted" style={{ marginTop: 6 }}>
            Sign in to your AssetPro workspace
          </p>
          <div className="stack mt">
            <div className="field">
              <label>Username</label>
              <input className="input" style={{ height: 44 }} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
            </div>
            <div className="field">
              <label>Password</label>
              <input className="input" style={{ height: 44 }} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </div>
            {error && <div className="alert alert-danger">{error}</div>}
            <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {busy ? <Loader2 size={18} className="spin" style={{ animation: 'spin 0.8s linear infinite' }} /> : null}
              Sign in
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
