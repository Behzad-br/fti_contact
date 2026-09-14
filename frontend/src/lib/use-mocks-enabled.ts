import { useEffect, useState } from 'react';
import { mocksFlag } from '@/lib/mocks-api';

export function useMocksEnabled() {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    mocksFlag()
      .then((row) => setEnabled(Boolean(row.enabled)))
      .catch(() => setEnabled(false));
  }, []);
  return enabled;
}
