import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

type SetScalar = (next: string | null) => void;
type SetList = (next: readonly string[]) => void;

function useUrlStateScalar(key: string): [string | null, SetScalar] {
  const [params, setParams] = useSearchParams();
  const value = params.get(key);
  const setter = useCallback<SetScalar>(
    (next) => {
      setParams(
        (prev) => {
          const np = new URLSearchParams(prev);
          if (next === null || next === '') np.delete(key);
          else np.set(key, next);
          return np;
        },
        { replace: true },
      );
    },
    [key, setParams],
  );
  return [value, setter];
}

function useUrlStateList(key: string): [string[], SetList] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const values = raw === null || raw === '' ? [] : raw.split(',');
  const setter = useCallback<SetList>(
    (next) => {
      setParams(
        (prev) => {
          const np = new URLSearchParams(prev);
          if (next.length === 0) np.delete(key);
          else np.set(key, next.join(','));
          return np;
        },
        { replace: true },
      );
    },
    [key, setParams],
  );
  return [values, setter];
}

// `Object.assign` gives us a single callable export with a `.list` property,
// typed correctly under strict TypeScript settings (no implicit-any errors when
// reading `useUrlState.list`).
export const useUrlState = Object.assign(useUrlStateScalar, { list: useUrlStateList });
