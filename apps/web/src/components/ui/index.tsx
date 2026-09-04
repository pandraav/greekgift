import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

/* ═══ Button ═══════════════════════════════════════════════════════════ */

const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-[3px] border font-semibold whitespace-nowrap transition-colors ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass ' +
    'disabled:pointer-events-none disabled:opacity-45 cursor-pointer',
  {
    variants: {
      variant: {
        // brass marks what you can act on
        brass:
          'border-brass-lo bg-gradient-to-b from-brass-hi to-brass text-wood-900 shadow-[0_1px_0_rgb(255_255_255/.4)_inset] hover:brightness-108',
        primary: 'border-black bg-ink text-paper hover:bg-black',
        // felt confirms
        felt: 'border-[#1E4230] bg-felt text-[#F2F8F4] hover:bg-felt-hi',
        ghost: 'border-rule bg-transparent text-ink hover:bg-ink/6',
        // lacquer warns
        danger:
          'border-lacquer/45 bg-transparent text-lacquer hover:border-lacquer hover:bg-lacquer hover:text-paper',
        // the only variant that sits on wood rather than paper
        onwood:
          'border-brass-hi/35 bg-white/7 text-paper hover:bg-white/13',
      },
      size: {
        sm: 'px-3 py-1.5 text-[13px]',
        md: 'px-[17px] py-[9px] text-[14.5px]',
        lg: 'px-6 py-3 text-base',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'ghost', size: 'md', block: false },
  },
);

export interface ButtonProps
  extends Omit<React.ComponentPropsWithoutRef<'button'>, 'color'>,
    VariantProps<typeof button> {}

export function Button({
  className,
  variant,
  size,
  block,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(button({ variant, size, block }), className)}
      {...props}
    />
  );
}

export const buttonClass = button;

/**
 * A Link that looks like a button. Simpler than a Radix-style `asChild`
 * slot, and there is no case here that needs the full polymorphism.
 */
export function LinkButton({
  className,
  variant,
  size,
  block,
  ...props
}: React.ComponentPropsWithoutRef<'a'> & VariantProps<typeof button>) {
  return (
    <a
      className={cn(button({ variant, size, block }), 'no-underline', className)}
      {...props}
    />
  );
}

/* ═══ Card ═════════════════════════════════════════════════════════════ */

export function Card({
  className,
  lift,
  ...props
}: React.ComponentPropsWithoutRef<'div'> & { lift?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-[5px] border border-black/35 bg-paper text-ink',
        lift ? 'shadow-lift' : 'shadow-paper',
        className,
      )}
      {...props}
    />
  );
}

export function CardHead({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn('border-b border-rule px-[22px] pt-[18px] pb-3.5', className)}
      {...props}
    />
  );
}

export function CardBody({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('px-[22px] py-5', className)} {...props} />;
}

export function CardFoot({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-b-[5px] border-t border-rule bg-paper-2 px-[22px] py-3.5',
        className,
      )}
      {...props}
    />
  );
}

/* ═══ Fields ═══════════════════════════════════════════════════════════ */

export function Field({
  label,
  help,
  error,
  htmlFor,
  children,
  className,
}: {
  label: string;
  help?: React.ReactNode;
  error?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink-2">
        {label}
      </label>
      {children}
      {help ? (
        <span
          className={cn('text-[12.5px]', error ? 'text-lacquer' : 'text-ink-3')}
        >
          {help}
        </span>
      ) : null}
    </div>
  );
}

const fieldBase =
  'w-full rounded-[3px] border bg-[#FFFDF6] px-3 py-2.5 text-[15px] text-ink ' +
  'shadow-[0_1px_2px_rgb(26_21_15/.06)_inset] placeholder:text-[#ABA189] ' +
  'focus:border-brass focus:ring-[3px] focus:ring-brass/22 focus:outline-none';

