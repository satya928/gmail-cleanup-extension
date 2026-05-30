import React, { useEffect, useRef, useState } from 'react';
import './options.css';
import { AuthModule } from '../lib/auth';
import { GmailApi } from '../lib/gmail/api';
import { GroupingEngine } from '../lib/grouping/engine';
import { ActionsEngine } from '../lib/rules/engine';
import { categorizeGroups, CATEGORIES } from '../lib/categorization/engine';
import { AccountInfo, SenderGroup } from '../types';

/* ─── constants ────────────────────────────────────────────────────────────── */
const ACCOUNT_COLORS = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6'];
const SCAN_LABELS    = ['INBOX','CATEGORY_PROMOTIONS','CATEGORY_SOCIAL'];
type Phase = 'loading-accounts' | 'pick-accounts' | 'scanning' | 'done' | 'error';

interface AccountCtx {
  account: AccountInfo;
  api: GmailApi;
  engine: ActionsEngine;
  color: string;
}

/* ─── helpers ──────────────────────────────────────────────────────────────── */
const initials = (email: string) =>
  email.includes('@') ? email[0].toUpperCase() : '?';

const acctColor = (email: string, accounts: AccountInfo[]) => {
  const idx = accounts.findIndex(a => a.email === email);
  return ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length] ?? '#6366f1';
};

