import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { useSession, useUser } from '../lib/session';
import type { User } from '../lib/types';
import { useToast } from './ui';

/** The student's chosen places, closest first. Mirrors userPlaces() on the server. */
export const placesOf = (user: User) => [...(user.profile.preferredLocations ?? []), ...(user.profile.homeState ? [user.profile.homeState] : [])]
  .filter((p) => p.trim() && !/^(remote|online|anywhere|india|pan india)$/i.test(p.trim()));

/** Asks for a city so "near me" has something to go on. Saved as the first preferred location. */
export function CityPrompt({ onDone }: { onDone?: () => void }) {
  const user = useUser();
  const { setUser } = useSession();
  const toast = useToast();
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const c = city.trim();
    if (!c) return;
    setBusy(true);
    try {
      const rest = (user.profile.preferredLocations ?? []).filter((p) => p.toLowerCase() !== c.toLowerCase()).slice(0, 9);
      setUser(await api.updateProfile({ profile: { preferredLocations: [c, ...rest] } }));
      onDone?.();
    } catch (err) { toast((err as Error).message); } finally { setBusy(false); }
  };

  return (
    <form className="card soft" onSubmit={save}>
      <label className="small" htmlFor="near-city"><strong>Where are you based?</strong> We’ll show what’s near you first.</label>
      <div className="row" style={{ marginTop: 8 }}>
        <input id="near-city" className="input grow" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City, e.g. Pune" autoComplete="address-level2" maxLength={60} />
        <button className="btn small" disabled={busy || !city.trim()}>Save</button>
      </div>
    </form>
  );
}
