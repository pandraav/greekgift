'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui';
import { signOut } from '@/lib/auth-client';

export function SignOutButton({ label = 'Sign out' }: { label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await signOut();
        router.push('/login');
        router.refresh();
      }}
    >
      {busy ? 'Signing out…' : label}
    </Button>
  );
}
