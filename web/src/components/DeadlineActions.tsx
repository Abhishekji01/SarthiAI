import { useState } from 'react';
import { api } from '../lib/api';
import { isNative, openExternal } from '../lib/platform';
import { googleCalendarUrl } from '../lib/format';
import type { Opportunity } from '../lib/types';
import { IconBell, IconCalendar } from './icons';
import { useToast } from './ui';
import { publicUrl } from './OpportunityFacts';

/**
 * Reminders that work when SarthiAI is closed: put the deadline in the phone's
 * calendar, or (no deadline yet) ask to be told when the dates are announced.
 */
export function DeadlineActions({ o, onChange }: { o: Opportunity; onChange: (patch: Partial<Opportunity>) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (o.availability === 'closed') return null;

  if (!o.deadline) {
    const watching = Boolean(o.watchingDates);
    const toggle = async () => {
      setBusy(true);
      try {
        if (watching) { await api.unwatchDates(o.id); onChange({ watchingDates: false }); toast('You won’t be notified about dates'); }
        else { await api.watchDates(o.id); onChange({ watchingDates: true, isSaved: true }); toast('Saved. We’ll tell you when the dates are announced'); }
      } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
    };
    return (
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <button type="button" className={`btn small ${watching ? '' : 'secondary'}`} aria-pressed={watching} onClick={toggle} disabled={busy}>
          <IconBell size={16} /> {watching ? 'You’ll be notified when dates are announced' : 'Notify me when dates are announced'}
        </button>
      </div>
    );
  }

  const downloadIcs = async () => {
    try {
      // Android: the browser downloads the file and offers to open it in the calendar app
      // (public listings; campus-only listings can use Google Calendar).
      if (isNative) return o.collegeId ? toast('Use Google Calendar for campus listings in the app') : openExternal(api.publicCalendarUrl(o.id));
      const text = await api.calendarIcs(o.id);
      const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `sarthiai-deadline-${o.id}.ics`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { toast((e as Error).message); }
  };
  const google = googleCalendarUrl(o, publicUrl(`/opportunity/${o.id}`));
  return (
    <div className="row wrap" style={{ gap: 8, marginBottom: 12 }} aria-label="Add the deadline to your calendar" role="group">
      <button type="button" className="btn small secondary" onClick={downloadIcs}><IconCalendar size={16} /> Add to calendar (.ics)</button>
      {google && <button type="button" className="btn small secondary" onClick={() => openExternal(google)}><IconCalendar size={16} /> Google Calendar</button>}
    </div>
  );
}
