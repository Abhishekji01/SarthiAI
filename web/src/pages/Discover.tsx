import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type OpportunityQuery } from '../lib/api';
import { useUser } from '../lib/session';
import { useAsync } from '../lib/useAsync';
import { CityPrompt, placesOf } from '../components/CityPrompt';
import { type Opportunity, type OpportunityType, type PageMeta } from '../lib/types';

const OPPORTUNITY_TYPES: OpportunityType[] = ['scholarship', 'internship', 'research', 'hackathon', 'job', 'fellowship', 'competition', 'program'];
import { OpportunityRow } from '../components/OpportunityRow';
import { Empty, ErrorState, Field, Sheet, Skeleton, TopBar } from '../components/ui';
import { IconCompass, IconFilter, IconPin, IconSearch } from '../components/icons';
import { usePageTitle } from '../lib/usePageTitle';

/** Plural chip labels: "Scholarships", "Internships", "Research", "Hackathons"… */
const CHIP_LABEL: Record<string, string> = {
  scholarship: 'Scholarships', internship: 'Internships', research: 'Research', fellowship: 'Fellowships',
  hackathon: 'Hackathons', competition: 'Contests', job: 'Jobs', program: 'Programmes',
};

const SUGGESTED = ['scholarship', 'hackathon', 'machine learning', 'research internship', 'cybersecurity', 'remote'];