export function Input({
  className,
  invalid,
  ...props
}: React.ComponentPropsWithoutRef<'input'> & { invalid?: boolean }) {
  return (
    <input
      className={cn(
        fieldBase,
        invalid ? 'border-lacquer ring-[3px] ring-lacquer/14' : 'border-rule',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  invalid,
  ...props
}: React.ComponentPropsWithoutRef<'textarea'> & { invalid?: boolean }) {
  return (
    <textarea
      className={cn(
        fieldBase,
        'min-h-[92px] resize-y leading-relaxed',
        invalid ? 'border-lacquer ring-[3px] ring-lacquer/14' : 'border-rule',
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'select'>) {
  return (
    <select className={cn(fieldBase, 'pr-9', className)} {...props} />
  );
}

/** The `chess.com/` prefix treatment from the prototype. */
export function InputPrefix({
  prefix,
  className,
  ...props
}: React.ComponentPropsWithoutRef<'input'> & { prefix: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-mono text-[15px] text-ink-3">
        {prefix}
      </span>
      <Input
        className={cn('pl-[114px]', className)}
        spellCheck={false}
        {...props}
      />
    </div>
  );
}

/* ═══ Chip, Avatar, Notice ═════════════════════════════════════════════ */

const chip = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-xs font-semibold',
  {
    variants: {
      tone: {
        brass: 'border-brass/50 bg-brass/12 text-brass-lo',
        felt: 'border-felt/45 bg-felt/10 text-felt',
        lacquer: 'border-lacquer/40 bg-lacquer/9 text-lacquer',
        quiet: 'border-rule bg-paper-2 text-ink-3',
      },
    },
    defaultVariants: { tone: 'quiet' },
  },
);

export function Chip({
  className,
  tone,
  ...props
}: React.ComponentPropsWithoutRef<'span'> & VariantProps<typeof chip>) {
  return <span className={cn(chip({ tone }), className)} {...props} />;
}

const avatarSize = {
  sm: 'size-7 text-[11px]',
  md: 'size-[38px] text-[13px]',
  lg: 'size-14 text-lg',
  xl: 'size-[76px] text-2xl',
} as const;

export function Avatar({
  children,
  size = 'md',
  className,
}: {
  children: React.ReactNode;
  size?: keyof typeof avatarSize;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-wood-600 to-wood-900',
        'font-semibold tracking-[-.02em] text-brass-hi',
        'shadow-[0_0_0_1px_rgb(0_0_0/.4),0_1px_3px_rgb(0_0_0/.35)]',
        avatarSize[size],
        className,
      )}
    >
      {children}
    </span>
  );
}

const notice = cva('flex items-start gap-3 rounded-[3px] border px-4 py-3.5 text-sm leading-normal', {
  variants: {
    tone: {
      brass: 'border-brass/45 bg-brass/12 text-[#5E4415]',
      felt: 'border-felt/40 bg-felt/10 text-[#23472F]',
      lacquer: 'border-lacquer/40 bg-lacquer/9 text-[#7A2018]',
    },
  },
  defaultVariants: { tone: 'brass' },
});

export function Notice({
  icon,
  children,
  tone,
  className,
}: VariantProps<typeof notice> & {
  icon?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(notice({ tone }), className)}>
      {icon ? <span className="shrink-0 font-mono font-bold">{icon}</span> : null}
      <span>{children}</span>
    </div>
  );
}

/* ═══ Wordmark + eyebrow ═══════════════════════════════════════════════ */

export function Eyebrow({
  className,
  onWood,
  ...props
}: React.ComponentPropsWithoutRef<'p'> & { onWood?: boolean }) {
  return (
    <p
      className={cn(
        'font-mono text-[10.5px] tracking-[.16em] uppercase',
        onWood ? 'text-brass' : 'text-ink-3',
        className,
      )}
      {...props}
    />
  );
}

export function RuleOr({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3.5 font-mono text-xs tracking-[.12em] text-ink-3 uppercase">
      <span className="h-px flex-1 bg-rule" />
      {children}
      <span className="h-px flex-1 bg-rule" />
    </div>
  );
}
