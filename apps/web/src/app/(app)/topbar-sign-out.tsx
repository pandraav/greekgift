'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui';
import { signOut } from '@/lib/auth-client';

export function TopbarSignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="onwood"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await signOut();
        router.push('/login');
        router.refresh();
      }}
    >
      Log out
    </Button>
  );
}