/* ─── component ────────────────────────────────────────────────────────────── */
export const Options: React.FC = () => {
  const [phase,           setPhase]          = useState<Phase>('loading-accounts');
  const [accounts,        setAccounts]       = useState<AccountInfo[]>([]);
  const [selectedIds,     setSelectedIds]    = useState<Set<string>>(new Set());
  const [ctxMap,          setCtxMap]         = useState<Map<string, AccountCtx>>(new Map());
  const [groups,          setGroups]         = useState<SenderGroup[]>([]);
  const [error,           setError]          = useState<string|null>(null);
  const [selectedEmails,  setSelectedEmails] = useState<Set<string>>(new Set());
  const [dismissing,      setDismissing]     = useState<Set<string>>(new Set());
  const [cleanedCount,    setCleanedCount]   = useState(0);
  const [logs,            setLogs]           = useState<string[]>([]);
  const [showLogs,        setShowLogs]       = useState(false);
  const [skipped,         setSkipped]        = useState(0);
  const [filterAccount,   setFilterAccount]  = useState<string>('all');
  const [filterCategory,  setFilterCategory] = useState<string>('all');

  // scan progress
  const [scanningAcct, setScanningAcct] = useState('');
  const [totalFound,   setTotalFound]   = useState(0);
  const [scanned,      setScanned]      = useState(0);
  const [speed,        setSpeed]        = useState(0);  // msgs/sec
  const [eta,          setEta]          = useState(0);  // seconds remaining
  const [liveGroups,   setLiveGroups]   = useState<SenderGroup[]>([]); // partial preview

  const logsEndRef    = useRef<HTMLDivElement>(null);
  const scanCountRef  = useRef(0);   // latest scanned count (no closure stale issue)
  const scanTotalRef  = useRef(0);
  const scanStartRef  = useRef(0);   // timestamp when fetching started

  const [addingAccount,       setAddingAccount]       = useState(false);
  const [redirectUriError,    setRedirectUriError]    = useState<string|null>(null);
  const [protectedSenders,    setProtectedSenders]    = useState<Set<string>>(new Set());
  const [protectedCategories, setProtectedCategories] = useState<Set<string>>(new Set());
  const [showProtected,       setShowProtected]       = useState(false);

  /* ── load accounts + protected list on mount ── */
  useEffect(() => {
    chrome.storage.local.get(['gcProtectedSenders', 'gcProtectedCategories'], (r) => {
      if (r.gcProtectedSenders)    setProtectedSenders(new Set(r.gcProtectedSenders));
      if (r.gcProtectedCategories) setProtectedCategories(new Set(r.gcProtectedCategories));
    });
    loadAccounts();
  }, []);

  const [needsApproval,   setNeedsApproval]   = useState(false);
  const [approvingAccess, setApprovingAccess] = useState(false);

  const handleApproveAccess = async () => {
    setApprovingAccess(true);
    setError(null);
    try {
      await AuthModule.getToken(true);
      setNeedsApproval(false);
      await loadAccounts();
    } catch (e: any) {
      setError(e.message ?? 'Approval failed. Please try again.');
    } finally {
      setApprovingAccess(false);
    }
  };

  const loadAccounts = async () => {
    setPhase('loading-accounts');
    setNeedsApproval(false);
    try {
      await AuthModule.getToken(false);
      const accts = await AuthModule.getAccounts();
      setAccounts(accts);
      setSelectedIds(new Set(accts.map(a => a.id)));
      setPhase('pick-accounts');
    } catch (e: any) {
      setNeedsApproval(true);
      setPhase('pick-accounts');
    }
  };

  const handleAddAccount = async () => {
    setAddingAccount(true);
    setRedirectUriError(null);
    try {
      const newAcct = await AuthModule.authorizeNewAccount();
      // Avoid duplicates
      if (!accounts.find(a => a.email === newAcct.email)) {
        const updated = [...accounts, newAcct];
        setAccounts(updated);
        setSelectedIds(prev => new Set([...prev, newAcct.id]));
      }
    } catch (e: any) {
      const msg: string = e.message ?? 'Failed to add account.';
      if (msg.startsWith('REDIRECT_URI_MISMATCH::')) {
        setRedirectUriError(msg.replace('REDIRECT_URI_MISMATCH::', '').trim());
      } else {
        setError(msg);
      }
    } finally {
      setAddingAccount(false);
    }
  };

  /* ── logging ── */
  const addLog = (msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-299), `[${ts}] ${msg}`]);
    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 40);
  };

  /* ── build context map for selected accounts ── */
  const buildContexts = async (): Promise<Map<string, AccountCtx>> => {
    const map = new Map<string, AccountCtx>();
    for (const acct of accounts.filter(a => selectedIds.has(a.id))) {
      addLog(`Getting token for ${acct.email}...`);
      const token  = await AuthModule.getTokenForAccount(acct, true);
      const api    = new GmailApi(token);
      const engine = new ActionsEngine(api);
      map.set(acct.id, { account: acct, api, engine, color: ACCOUNT_COLORS[map.size % ACCOUNT_COLORS.length] });
    }
    return map;
  };

  /* ── concurrency pool: N workers drain a shared queue ── */
  const fetchWithPool = async (
    refs: { id: string }[],
    api: GmailApi,
    concurrency: number,
    accountEmail: string,
    baseCount: number,
    onData: (msgs: any[]) => void,
  ): Promise<{ data: any[]; skipped: number }> => {
    const queue   = [...refs];
    const data: any[]  = [];
    let   skipped = 0;
    let   paused  = false;

    const worker = async () => {
      while (queue.length > 0) {
        if (paused) { await new Promise(r => setTimeout(r, 150)); continue; }
        const ref = queue.shift();
        if (!ref) break;
        try {
          const msg = await api.getMessageMetadata(ref.id);
          data.push(msg);
        } catch (e: any) {
          if ((e.message ?? '').includes('429')) {
            queue.unshift(ref);          // put back
            if (!paused) {
              paused = true;
              addLog(`  [${accountEmail}] Rate limited — pausing 4s...`);
              await new Promise(r => setTimeout(r, 4000));
              paused = false;
            }
            continue;
          }
          skipped++;
        }

        // Update progress counters
        const done = baseCount + data.length;
        scanCountRef.current = done;
        const elapsed = (Date.now() - scanStartRef.current) / 1000;
        const mps     = elapsed > 1 ? Math.round(done / elapsed) : 0;
        const rem     = mps > 0 ? Math.round((scanTotalRef.current - done) / mps) : 0;
        setScanned(done);
        setSpeed(mps);
        setEta(rem);
      }
    };

    // Periodic live-groups preview every 1.5s
    const liveTimer = setInterval(() => {
      if (data.length > 50) {
        const partial = GroupingEngine.processMessages([...data]);
        const sorted  = categorizeGroups(Object.values(partial)).sort((a, b) => b.messageCount - a.messageCount);
        setLiveGroups(sorted.slice(0, 12));
      }
    }, 1500);

    await Promise.all(Array.from({ length: concurrency }, worker));
    clearInterval(liveTimer);
    onData(data);
    return { data, skipped };
  };

  /* ── scan one account ── */
  const scanAccount = async (ctx: AccountCtx, baseCount: number, onData: (msgs: any[]) => void) => {
    const { api, account } = ctx;
    const seenIds = new Set<string>();
    const refs: { id: string; threadId: string }[] = [];

    for (const label of SCAN_LABELS) {
      setScanningAcct(ctx.account.email + ' · ' + label.replace('CATEGORY_', ''));
      addLog(`  [${account.email}] Listing ${label}...`);
      let pageToken: string | undefined, page = 1;
      while (true) {
        try {
          const res = await api.listMessages([label], 500, pageToken);
          if (!res?.messages) break;
          for (const m of res.messages) {
            if (!seenIds.has(m.id)) { seenIds.add(m.id); refs.push(m); }
          }
          const newTotal = baseCount + refs.length;
          setTotalFound(newTotal);
          scanTotalRef.current = newTotal;
          addLog(`  [${account.email}] ${label} p${page}: +${res.messages.length} (${refs.length} unique)`);
          pageToken = res.nextPageToken; page++;
          if (!pageToken) break;
        } catch (e: any) { addLog(`  [${account.email}] ERROR ${label}: ${e.message}`); break; }
      }
    }

    addLog(`  [${account.email}] Fetching ${refs.length} messages with 50 parallel workers...`);
    const { data, skipped } = await fetchWithPool(refs, api, 50, account.email, baseCount, onData);
    setSkipped(s => s + skipped);
    addLog(`  [${account.email}] ✓ ${data.length} fetched, ${skipped} skipped`);
    return data;
  };

  /* ── run full scan ── */
  const runScan = async () => {
    setPhase('scanning');
    setError(null);
    setGroups([]);
    setLiveGroups([]);
    setSelectedEmails(new Set());
    setDismissing(new Set());
    setTotalFound(0);
    setScanned(0);
    setSkipped(0);
    setSpeed(0);
    setEta(0);
    setLogs([]);
    setCleanedCount(0);
    scanCountRef.current = 0;
    scanTotalRef.current = 0;
    scanStartRef.current = Date.now();

    try {
      const contexts = await buildContexts();
      setCtxMap(contexts);

      const allGroups: SenderGroup[] = [];
      let totalFetched = 0;

      for (const ctx of Array.from(contexts.values())) {
        setScanningAcct(ctx.account.email);
        addLog(`\n── Scanning ${ctx.account.email} ──`);

        const msgs = await scanAccount(ctx, totalFetched, (data) => {
          // Incremental group update after each account completes
          const grouped = GroupingEngine.processMessages(data);
          for (const g of Object.values(grouped)) {
            if (!allGroups.find(x => x.senderEmail === g.senderEmail && x.accountEmail === ctx.account.email)) {
              allGroups.push({ ...g, accountEmail: ctx.account.email });
            }
          }
        });
        totalFetched += msgs.length;
      }

      const categorized = categorizeGroups(allGroups);
      const sorted = categorized.sort((a, b) => b.messageCount - a.messageCount);
      addLog(`\n─── Total: ${sorted.length} unique sender×account pairs ───`);
      setLiveGroups([]);
      setGroups(sorted);
      setPhase('done');
    } catch (e: any) {
      addLog(`FATAL: ${e.message}`);
      setError(e.message ?? 'Unknown error');
      setPhase('error');
    }
  };

  /* ── actions ── */
  const dismiss = (senderEmail: string, accountEmail: string, count: number) => {
    const key = `${senderEmail}::${accountEmail}`;
    setDismissing(prev => new Set(prev).add(key));
    setTimeout(() => {
      setGroups(prev => prev.filter(g => !(g.senderEmail === senderEmail && g.accountEmail === accountEmail)));
      setDismissing(prev => { const n = new Set(prev); n.delete(key); return n; });
      setCleanedCount(c => c + count);
    }, 400);
  };

  const getEngine = (accountEmail?: string): ActionsEngine | null => {
    const ctx = Array.from(ctxMap.values()).find(c => c.account.email === accountEmail);
    return ctx?.engine ?? null;
  };

  const handleAction = async (g: SenderGroup, action: 'archive' | 'trash') => {
    const engine = getEngine(g.accountEmail);
    if (!engine) return;
    try {
      if (action === 'archive') await engine.archiveGroup(g);
      else                      await engine.trashGroup(g);
      dismiss(g.senderEmail, g.accountEmail!, g.messageCount);
    } catch (e: any) { setError(e.message); }
  };

  const handleBulkAction = async (action: 'archive' | 'trash') => {
    const selected = groups.filter(g => selectedEmails.has(`${g.senderEmail}::${g.accountEmail}`));
    for (const g of selected) {
      const engine = getEngine(g.accountEmail);
      if (!engine) continue;
      try {
        if (action === 'archive') await engine.archiveGroup(g);
        else                      await engine.trashGroup(g);
        dismiss(g.senderEmail, g.accountEmail!, g.messageCount);
      } catch (e: any) { setError(e.message); }
    }
    setSelectedEmails(new Set());
  };

  const toggleSelect = (g: SenderGroup) => {
    const key = `${g.senderEmail}::${g.accountEmail}`;
    setSelectedEmails(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };

  const toggleSelectAll = () => {
    const visible = visibleGroups;
    const allKeys = new Set(visible.map(g => `${g.senderEmail}::${g.accountEmail}`));
    const allSelected = visible.every(g => selectedEmails.has(`${g.senderEmail}::${g.accountEmail}`));
    setSelectedEmails(allSelected ? new Set() : allKeys);
  };

  /* ── protect / unprotect ── */
  const toggleProtectSender = (g: SenderGroup) => {
    const key = `${g.senderEmail}::${g.accountEmail}`;
    setProtectedSenders(prev => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      chrome.storage.local.set({ gcProtectedSenders: [...n] });
      return n;
    });
    // Deselect if protecting
    setSelectedEmails(prev => { const n = new Set(prev); n.delete(key); return n; });
  };

  const toggleProtectCategory = (catId: string) => {
    setProtectedCategories(prev => {
      const n = new Set(prev);
      n.has(catId) ? n.delete(catId) : n.add(catId);
      chrome.storage.local.set({ gcProtectedCategories: [...n] });
      return n;
    });
  };

  /* ── derived ── */
  const accountFiltered = filterAccount === 'all' ? groups : groups.filter(g => g.accountEmail === filterAccount);
  const filteredGroups  = filterCategory === 'all' ? accountFiltered : accountFiltered.filter(g => g.category === filterCategory);

  // Split into visible (cleanable) vs protected
  const isProtected = (g: SenderGroup) =>
    protectedSenders.has(`${g.senderEmail}::${g.accountEmail}`) ||
    protectedCategories.has(g.category ?? 'other');
  const visibleGroups   = filteredGroups.filter(g => !isProtected(g));
  const protectedGroups = filteredGroups.filter(g =>  isProtected(g));

  // Build category counts from account-filtered groups
  const categoryCounts = accountFiltered.reduce<Record<string, number>>((acc, g) => {
    const cat = g.category ?? 'other';
    acc[cat] = (acc[cat] ?? 0) + 1;
    return acc;
  }, {});
  const activeCategories = Object.entries(categoryCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
  const totalEmails     = visibleGroups.reduce((s, g) => s + g.messageCount, 0);
  const junkCount       = visibleGroups.filter(g => g.suspectedSubscriptionScore >= 5).length;
  const selectedTotal   = visibleGroups.filter(g => selectedEmails.has(`${g.senderEmail}::${g.accountEmail}`)).reduce((s, g) => s + g.messageCount, 0);
  const selectedCount   = visibleGroups.filter(g => selectedEmails.has(`${g.senderEmail}::${g.accountEmail}`)).length;
  const pct             = totalFound > 0 ? Math.round((scanned / totalFound) * 100) : 0;
  const scanningAcctColor = acctColor(scanningAcct, accounts);

  /* ════════════════════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════════════════ */

  /* ── NEEDS APPROVAL ── */
  if (needsApproval) {
    return (
      <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#0f0f2e,#1a1a4e)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'system-ui,sans-serif' }}>
        <div style={{ textAlign:'center', padding:'48px 40px', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'20px', maxWidth:'420px', width:'100%', animation:'fade-in 0.3s ease' }}>
          <div style={{ fontSize:'52px', marginBottom:'16px' }}>🔐</div>
          <h2 style={{ margin:'0 0 8px', color:'white', fontSize:'22px', fontWeight:800 }}>Approve Gmail Access</h2>
          <p style={{ color:'rgba(255,255,255,0.5)', margin:'0 0 24px', fontSize:'14px', lineHeight:'1.6' }}>
            Gmail Cleanup needs permission to read and manage your inbox.<br/>
            Click below and approve all permissions when prompted.
          </p>

          {error && (
            <div style={{ padding:'10px 14px', background:'rgba(239,68,68,0.15)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:'8px', color:'#fca5a5', fontSize:'13px', marginBottom:'16px', lineHeight:'1.5' }}>
              ⚠ {error}
            </div>
          )}

          <button
            onClick={handleApproveAccess}
            disabled={approvingAccess}
            style={{ width:'100%', padding:'14px', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'white', border:'none', borderRadius:'12px', fontWeight:800, fontSize:'16px', cursor: approvingAccess ? 'not-allowed' : 'pointer', opacity: approvingAccess ? 0.7 : 1, boxShadow:'0 6px 20px rgba(99,102,241,0.4)', marginBottom:'24px', transition:'filter 0.15s' }}
          >
            {approvingAccess ? '⏳ Waiting for approval…' : '🔑 Approve Access'}
          </button>

          <div style={{ textAlign:'left', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'10px', padding:'14px 16px' }}>
            {[
              'Click "Approve Access" above.',
              'A Google sign-in window will open — choose your account.',
              'Click Allow on every permission screen.',
              'The account picker will open automatically.',
            ].map((s, i) => (
              <div key={i} style={{ display:'flex', gap:'10px', marginBottom: i < 3 ? '10px' : 0, fontSize:'13px', color:'rgba(255,255,255,0.55)', alignItems:'flex-start' }}>
                <span style={{ width:'20px', height:'20px', borderRadius:'50%', background:'rgba(99,102,241,0.5)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'10px', fontWeight:800, color:'white', flexShrink:0, marginTop:'1px' }}>{i+1}</span>
                <span>{s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* loading */
  if (phase === 'loading-accounts') {
    return (
      <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#0f0f2e,#1a1a4e)', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontFamily:'system-ui,sans-serif' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:'48px', marginBottom:'16px' }}>📬</div>
          <div style={{ color:'rgba(255,255,255,0.6)' }}>Loading your accounts…</div>
        </div>
      </div>
    );
  }

  /* ── ACCOUNT PICKER ── */
  if (phase === 'pick-accounts') {
    const toggleAcct = (id: string) =>
      setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

    return (
      <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#0f0f2e 0%,#1a1a4e 60%,#0d1b3e 100%)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', fontFamily:'system-ui,sans-serif', padding:'40px' }}>
        <div style={{ animation:'fade-in 0.4s ease', maxWidth:'560px', width:'100%' }}>
          <div style={{ textAlign:'center', marginBottom:'36px' }}>
            <div style={{ fontSize:'56px', marginBottom:'12px' }}>📬</div>
            <h1 style={{ color:'white', margin:'0 0 8px', fontSize:'28px', fontWeight:800, letterSpacing:'-0.5px' }}>Gmail Cleanup</h1>
            <p style={{ color:'rgba(255,255,255,0.5)', margin:0, fontSize:'15px' }}>
              Select the accounts you want to scan and clean
            </p>
          </div>

          {error && (
            <div style={{ background:'rgba(239,68,68,0.15)', border:'1px solid rgba(239,68,68,0.4)', borderRadius:'10px', padding:'12px 16px', color:'#fca5a5', marginBottom:'20px', fontSize:'14px' }}>
              ⚠ {error}
            </div>
          )}

          {/* Account cards */}
          <div style={{ display:'flex', flexDirection:'column', gap:'12px', marginBottom:'32px' }}>
            {accounts.length === 0 && (
              <div style={{ color:'rgba(255,255,255,0.4)', textAlign:'center', padding:'24px', border:'1px dashed rgba(255,255,255,0.15)', borderRadius:'12px' }}>
                No Google accounts detected. Make sure you're signed into Chrome.
              </div>
            )}
            {accounts.map((acct, i) => {
              const color    = ACCOUNT_COLORS[i % ACCOUNT_COLORS.length];
              const selected = selectedIds.has(acct.id);
              return (
                <div
                  key={acct.id}
                  className="acct-card"
                  onClick={() => toggleAcct(acct.id)}
                  style={{
                    display:'flex', alignItems:'center', gap:'16px',
                    background: selected ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.05)',
                    border: `2px solid ${selected ? color : 'rgba(255,255,255,0.1)'}`,
                    borderRadius:'14px', padding:'16px 20px',
                    userSelect:'none',
                  }}
                >
                  {/* Avatar */}
                  <div style={{ width:'44px', height:'44px', borderRadius:'50%', background: `linear-gradient(135deg,${color},${color}99)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', fontWeight:800, color:'white', flexShrink:0, boxShadow:`0 4px 14px ${color}55` }}>
                    {initials(acct.email)}
                  </div>
                  {/* Info */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ color:'white', fontWeight:700, fontSize:'15px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{acct.email}</div>
                    <div style={{ color:'rgba(255,255,255,0.4)', fontSize:'12px', marginTop:'2px' }}>Google Account</div>
                  </div>
                  {/* Checkbox */}
                  <div style={{ width:'22px', height:'22px', borderRadius:'6px', border:`2px solid ${selected ? color : 'rgba(255,255,255,0.25)'}`, background: selected ? color : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.15s' }}>
                    {selected && <span style={{ color:'white', fontSize:'13px', fontWeight:900 }}>✓</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add account */}
          <button onClick={handleAddAccount} disabled={addingAccount} className="add-acct-btn">
            {addingAccount ? '⏳ Authorizing…' : '+ Add another Google account'}
          </button>

          {/* Redirect URI fix dialog */}
          {redirectUriError && (
            <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.35)', borderRadius:'14px', padding:'18px 20px', marginTop:'4px' }}>
              <div style={{ fontWeight:800, color:'#fca5a5', fontSize:'14px', marginBottom:'10px' }}>
                🔧 One-time setup required
              </div>
              <div style={{ color:'rgba(255,255,255,0.75)', fontSize:'12.5px', lineHeight:'1.7', marginBottom:'14px' }}>
                Google blocked the sign-in because this extension's redirect URL isn't registered yet. It's a one-time fix in Google Cloud Console:
              </div>
              {[
                <>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" style={{ color:'#818cf8' }}>Google Cloud Console → Credentials</a></>,
                <>Click your <strong style={{ color:'white' }}>OAuth 2.0 Client ID</strong> (Web application or Chrome app)</>,
                <>Under <strong style={{ color:'white' }}>Authorized redirect URIs</strong>, click <strong style={{ color:'white' }}>+ Add URI</strong></>,
                <>Paste the URI below and click <strong style={{ color:'white' }}>Save</strong></>,
              ].map((step, i) => (
                <div key={i} style={{ display:'flex', gap:'10px', marginBottom:'8px', fontSize:'12.5px', color:'rgba(255,255,255,0.7)' }}>
                  <span style={{ width:'20px', height:'20px', borderRadius:'50%', background:'rgba(99,102,241,0.6)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:800, flexShrink:0, marginTop:'1px' }}>{i+1}</span>
                  <span>{step}</span>
                </div>
              ))}
              {/* Copyable URI */}
              <div style={{ background:'rgba(0,0,0,0.35)', borderRadius:'8px', padding:'10px 14px', marginTop:'10px', display:'flex', alignItems:'center', gap:'10px' }}>
                <code style={{ fontSize:'12px', color:'#a5f3fc', flex:1, wordBreak:'break-all' }}>{redirectUriError}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(redirectUriError!); }}
                  style={{ background:'rgba(99,102,241,0.7)', border:'none', borderRadius:'6px', color:'white', padding:'5px 10px', fontSize:'11px', cursor:'pointer', flexShrink:0, fontWeight:700 }}
                >
                  Copy
                </button>
              </div>
              <div style={{ color:'rgba(255,255,255,0.4)', fontSize:'11px', marginTop:'10px' }}>
                After saving in Google Cloud Console, come back and click "+ Add another Google account" again.
              </div>
              <button onClick={() => setRedirectUriError(null)} style={{ marginTop:'10px', background:'none', border:'none', color:'rgba(255,255,255,0.3)', fontSize:'11px', cursor:'pointer' }}>Dismiss</button>
            </div>
          )}

          {/* CTA */}
          <button
            className="pill-btn"
            disabled={selectedIds.size === 0}
            onClick={runScan}
            style={{
              width:'100%', padding:'16px', background: selectedIds.size === 0 ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              color: selectedIds.size === 0 ? 'rgba(255,255,255,0.3)' : 'white',
              border:'none', borderRadius:'14px', fontWeight:800, fontSize:'17px',
              boxShadow: selectedIds.size > 0 ? '0 8px 28px rgba(99,102,241,0.4)' : 'none',
              cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            {selectedIds.size === 0 ? 'Select at least one account' : `🚀 Scan ${selectedIds.size} account${selectedIds.size > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    );
  }

  /* ── SCANNING ── */
  if (phase === 'scanning') {
    return (
      <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#0f0f2e,#1a1a4e)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', fontFamily:'system-ui,sans-serif', color:'white', padding:'40px' }}>
        {/* Radar */}
        <div style={{ position:'relative', width:'130px', height:'130px', marginBottom:'36px' }}>
          {[0,1,2].map(i => (
            <div key={i} style={{ position:'absolute', inset:0, borderRadius:'50%', border:`2px solid ${scanningAcctColor}88`, animation:`pulse-ring 2.4s ease-out ${i*0.8}s infinite` }} />
          ))}
          <div style={{ position:'absolute', inset:'18px', borderRadius:'50%', background:`linear-gradient(135deg,${scanningAcctColor},${scanningAcctColor}88)`, boxShadow:`0 0 36px ${scanningAcctColor}66`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'34px' }}>📧</div>
        </div>

        <h2 style={{ margin:'0 0 6px', fontSize:'20px', fontWeight:700 }}>
          Scanning <span style={{ color: scanningAcctColor }}>{scanningAcct}</span>
        </h2>
        <p style={{ color:'rgba(255,255,255,0.45)', margin:'0 0 28px', fontSize:'14px' }}>
          {selectedIds.size > 1 ? `${selectedIds.size} accounts queued` : 'One account'}
        </p>

        {/* Progress bar */}
        <div style={{ width:'360px', height:'8px', background:'rgba(255,255,255,0.1)', borderRadius:'99px', overflow:'hidden', marginBottom:'18px' }}>
          <div style={{ height:'100%', borderRadius:'99px', background:`linear-gradient(90deg,${scanningAcctColor},${scanningAcctColor}aa)`, width:`${pct}%`, transition:'width 0.3s ease', boxShadow:`0 0 10px ${scanningAcctColor}88` }} />
        </div>

        {/* Counters */}
        <div style={{ display:'flex', gap:'28px', marginBottom:'20px', flexWrap:'wrap', justifyContent:'center' }}>
          {[
            { label:'Scanned',  value: scanned.toLocaleString(),      color: scanningAcctColor },
            { label:'Progress', value: `${pct}%`,                     color: 'white'           },
            { label:'Total',    value: totalFound.toLocaleString(),    color: 'rgba(255,255,255,0.55)' },
            { label:'Speed',    value: speed > 0 ? `${speed}/s` : '…', color: '#a78bfa'        },
            { label:'ETA',      value: eta > 0 ? `${eta > 59 ? `${Math.floor(eta/60)}m ` : ''}${eta % 60}s` : '…', color: '#34d399' },
          ].map(s => (
            <div key={s.label} style={{ textAlign:'center', minWidth:'60px' }}>
              <div style={{ fontSize:'22px', fontWeight:800, color:s.color, fontVariantNumeric:'tabular-nums', letterSpacing:'-0.5px' }}>{s.value}</div>
              <div style={{ fontSize:'9px', color:'rgba(255,255,255,0.35)', textTransform:'uppercase', letterSpacing:'1px', marginTop:'2px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Live preview of top senders found so far */}
        {liveGroups.length > 0 && (
          <div style={{ width:'440px', marginBottom:'16px' }}>
            <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.35)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:'8px', textAlign:'center' }}>Top senders found so far</div>
            <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
              {liveGroups.slice(0, 6).map(g => {
                const cat = CATEGORIES[g.category ?? 'other'] ?? CATEGORIES.other;
                return (
                  <div key={g.senderEmail} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'rgba(255,255,255,0.06)', borderRadius:'8px', padding:'7px 12px', animation:'fade-in 0.3s ease' }}>
                    <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.75)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'260px' }}>
                      <span style={{ marginRight:'6px' }}>{cat.icon}</span>{g.senderDisplayName}
                    </div>
                    <span style={{ fontSize:'12px', fontWeight:800, color: scanningAcctColor, fontVariantNumeric:'tabular-nums', marginLeft:'8px', flexShrink:0 }}>{g.messageCount}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Account queue pills */}
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', justifyContent:'center', marginBottom:'24px' }}>
          {accounts.filter(a => selectedIds.has(a.id)).map((a, i) => {
            const color   = ACCOUNT_COLORS[i % ACCOUNT_COLORS.length];
            const active  = a.email === scanningAcct;
            const done    = Array.from(ctxMap.values()).some(c => c.account.email === a.email) && !active;
            return (
              <div key={a.id} style={{ padding:'5px 14px', borderRadius:'99px', fontSize:'12px', fontWeight:600, background: active ? color : done ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)', color: active ? 'white' : done ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.4)', border:`1px solid ${active ? color : 'rgba(255,255,255,0.1)'}`, textDecoration: done ? 'line-through' : 'none' }}>
                {done ? '✓ ' : active ? '⟳ ' : ''}{a.email}
              </div>
            );
          })}
        </div>

        {/* Shimmer skeletons */}
        <div style={{ width:'420px', opacity:0.3, marginBottom:'24px' }}>
          {[1,0.7,0.5].map((op, i) => <div key={i} className="shimmer-row" style={{ opacity:op }} />)}
        </div>

        {/* Log toggle */}
        <button onClick={() => setShowLogs(v => !v)} style={{ background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.12)', color:'rgba(255,255,255,0.55)', borderRadius:'6px', padding:'5px 12px', fontSize:'12px', cursor:'pointer' }}>
          {showLogs ? '▲ Hide' : '▼ Show'} live log {skipped > 0 && <span style={{ color:'#fbbf24', marginLeft:'6px' }}>⚠ {skipped} skipped</span>}
        </button>
        {showLogs && (
          <div style={{ marginTop:'8px', width:'480px', background:'rgba(0,0,0,0.4)', borderRadius:'8px', padding:'12px', maxHeight:'180px', overflowY:'auto', fontFamily:'monospace', fontSize:'11px', color:'rgba(255,255,255,0.6)', lineHeight:'1.6' }}>
            {logs.map((l, i) => <div key={i} style={{ color: l.includes('ERROR')||l.includes('FATAL') ? '#fca5a5' : l.includes('skipped')||l.includes('Rate') ? '#fcd34d' : 'inherit' }}>{l}</div>)}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>
    );
  }

  /* ── RESULTS (done / error) ── */
  const allAccountEmails = [...new Set(groups.map(g => g.accountEmail!))];

  return (
    <div style={{ minHeight:'100vh', background:'#f5f5ff', fontFamily:'system-ui,-apple-system,sans-serif' }}>

      {/* ── Header ── */}
      <div style={{ background:'linear-gradient(135deg,#1e1b4b,#312e81)', padding:'18px 40px', display:'flex', alignItems:'center', justifyContent:'space-between', boxShadow:'0 4px 20px rgba(30,27,75,0.3)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
          <span style={{ fontSize:'26px' }}>🧹</span>
          <div>
            <div style={{ color:'white', fontWeight:800, fontSize:'19px', letterSpacing:'-0.3px' }}>Gmail Cleanup</div>
            <div style={{ color:'rgba(255,255,255,0.45)', fontSize:'12px' }}>
              {allAccountEmails.length} account{allAccountEmails.length !== 1 ? 's' : ''} scanned
            </div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
          {cleanedCount > 0 && (
            <div style={{ background:'rgba(134,239,172,0.15)', border:'1px solid rgba(134,239,172,0.35)', borderRadius:'99px', padding:'6px 14px', color:'#86efac', fontSize:'13px', fontWeight:600 }}>
              🎉 {cleanedCount.toLocaleString()} cleaned!
            </div>
          )}
          {skipped > 0 && (
            <div style={{ background:'rgba(251,191,36,0.15)', border:'1px solid rgba(251,191,36,0.35)', borderRadius:'99px', padding:'6px 14px', color:'#fbbf24', fontSize:'13px', fontWeight:600 }}>
              ⚠ {skipped} skipped
            </div>
          )}
          {logs.length > 0 && (
            <button onClick={() => setShowLogs(v => !v)} style={{ background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', color:'rgba(255,255,255,0.65)', borderRadius:'8px', padding:'6px 12px', fontSize:'12px', cursor:'pointer' }}>
              {showLogs ? '▲ Hide log' : '▼ Log'}
            </button>
          )}
          <button className="pill-btn act-btn" onClick={() => { setPhase('pick-accounts'); }} style={{ padding:'9px 20px', background:'rgba(255,255,255,0.1)', color:'white', fontSize:'13px' }}>
            ← Switch accounts
          </button>
          <button className="pill-btn act-btn" onClick={runScan} style={{ padding:'9px 22px', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'white', fontSize:'13px', boxShadow:'0 4px 16px rgba(99,102,241,0.35)' }}>
            🔄 Re-scan
          </button>
        </div>
      </div>

      {/* Log panel */}
      {showLogs && logs.length > 0 && (
        <div style={{ margin:'0 40px', background:'#1e1b4b', borderRadius:'0 0 10px 10px', padding:'12px 16px', maxHeight:'180px', overflowY:'auto', fontFamily:'monospace', fontSize:'11px', color:'rgba(255,255,255,0.65)', lineHeight:'1.7' }}>
          {logs.map((l, i) => <div key={i} style={{ color: l.includes('ERROR')||l.includes('FATAL') ? '#fca5a5' : l.includes('skipped')||l.includes('Rate') ? '#fcd34d' : 'inherit' }}>{l}</div>)}
          <div ref={logsEndRef} />
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ margin:'16px 40px 0', padding:'12px 16px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:'10px', color:'#991b1b', fontSize:'14px' }}>
          ⚠ <strong>Error:</strong> {error}
          <button onClick={() => setError(null)} style={{ float:'right', background:'none', border:'none', cursor:'pointer', color:'#991b1b', fontSize:'16px' }}>✕</button>
        </div>
      )}

      <div style={{ maxWidth:'1140px', margin:'0 auto', padding:'28px 40px' }}>

        {/* Account avatar strip */}
        {allAccountEmails.length > 0 && (
          <div style={{ display:'flex', gap:'10px', marginBottom:'24px', flexWrap:'wrap' }}>
            <button onClick={() => setFilterAccount('all')} className="act-btn" style={{ padding:'7px 16px', background: filterAccount === 'all' ? '#1e1b4b' : 'white', color: filterAccount === 'all' ? 'white' : '#374151', border:'1.5px solid', borderColor: filterAccount === 'all' ? '#1e1b4b' : '#e5e7eb', borderRadius:'99px', fontSize:'13px', fontWeight:600 }}>
              All accounts
            </button>
            {allAccountEmails.map((email, i) => {
              const color    = ACCOUNT_COLORS[i % ACCOUNT_COLORS.length];
              const active   = filterAccount === email;
              const cnt      = groups.filter(g => g.accountEmail === email).length;
              return (
                <button key={email} onClick={() => setFilterAccount(email)} className="act-btn" style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 14px 6px 8px', background: active ? color : 'white', color: active ? 'white' : '#374151', border:`1.5px solid ${active ? color : '#e5e7eb'}`, borderRadius:'99px', fontSize:'13px', fontWeight:600 }}>
                  <div style={{ width:'22px', height:'22px', borderRadius:'50%', background: active ? 'rgba(255,255,255,0.3)' : color, color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:800 }}>
                    {initials(email)}
                  </div>
                  <span style={{ maxWidth:'180px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{email}</span>
                  <span style={{ opacity:0.65 }}>({cnt})</span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Category tabs ── */}
        {activeCategories.length > 0 && (
          <div style={{ marginBottom:'20px' }}>
            <div style={{ fontSize:'11px', fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'1px', marginBottom:'10px' }}>Filter by category</div>
            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
              {/* All tab */}
              <button
                onClick={() => setFilterCategory('all')}
                className="act-btn"
                style={{ padding:'7px 14px', borderRadius:'99px', fontSize:'13px', fontWeight:700, border:'1.5px solid', borderColor: filterCategory === 'all' ? '#1e1b4b' : '#e5e7eb', background: filterCategory === 'all' ? '#1e1b4b' : 'white', color: filterCategory === 'all' ? 'white' : '#374151' }}
              >
                🗂 All <span style={{ opacity:0.6, fontWeight:500 }}>({accountFiltered.length})</span>
              </button>

              {activeCategories.map(catId => {
                const cat      = CATEGORIES[catId] ?? CATEGORIES.other;
                const count    = categoryCounts[catId];
                const active   = filterCategory === catId;
                const catProt  = protectedCategories.has(catId);
                return (
                  <div key={catId} style={{ display:'flex', alignItems:'center', gap:'3px' }}>
                    <button
                      onClick={() => setFilterCategory(catId)}
                      className="act-btn"
                      style={{
                        padding:'7px 14px', borderRadius: catProt ? '99px 0 0 99px' : '99px', fontSize:'13px', fontWeight:700,
                        border:`1.5px solid ${catProt ? '#d1d5db' : active ? cat.color : '#e5e7eb'}`,
                        borderRight: catProt ? 'none' : undefined,
                        background: catProt ? '#f3f4f6' : active ? cat.color : cat.bg,
                        color: catProt ? '#9ca3af' : active ? 'white' : cat.color,
                        transition:'all 0.15s',
                        textDecoration: catProt ? 'line-through' : 'none',
                        opacity: catProt ? 0.8 : 1,
                      }}
                    >
                      {cat.icon} {cat.label} <span style={{ opacity: active ? 0.75 : 0.6, fontWeight:500 }}>({count})</span>
                    </button>
                    {/* Shield toggle for category */}
                    <button
                      title={catProt ? `Unprotect "${cat.label}" — restore to cleaning list` : `Protect entire "${cat.label}" category`}
                      onClick={() => toggleProtectCategory(catId)}
                      className="act-btn"
                      style={{
                        padding:'7px 10px', borderRadius: catProt ? '0 99px 99px 0' : '99px',
                        fontSize:'12px', fontWeight:700,
                        border:`1.5px solid ${catProt ? '#6366f1' : '#e5e7eb'}`,
                        borderLeft: catProt ? `1.5px solid #6366f1` : '1.5px solid #e5e7eb',
                        background: catProt ? '#eef2ff' : 'white',
                        color: catProt ? '#6366f1' : '#9ca3af',
                        transition:'all 0.15s',
                        lineHeight:1,
                      }}
                    >
                      🛡️
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Stat pills */}
        {(visibleGroups.length > 0 || protectedGroups.length > 0) && (
          <div style={{ display:'flex', gap:'14px', marginBottom:'24px', flexWrap:'wrap' }}>
            {[
              { icon:'📨', label:'Emails scanned',  value: totalFound.toLocaleString(),           color:'#6366f1' },
              { icon:'👤', label:'Senders',          value: visibleGroups.length.toLocaleString(), color:'#8b5cf6' },
              { icon:'🗑️', label:'Emails in view',   value: totalEmails.toLocaleString(),          color:'#ec4899' },
              { icon:'🔥', label:'Likely junk',      value: junkCount.toLocaleString(),            color:'#ef4444' },
              ...(protectedGroups.length > 0 ? [{ icon:'🛡️', label:'Protected', value: protectedGroups.length.toLocaleString(), color:'#6366f1' }] : []),
            ].map(s => (
              <div key={s.label} style={{ flex:'1 1 160px', background:'white', borderRadius:'12px', padding:'16px 20px', boxShadow:'0 2px 10px rgba(0,0,0,0.06)', borderTop:`3px solid ${s.color}` }}>
                <div style={{ fontSize:'20px', marginBottom:'4px' }}>{s.icon}</div>
                <div style={{ fontSize:'24px', fontWeight:800, color:s.color, fontVariantNumeric:'tabular-nums' }}>{s.value}</div>
                <div style={{ fontSize:'11px', color:'#9ca3af', marginTop:'2px' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Bulk action bar */}
        {selectedCount > 0 && (
          <div style={{ position:'sticky', top:'12px', zIndex:100, background:'white', border:'1px solid #e0e7ff', borderRadius:'12px', padding:'12px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', boxShadow:'0 8px 28px rgba(99,102,241,0.18)', marginBottom:'16px', animation:'pop-in 0.22s ease' }}>
            <div style={{ fontWeight:700, color:'#1e1b4b', fontSize:'14px' }}>
              {selectedCount} senders &nbsp;·&nbsp; <span style={{ color:'#6366f1' }}>{selectedTotal.toLocaleString()} emails</span>
            </div>
            <div style={{ display:'flex', gap:'8px' }}>
              <button className="act-btn" onClick={() => handleBulkAction('archive')} style={{ padding:'8px 18px', background:'#ede9fe', color:'#5b21b6' }}>📁 Archive All</button>
              <button className="act-btn" onClick={() => { if(confirm(`Trash ${selectedTotal.toLocaleString()} emails from ${selectedCount} senders?`)) handleBulkAction('trash'); }} style={{ padding:'8px 18px', background:'#fef2f2', color:'#dc2626' }}>🗑️ Trash All</button>
            </div>
          </div>
        )}

        {/* Column headers */}
        {visibleGroups.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'40px 1fr 70px 110px 80px 70px 36px 154px', gap:'8px', padding:'6px 18px', color:'#9ca3af', fontSize:'11px', textTransform:'uppercase', letterSpacing:'0.8px', fontWeight:600, marginBottom:'4px' }}>
            <div><input type="checkbox" checked={visibleGroups.length > 0 && visibleGroups.every(g => selectedEmails.has(`${g.senderEmail}::${g.accountEmail}`))} onChange={toggleSelectAll} style={{ cursor:'pointer', accentColor:'#6366f1' }} /></div>
            <div>Sender</div>
            <div>Emails</div>
            <div>Category</div>
            <div>Account</div>
            <div>Junk</div>
            <div title="Protect sender from cleaning">🛡️</div>
            <div>Actions</div>
          </div>
        )}

        {/* Sender cards */}
        <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
          {visibleGroups.map((g, idx) => {
            const isJunk       = g.suspectedSubscriptionScore >= 5;
            const cardKey      = `${g.senderEmail}::${g.accountEmail}`;
            const isSelected   = selectedEmails.has(cardKey);
            const isDismissing = dismissing.has(cardKey);
            const acctIdx      = allAccountEmails.indexOf(g.accountEmail!);
            const color        = ACCOUNT_COLORS[acctIdx % ACCOUNT_COLORS.length] ?? '#6366f1';
            return (
              <div
                key={cardKey}
                className={`sender-card${isDismissing ? ' dismissing' : ''}`}
                style={{
                  display:'grid', gridTemplateColumns:'40px 1fr 70px 110px 80px 70px 36px 154px',
                  gap:'10px', alignItems:'center',
                  background: isSelected ? '#f5f3ff' : 'white',
                  border:`1.5px solid ${isSelected ? '#a5b4fc' : 'transparent'}`,
                  borderRadius:'10px', padding:'12px 18px',
                  boxShadow:'0 1px 4px rgba(0,0,0,0.05)',
                  animationDelay:`${Math.min(idx * 0.02, 0.4)}s`,
                }}
              >
                <div>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(g)} style={{ cursor:'pointer', accentColor:'#6366f1' }} />
                </div>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontWeight:700, color:'#1e1b4b', fontSize:'13px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{g.senderDisplayName}</div>
                  <div style={{ color:'#9ca3af', fontSize:'11px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{g.senderEmail}</div>
                </div>
                <div style={{ fontWeight:800, fontSize:'15px', color:'#374151', fontVariantNumeric:'tabular-nums' }}>
                  {g.messageCount.toLocaleString()}
                </div>
                {/* Category badge */}
                {(() => {
                  const cat = CATEGORIES[g.category ?? 'other'] ?? CATEGORIES.other;
                  return (
                    <div>
                      <span
                        onClick={() => setFilterCategory(g.category ?? 'other')}
                        title={`Filter by ${cat.label}`}
                        style={{ display:'inline-flex', alignItems:'center', gap:'4px', padding:'3px 9px', borderRadius:'99px', fontSize:'11px', fontWeight:700, background: cat.bg, color: cat.color, border:`1px solid ${cat.color}33`, cursor:'pointer', whiteSpace:'nowrap', overflow:'hidden', maxWidth:'104px', textOverflow:'ellipsis' }}
                      >
                        {cat.icon} {cat.label}
                      </span>
                    </div>
                  );
                })()}
                {/* Account badge */}
                <div>
                  <span title={g.accountEmail} style={{ display:'inline-flex', alignItems:'center', gap:'5px', padding:'3px 10px', borderRadius:'99px', fontSize:'11px', fontWeight:700, background:`${color}18`, color, border:`1px solid ${color}44`, maxWidth:'84px', overflow:'hidden' }}>
                    <span style={{ width:'14px', height:'14px', borderRadius:'50%', background:color, color:'white', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:'8px', fontWeight:900, flexShrink:0 }}>{initials(g.accountEmail!)}</span>
                    <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{g.accountEmail!.split('@')[0]}</span>
                  </span>
                </div>
                {/* Junk badge */}
                <div>
                  <span style={{ display:'inline-block', padding:'3px 9px', borderRadius:'99px', fontSize:'11px', fontWeight:700, background: isJunk ? '#fef2f2' : '#f0fdf4', color: isJunk ? '#dc2626' : '#16a34a', border:`1px solid ${isJunk ? '#fecaca' : '#bbf7d0'}` }}>
                    {isJunk ? '🔥' : '✅'} {g.suspectedSubscriptionScore}
                  </span>
                </div>
                {/* Protect toggle */}
                <div>
                  <button
                    title="Protect this sender — keep emails, exclude from cleaning"
                    onClick={() => toggleProtectSender(g)}
                    style={{ width:'30px', height:'30px', borderRadius:'8px', border:'1.5px solid #e5e7eb', background:'white', cursor:'pointer', fontSize:'15px', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s', color: '#9ca3af' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor='#6366f1'; e.currentTarget.style.background='#eef2ff'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor='#e5e7eb'; e.currentTarget.style.background='white'; }}
                  >🛡️</button>
                </div>
                {/* Action buttons */}
                <div style={{ display:'flex', gap:'6px' }}>
                  <button className="act-btn" onClick={() => handleAction(g, 'archive')} style={{ padding:'6px 12px', background:'#ede9fe', color:'#5b21b6' }}>📁 Archive</button>
                  <button className="act-btn" onClick={() => { if(confirm(`Trash ${g.messageCount} emails from ${g.senderDisplayName}?`)) handleAction(g,'trash'); }} style={{ padding:'6px 12px', background:'#fef2f2', color:'#dc2626' }}>🗑️</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Protected / Safe List ── */}
        {protectedGroups.length > 0 && (
          <div style={{ marginTop:'32px' }}>
            <button
              onClick={() => setShowProtected(v => !v)}
              style={{ display:'flex', alignItems:'center', gap:'10px', background:'none', border:'none', cursor:'pointer', padding:'10px 0', width:'100%' }}
            >
              <div style={{ flex:1, height:'1px', background:'#e5e7eb' }} />
              <span style={{ fontSize:'13px', fontWeight:700, color:'#6b7280', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:'6px' }}>
                🛡️ Protected / Safe List
                <span style={{ background:'#f3f4f6', border:'1px solid #e5e7eb', borderRadius:'99px', padding:'1px 8px', fontSize:'11px', color:'#9ca3af' }}>{protectedGroups.length}</span>
                <span style={{ fontSize:'11px', color:'#d1d5db' }}>{showProtected ? '▲' : '▼'}</span>
              </span>
              <div style={{ flex:1, height:'1px', background:'#e5e7eb' }} />
            </button>

            {showProtected && (
              <div style={{ marginTop:'10px', display:'flex', flexDirection:'column', gap:'6px', animation:'fade-in 0.25s ease' }}>
                <div style={{ fontSize:'12px', color:'#9ca3af', marginBottom:'4px', paddingLeft:'4px' }}>
                  These senders are protected — their emails won't appear in the cleaning list. Click 🛡️ again to unprotect.
                </div>
                {protectedGroups.map(g => {
                  const cardKey  = `${g.senderEmail}::${g.accountEmail}`;
                  const acctIdx  = allAccountEmails.indexOf(g.accountEmail!);
                  const color    = ACCOUNT_COLORS[acctIdx % ACCOUNT_COLORS.length] ?? '#6366f1';
                  const cat      = CATEGORIES[g.category ?? 'other'] ?? CATEGORIES.other;
                  const catProt  = protectedCategories.has(g.category ?? 'other');
                  return (
                    <div
                      key={cardKey}
                      style={{ display:'grid', gridTemplateColumns:'1fr 110px 80px auto', gap:'10px', alignItems:'center', background:'#f9fafb', border:'1.5px solid #e5e7eb', borderRadius:'10px', padding:'10px 18px', opacity:0.85 }}
                    >
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontWeight:600, color:'#374151', fontSize:'13px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{g.senderDisplayName}</div>
                        <div style={{ color:'#9ca3af', fontSize:'11px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{g.senderEmail}</div>
                      </div>
                      <div>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:'4px', padding:'3px 9px', borderRadius:'99px', fontSize:'11px', fontWeight:700, background: cat.bg, color: cat.color, border:`1px solid ${cat.color}33`, whiteSpace:'nowrap' }}>
                          {cat.icon} {cat.label}
                        </span>
                      </div>
                      <div>
                        <span title={g.accountEmail} style={{ display:'inline-flex', alignItems:'center', gap:'5px', padding:'3px 10px', borderRadius:'99px', fontSize:'11px', fontWeight:700, background:`${color}18`, color, border:`1px solid ${color}44`, maxWidth:'84px', overflow:'hidden' }}>
                          <span style={{ width:'14px', height:'14px', borderRadius:'50%', background:color, color:'white', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:'8px', fontWeight:900, flexShrink:0 }}>{initials(g.accountEmail!)}</span>
                          <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{g.accountEmail!.split('@')[0]}</span>
                        </span>
                      </div>
                      <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                        {catProt && (
                          <span title={`Protected via "${cat.label}" category`} style={{ fontSize:'11px', color:'#9ca3af', background:'#f3f4f6', border:'1px solid #e5e7eb', borderRadius:'6px', padding:'3px 8px', whiteSpace:'nowrap' }}>
                            {cat.icon} category
                          </span>
                        )}
                        <button
                          title="Remove protection — add back to cleaning list"
                          onClick={() => catProt ? toggleProtectCategory(g.category ?? 'other') : toggleProtectSender(g)}
                          className="act-btn"
                          style={{ padding:'5px 12px', background:'white', border:'1.5px solid #d1d5db', color:'#374151', fontSize:'12px', display:'flex', alignItems:'center', gap:'5px' }}
                        >
                          🛡️ <span>Unprotect</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {visibleGroups.length === 0 && phase === 'done' && (
          <div style={{ textAlign:'center', padding:'72px 40px', animation:'fade-in 0.4s ease' }}>
            <div style={{ fontSize:'60px', marginBottom:'14px' }}>{protectedGroups.length > 0 ? '🛡️' : '🎉'}</div>
            <h2 style={{ color:'#1e1b4b', marginBottom:'6px' }}>{protectedGroups.length > 0 ? 'Everything is protected!' : 'All clean!'}</h2>
            <p style={{ color:'#6b7280' }}>
              {cleanedCount > 0
                ? `You cleared ${cleanedCount.toLocaleString()} emails.`
                : protectedGroups.length > 0
                  ? `${protectedGroups.length} sender${protectedGroups.length > 1 ? 's are' : ' is'} protected. Expand the safe list below to manage them.`
                  : 'Nothing found to archive or trash.'}
            </p>
            <button className="pill-btn act-btn" onClick={() => setPhase('pick-accounts')} style={{ marginTop:'20px', padding:'11px 28px', background:'#6366f1', color:'white', fontSize:'14px', borderRadius:'10px', boxShadow:'0 4px 16px rgba(99,102,241,0.3)' }}>
              ← Back to accounts
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
