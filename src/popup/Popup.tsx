import React, { useEffect, useState } from 'react';
import { AuthModule } from '../lib/auth';

type State = 'loading' | 'needs-approval' | 'approved' | 'error';

const isAccessDenied = (msg: string) =>
  /not approve|access_denied|not granted|revoked|cancelled|OAuth2 not|authorization page/i.test(msg);

const S: Record<string, React.CSSProperties> = {
  root: {
    width: '320px',
    minHeight: '220px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    background: 'linear-gradient(160deg, #0f0f2e 0%, #1a1a4e 100%)',
    color: 'white',
    padding: '28px 24px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  icon: { fontSize: '36px', marginBottom: '10px' },
  title: { margin: '0 0 4px', fontSize: '18px', fontWeight: 800, letterSpacing: '-0.3px' },
  sub:   { margin: '0 0 20px', fontSize: '12px', color: 'rgba(255,255,255,0.45)', textAlign: 'center' },
  btn: {
    width: '100%', padding: '12px', border: 'none', borderRadius: '10px',
    fontWeight: 800, fontSize: '15px', cursor: 'pointer', marginBottom: '10px',
    transition: 'filter 0.15s, transform 0.12s',
  },
  approveBtn: {
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: 'white',
    boxShadow: '0 6px 20px rgba(99,102,241,0.4)',
  },
  dashBtn: {
    background: 'linear-gradient(135deg, #10b981, #059669)',
    color: 'white',
    boxShadow: '0 6px 20px rgba(16,185,129,0.35)',
  },
  errorBox: {
    width: '100%', padding: '10px 12px',
    background: 'rgba(239,68,68,0.15)',
    border: '1px solid rgba(239,68,68,0.35)',
    borderRadius: '8px',
    color: '#fca5a5',
    fontSize: '12px',
    marginBottom: '12px',
    textAlign: 'center' as const,
    lineHeight: '1.5',
  },
  steps: {
    width: '100%',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    padding: '12px 14px',
    marginTop: '4px',
    fontSize: '12px',
    color: 'rgba(255,255,255,0.6)',
    lineHeight: '1.7',
  },
  stepItem: { display: 'flex', gap: '8px', marginBottom: '6px' },
  stepNum: {
    width: '18px', height: '18px', borderRadius: '50%',
    background: 'rgba(99,102,241,0.5)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '10px', fontWeight: 800, flexShrink: 0, marginTop: '1px',
  },
  link: { color: '#818cf8', textDecoration: 'none' },
};

export const Popup: React.FC = () => {
  const [state,   setState]   = useState<State>('loading');
  const [errMsg,  setErrMsg]  = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => { checkToken(); }, []);

  const checkToken = () => {
    setState('loading');
    AuthModule.getToken(false)
      .then(() => setState('approved'))
      .catch((e: any) => {
        const msg = e?.message ?? '';
        setState(isAccessDenied(msg) ? 'needs-approval' : 'needs-approval');
        // Any failure means we need approval — always show the approve screen
      });
  };

  const handleApprove = async () => {
    setWorking(true);
    setErrMsg('');
    try {
      await AuthModule.getToken(true);
      setState('approved');
    } catch (e: any) {
      const msg = e?.message ?? 'Authorization failed.';
      setErrMsg(msg);
      // Stay on needs-approval so user can try again
    } finally {
      setWorking(false);
    }
  };

  const openDashboard = () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('src/options/index.html'));
    }
  };

  /* ── Loading ── */
  if (state === 'loading') {
    return (
      <div style={S.root}>
        <div style={S.icon}>📬</div>
        <h2 style={S.title}>Gmail Cleanup</h2>
        <p style={S.sub}>Checking access…</p>
        <div style={{ width: '32px', height: '32px', border: '3px solid rgba(255,255,255,0.15)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  /* ── Approved ── */
  if (state === 'approved') {
    return (
      <div style={S.root}>
        <div style={S.icon}>✅</div>
        <h2 style={S.title}>Gmail Cleanup</h2>
        <p style={S.sub}>Connected. Ready to clean your inbox.</p>
        <button
          style={{ ...S.btn, ...S.dashBtn }}
          onClick={openDashboard}
          onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
          onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
        >
          🧹 Open Dashboard
        </button>
        <button
          onClick={handleApprove}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: '11px', cursor: 'pointer', padding: '4px' }}
        >
          Switch account
        </button>
      </div>
    );
  }

  /* ── Needs Approval ── */
  return (
    <div style={S.root}>
      <div style={S.icon}>🔐</div>
      <h2 style={S.title}>Approve Gmail Access</h2>
      <p style={S.sub}>We need permission to read and manage your Gmail.</p>

      {errMsg && (
        <div style={S.errorBox}>
          {isAccessDenied(errMsg)
            ? '❌ Access was denied. Click below and approve all permissions when prompted.'
            : `⚠ ${errMsg}`}
        </div>
      )}

      <button
        style={{ ...S.btn, ...S.approveBtn, opacity: working ? 0.7 : 1 }}
        onClick={handleApprove}
        disabled={working}
        onMouseEnter={e => { if (!working) e.currentTarget.style.filter = 'brightness(1.12)'; }}
        onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
      >
        {working ? '⏳ Waiting for approval…' : '🔑 Approve Access'}
      </button>

      {/* Step-by-step hint */}
      <div style={S.steps}>
        {[
          'Click "Approve Access" above.',
          'A Google sign-in window will open — choose your account.',
          <>Click <strong style={{ color: 'white' }}>Allow</strong> on every permission screen.</>,
          'Come back here — the button will turn green.',
        ].map((text, i) => (
          <div key={i} style={S.stepItem}>
            <span style={S.stepNum}>{i + 1}</span>
            <span>{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
