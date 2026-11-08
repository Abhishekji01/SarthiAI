import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { usePageTitle } from '../lib/usePageTitle';
import type { SavedSearch } from '../lib/types';
import { Empty, ErrorState, Skeleton, TopBar, useToast } from '../components/ui';
import { IconSearch, IconTrash } from '../components/icons';

/** Saved Find searches: open, turn email alerts on or off, or delete. */
export function SavedSearches() {
  usePageTitle('Saved searches');
  const { data, error, loading, reload, setData } = useAsync(() => api.searches(), []);
  return (
    <div className="page">
      <TopBar title="Saved searches" back="/discover" />
      {loading && !data ? <Skeleton count={3} height={70} /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.length ? (
        <Empty icon={<IconSearch size={40} />} title="No saved searches yet">In Find, choose a search or filters, then tap “Save this search”. <Link to="/discover">Go to Find</Link></Empty>
      ) : (
        <ul className="list card" style={{ padding: '2px 16px' }}>
          {data.map((s) => <SearchRow key={s.id} s={s} onChange={(n) => setData(data.map((x) => (x.id === n.id ? n : x)))} onDelete={() => setData(data.filter((x) => x.id !== s.id))} />)}
        </ul>
      )}
    </div>
  );
}

function SearchRow({ s, onChange, onDelete }: { s: SavedSearch; onChange: (s: SavedSearch) => void; onDelete: () => void }) {
  const toast = useToast();
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => { api.searchCount(s.id).then((r) => setCount(r.total)).catch(() => {}); }, [s.id]);
  return (
    <li className="row" style={{ padding: '12px 0', alignItems: 'flex-start' }}>
      <div className="grow">
        <Link to={`/discover?${s.query}`} style={{ color: 'inherit' }}><strong>{s.name}</strong></Link>
        <p className="small faint" style={{ margin: '2px 0 6px' }}>{count == null ? 'Counting…' : `${count} result${count === 1 ? '' : 's'} now`}</p>
        <label className="check small" style={{ minHeight: 32 }}>
          <input type="checkbox" checked={s.alerts} onChange={async (e) => { try { onChange(await api.updateSearch(s.id, { alerts: e.target.checked })); } catch (err) { toast((err as Error).message); } }} /> Email me new results
        </label>
      </div>
      <button type="button" className="icon-btn" aria-label={`Delete ${s.name}`} onClick={async () => { try { await api.deleteSearch(s.id); onDelete(); toast('Search deleted'); } catch (err) { toast((err as Error).message); } }}><IconTrash size={18} /></button>
    </li>
  );
}
