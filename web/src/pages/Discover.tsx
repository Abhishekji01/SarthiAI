import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type OpportunityQuery } from '../lib/api';
import { OPPORTUNITY_TYPES, type Opportunity, type PageMeta } from '../lib/types';
import { TYPE_LABEL } from '../lib/format';
import { OpportunityRow } from '../components/OpportunityRow';
import { Empty, ErrorState, Sheet, Skeleton, TopBar } from '../components/ui';
import { IconCompass, IconFilter, IconSearch } from '../components/icons';

const SUGGESTED = ['scholarship', 'machine learning', 'research internship', 'cybersecurity', 'government', 'remote'];

export function Discover() {
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get('q') ?? '');
  const [items, setItems] = useState<Opportunity[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  const query: OpportunityQuery = {
    q: params.get('q') ?? undefined,
    type: params.get('type') ?? undefined,
    workMode: params.get('workMode') ?? undefined,
    sort: (params.get('sort') as OpportunityQuery['sort']) ?? 'relevance',
    verifiedOnly: params.get('verifiedOnly') === 'true' || undefined,
    includeClosed: params.get('includeClosed') === 'true' || undefined,
    campusOnly: params.get('campusOnly') === 'true' || undefined,
    mentions: params.get('mentions') === 'true' || undefined,
    deadlineWithinDays: params.get('within') ? Number(params.get('within')) : undefined,
  };
  const key = params.toString();

  const load = async (page: number) => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api.opportunities({ ...query, page, limit: 20 });
      if (id !== seq.current) return;
      setItems((prev) => (page === 1 ? res.data : [...prev, ...res.data]));
      setMeta(res.meta);
    } catch (e) {
      if (id === seq.current) setError(e as Error);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(1); }, [key]);

  // Debounced search-as-you-type.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('q') ?? '') !== text.trim()) update({ q: text.trim() || null, mentions: null });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // Infinite scroll.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loading && meta && meta.page < meta.totalPages) load(meta.page + 1);
    }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  });

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) (v ? next.set(k, v) : next.delete(k));
    setParams(next, { replace: true });
  }

  const activeFilters = ['workMode', 'verifiedOnly', 'includeClosed', 'campusOnly', 'within'].filter((k) => params.get(k)).length + (query.sort !== 'relevance' ? 1 : 0);

  return (
    <div className="page">
      <TopBar title="Discover" kicker="Verified opportunities" actions={
        <button className={`icon-btn ${activeFilters ? 'active' : ''}`} aria-label={`Filters${activeFilters ? ` (${activeFilters} active)` : ''}`} onClick={() => setFiltersOpen(true)}><IconFilter /></button>
      } />
      <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); update({ q: text.trim() || null }); }}>
        <IconSearch size={18} />
        <input className="input" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Try “ML internship”, “scholarship for girls”, “ISRO”" aria-label="Search opportunities" enterKeyHint="search" />
      </form>
      <div className="chips scroll" style={{ marginTop: 12 }}>
        <button className={`chip ${!query.type ? 'on' : ''}`} onClick={() => update({ type: null })}>All</button>
        {OPPORTUNITY_TYPES.map((t) => (
          <button key={t} className={`chip ${query.type === t ? 'on' : ''}`} onClick={() => update({ type: query.type === t ? null : t })}>{TYPE_LABEL[t]}</button>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        {meta && !error && (
          <p className="faint" style={{ marginBottom: 10 }}>
            {meta.total} result{meta.total === 1 ? '' : 's'}
            {meta.search?.relaxed && ' · no exact match, showing closely related results'}
            {query.sort === 'relevance' ? ' · ranked by fit' : query.sort === 'deadline' ? ' · soonest deadline first' : ' · recently updated'}
          </p>
        )}
        {error && <ErrorState error={error} onRetry={() => load(1)} />}
        {!error && items.length === 0 && loading && <Skeleton />}
        {!error && items.length === 0 && !loading && (
          <Empty icon={<IconCompass size={40} />} title={meta?.search?.closedMatches ? 'Nothing open right now' : 'Nothing matched'}>
            {meta?.search?.closedMatches ? (
              <div style={{ marginBottom: 14 }}>
                {meta.search.closedMatches} matching listing{meta.search.closedMatches === 1 ? ' has' : 's have'} closed for this cycle. Save {meta.search.closedMatches === 1 ? 'it' : 'them'} to plan for the next one.
                <div style={{ marginTop: 10 }}><button className="btn small secondary" onClick={() => update({ includeClosed: 'true' })}>Show closed listings</button></div>
              </div>
            ) : null}
            Try a broader search, or one of these:
            <div className="chips" style={{ justifyContent: 'center', marginTop: 12 }}>
              {SUGGESTED.map((s) => <button key={s} className="chip" onClick={() => { setText(s); update({ q: s, type: null }); }}>{s}</button>)}
            </div>
          </Empty>
        )}
        <div className="stack">{items.map((o) => <OpportunityRow key={o.id} o={o} />)}</div>
        {loading && items.length > 0 && <div style={{ marginTop: 12 }}><Skeleton count={1} /></div>}
        {!loading && meta && !error && (meta.search?.hiddenMentions ?? 0) > 0 && meta.page >= meta.totalPages && (
          <div className="card soft row" style={{ marginTop: 12 }}>
            <span className="grow small">{meta.search!.hiddenMentions} more listing{meta.search!.hiddenMentions === 1 ? '' : 's'} mention “{query.q}” in the description but aren’t mainly about it.</span>
            <button className="btn small secondary" onClick={() => update({ mentions: 'true' })}>Show</button>
          </div>
        )}
        <div ref={sentinel} />
        <p className="tiny faint" style={{ marginTop: 20 }}>Every listing links to its official source. Match scores are heuristic, not selection chances.</p>
      </div>

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        <div className="field">
          <span>Sort</span>
          <div className="chips">
            {(['relevance', 'deadline', 'recent'] as const).map((s) => (
              <button key={s} className={`chip ${query.sort === s ? 'on' : ''}`} onClick={() => update({ sort: s === 'relevance' ? null : s })}>
                {s === 'relevance' ? 'Best fit' : s === 'deadline' ? 'Deadline' : 'Recently updated'}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Work mode</span>
          <div className="chips">
            {['remote', 'hybrid', 'onsite'].map((m) => (
              <button key={m} className={`chip ${query.workMode === m ? 'on' : ''}`} onClick={() => update({ workMode: query.workMode === m ? null : m })}>{m === 'onsite' ? 'On-site' : m[0].toUpperCase() + m.slice(1)}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Deadline within</span>
          <div className="chips">
            {[7, 30, 90].map((d) => (
              <button key={d} className={`chip ${query.deadlineWithinDays === d ? 'on' : ''}`} onClick={() => update({ within: query.deadlineWithinDays === d ? null : String(d) })}>{d} days</button>
            ))}
          </div>
        </div>
        <label className="check"><input type="checkbox" checked={Boolean(query.verifiedOnly)} onChange={(e) => update({ verifiedOnly: e.target.checked ? 'true' : null })} /> Verified only</label>
        <label className="check"><input type="checkbox" checked={Boolean(query.campusOnly)} onChange={(e) => update({ campusOnly: e.target.checked ? 'true' : null })} /> My campus only</label>
        <label className="check"><input type="checkbox" checked={Boolean(query.includeClosed)} onChange={(e) => update({ includeClosed: e.target.checked ? 'true' : null })} /> Include closed listings</label>
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn ghost" onClick={() => { const q = params.get('q'); const type = params.get('type'); setParams(new URLSearchParams(Object.entries({ q, type }).filter(([, v]) => v) as [string, string][]), { replace: true }); }}>Reset</button>
          <button className="btn grow" onClick={() => setFiltersOpen(false)}>Show results</button>
        </div>
      </Sheet>
    </div>
  );
}
