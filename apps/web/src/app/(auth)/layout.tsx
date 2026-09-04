import { Mark } from '@/components/mark';
import { creator } from '@/lib/creator';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col px-5 py-10 sm:py-14">
      <div className="mb-7 flex justify-center">
        <Mark />
      </div>

      {children}

      <p className="mt-8 text-center text-[12.5px] text-paper/40">
        {creator.footer}
      </p>
    </main>
  );
}
