import { useEffect } from 'react';

export const APP_NAME = 'SarthiAI';

/** Sets the browser tab title, e.g. "Find · SarthiAI". Without a title: just "SarthiAI". */
export function usePageTitle(title?: string | null) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [title]);
}
