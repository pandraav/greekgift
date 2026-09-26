import { Field, Input } from '@/components/ui';

export function AccountForm({ email }: { email: string }) {
  return (
    <Field label="Email" htmlFor="email" help="Changing this is not built yet.">
      <Input id="email" value={email} readOnly disabled />
    </Field>
  );
}
