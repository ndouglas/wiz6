import { useEffect, useState } from 'react';
import { PicSchema, type Pic } from '@wiz6/data';

interface PicState {
  data: Pic | null;
  loading: boolean;
  error: Error | null;
}

export function usePic(id: string | null): PicState {
  const [state, setState] = useState<PicState>({ data: null, loading: !!id, error: null });

  useEffect(() => {
    if (!id) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/pics/${id}.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (text.trimStart().startsWith('<')) {
          throw new Error(
            `expected JSON at /pics/${id}.json but got HTML — run \`pnpm extract\` to generate extracted/ assets.`,
          );
        }
        const parsed = PicSchema.parse(JSON.parse(text));
        if (!cancelled) setState({ data: parsed, loading: false, error: null });
      } catch (err) {
        if (!cancelled) setState({ data: null, loading: false, error: err as Error });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return state;
}
