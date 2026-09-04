import { LoginForm } from './login-form';

export const metadata = { title: 'Log in · greekgift' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; verified?: string }>;
}) {
  const { next, verified } = await searchParams;
  return <LoginForm next={next} justVerified={verified === '1'} />;
}
