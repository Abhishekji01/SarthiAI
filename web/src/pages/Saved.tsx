import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { OpportunityRow } from '../components/OpportunityRow';
import { Empty, ErrorState, Skeleton, TopBar } from '../components/ui';
import { IconBookmark } from '../components/icons';

export function Saved() {
  const { data, error, loading, reload } = useAsync(() => api.saved(), []);
  return (
    <div className="page">
      <TopBar title="Saved" back />
      {loading && !data ? <Skeleton /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.length ? (
        <Empty icon={<IconBookmark size={40} />} title="Nothing saved yet">Tap the bookmark on any opportunity. <Link to="/discover">Discover</Link></Empty>
      ) : <div className="stack">{data.map((o) => <OpportunityRow key={o.id} o={o} />)}</div>}
    </div>
  );
}