export function Discover() {
  usePageTitle('Find');
  const [params, setParams] = useSearchParams();
  const user = useUser();
  const places = placesOf(user);
  const [cityOpen, setCityOpen] = useState(false);
  const eventType = params.get('type') === 'hackathon' || params.get('type') === 'competition' ? params.get('type')! : null;
  // Hackathons and contests lead with what's near the student; everything else with best fit.
  const defaultSort: NonNullable<OpportunityQuery['sort']> = eventType && !params.get('q') ? 'nearby' : 'relevance';
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
    location: params.get('location') ?? undefined,
    sort: (params.get('sort') as OpportunityQuery['sort']) ?? defaultSort,
    hasPrize: params.get('hasPrize') === 'true' || undefined,
    verifiedOnly: params.get('verifiedOnly') === 'true' || undefined,
    includeClosed: params.get('includeClosed') === 'true' || undefined,
    campusOnly: params.get('campusOnly') === 'true' || undefined,
    mentions: params.get('mentions') === 'true' || undefined,
    deadlineWithinDays: params.get('within') ? Number(params.get('within')) : undefined,
  };
  const key = `${params.toString()}|${places.join(',')}`;
  const cities = useAsync(() => (eventType ? api.eventPlaces(eventType) : Promise.resolve([])), [eventType]);
  // Hackathons and contests are events: "Online" / "In person" instead of remote / hybrid / on-site.
  const events = Boolean(eventType);
  const modes: [string, string][] = events ? [['remote', 'Online'], ['onsite', 'In person']] : [['remote', 'Remote'], ['hybrid', 'Hybrid'], ['onsite', 'On-site']];
  const [city, setCity] = useState(query.location ?? '');
  useEffect(() => setCity(query.location ?? ''), [query.location]);
  const applyCity = () => { const c = city.trim(); if (c !== (query.location ?? '')) update({ location: c || null }); };

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

  const activeFilters = ['workMode', 'location', 'verifiedOnly', 'includeClosed', 'campusOnly', 'within', 'hasPrize'].filter((k) => params.get(k)).length + (query.sort !== defaultSort ? 1 : 0);
  const nearOn = query.sort === 'nearby';
  const toggleNear = () => {
    if (!nearOn && !places.length) setCityOpen(true);
    update({ sort: nearOn ? 'relevance' : defaultSort === 'nearby' ? null : 'nearby' });
  };

  return (
    <div className="page">
      <TopBar title="Find" actions={
        <button className={`icon-btn ${activeFilters ? 'active' : ''}`} aria-label={`Filters${activeFilters ? ` (${activeFilters} active)` : ''}`} onClick={() => setFiltersOpen(true)}><IconFilter /></button>
      } />
      <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); update({ q: text.trim() || null }); }}>
        <IconSearch size={18} />
        <input className="input" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder='Try "ML internship" or "girls"' aria-label="Search opportunities" enterKeyHint="search" />
      </form>
      <div className="chips scroll" style={{ marginTop: 12 }}>
        <button className={`chip ${!query.type ? 'on' : ''}`} onClick={() => update({ type: null })}>All</button>
        {OPPORTUNITY_TYPES.map((t) => (
          <button key={t} className={`chip ${query.type === t ? 'on' : ''}`} aria-pressed={query.type === t} onClick={() => update({ type: query.type === t ? null : t })}>{CHIP_LABEL[t]}</button>
        ))}
      </div>

      <div className="chips scroll quick-filters" role="group" aria-label="Quick filters">
        <button className={`chip ${nearOn ? 'on' : ''}`} aria-pressed={nearOn} onClick={toggleNear}><IconPin size={14} /> Near me</button>
        {modes.filter(([m]) => m !== 'hybrid').map(([m, label]) => (
          <button key={m} className={`chip ${query.workMode === m ? 'on' : ''}`} aria-pressed={query.workMode === m} onClick={() => update({ workMode: query.workMode === m ? null : m })}>{label}</button>
        ))}
        {events && (cities.data?.length ?? 0) > 0 && (
          <select className={`chip chip-select ${query.location ? 'on' : ''}`} aria-label="City" value={query.location ?? ''} onChange={(e) => update({ location: e.target.value || null })}>
            <option value="">Any city</option>
            {query.location && !cities.data!.some((c) => c.city === query.location) && <option value={query.location}>{query.location}</option>}
            {cities.data!.map((c) => <option key={c.city} value={c.city}>{c.city} ({c.count})</option>)}
          </select>
        )}
        {[[7, 'This week'], [30, 'This month']].map(([d, label]) => (
          <button key={d} className={`chip ${query.deadlineWithinDays === d ? 'on' : ''}`} aria-pressed={query.deadlineWithinDays === d} onClick={() => update({ within: query.deadlineWithinDays === d ? null : String(d) })}>{label}</button>
        ))}
        {events && <button className={`chip ${query.hasPrize ? 'on' : ''}`} aria-pressed={Boolean(query.hasPrize)} onClick={() => update({ hasPrize: query.hasPrize ? null : 'true' })}>Has prizes</button>}
        {activeFilters > 0 && <button className="chip chip-clear" onClick={() => { const q = params.get('q'); const type = params.get('type'); setParams(new URLSearchParams(Object.entries({ q, type }).filter(([, v]) => v) as [string, string][]), { replace: true }); }}>Clear</button>}
      </div>

      {nearOn && (cityOpen || !places.length) && <div style={{ marginTop: 12 }}><CityPrompt onDone={() => setCityOpen(false)} /></div>}

      <div style={{ marginTop: 16 }}>
        {nearOn && places.length > 0 && meta && !error && (
          <p className="small muted" style={{ marginBottom: 6 }}>
            {meta.nearby?.count ? `${meta.nearby.count} near ${places[0]}, shown first.` : `Nothing in person near ${places[0]} right now, so online events come first.`}{' '}
            <button className="link-btn" onClick={() => setCityOpen(true)}>Change city</button>
          </p>
        )}
        {meta && !error && (
          <p className="faint" style={{ marginBottom: 10 }}>
            {meta.total} result{meta.total === 1 ? '' : 's'}
            {meta.search?.relaxed && ' · no exact match, showing closely related results'}
            {query.sort === 'relevance' ? ' · ranked by fit' : query.sort === 'deadline' ? ' · soonest deadline first' : query.sort === 'nearby' ? ' · nearest first' : ' · recently updated'}
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
            {(['nearby', 'relevance', 'deadline', 'recent'] as const).map((s) => (
              <button key={s} className={`chip ${query.sort === s ? 'on' : ''}`} onClick={() => update({ sort: s === defaultSort ? null : s })}>
                {s === 'nearby' ? 'Near me' : s === 'relevance' ? 'Best fit' : s === 'deadline' ? 'Deadline' : 'Recently updated'}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>{events ? 'Format' : 'Work mode'}</span>
          <div className="chips">
            {modes.map(([m, label]) => (
              <button key={m} className={`chip ${query.workMode === m ? 'on' : ''}`} onClick={() => update({ workMode: query.workMode === m ? null : m })}>{label}</button>
            ))}
          </div>
        </div>
        <Field label="City or state" hint={events ? 'Bangalore and Bengaluru both work, and so do state names.' : 'Listings open across India are included.'}>
          <input className="input" value={city} placeholder="e.g. Bengaluru, Pune, Delhi" onChange={(e) => setCity(e.target.value)} onBlur={applyCity} onKeyDown={(e) => { if (e.key === 'Enter') applyCity(); }} />
        </Field>
        <div className="field">
          <span>Deadline within</span>
          <div className="chips">
            {[7, 30, 90].map((d) => (
              <button key={d} className={`chip ${query.deadlineWithinDays === d ? 'on' : ''}`} onClick={() => update({ within: query.deadlineWithinDays === d ? null : String(d) })}>{d} days</button>
            ))}
          </div>
        </div>
        {events && <label className="check"><input type="checkbox" checked={Boolean(query.hasPrize)} onChange={(e) => update({ hasPrize: e.target.checked ? 'true' : null })} /> Has prizes</label>}
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
