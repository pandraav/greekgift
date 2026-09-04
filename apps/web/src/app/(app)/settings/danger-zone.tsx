'use client';

import { Button } from '@/components/ui';

export function DangerZone() {
  return (
    <Button
      variant="danger"
      onClick={() =>
        alert('Account deletion is not wired up yet — milestone 2.')
      }
    >
      Delete account
    </Button>
  );
}
