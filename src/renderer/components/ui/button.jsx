import { cn } from '../../lib/utils';

const variantStyles = {
  default: 'bg-purple-600 text-white hover:bg-purple-500 focus-visible:ring-purple-500',
  ghost: 'bg-transparent hover:bg-slate-100 text-slate-900 focus-visible:ring-purple-500',
  outline: 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-900 focus-visible:ring-purple-500',
  secondary: 'bg-slate-50 text-slate-900 border border-slate-200 hover:bg-slate-100 focus-visible:ring-purple-500'
};

export function Button({ variant = 'default', className, ...props }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none',
        variantStyles[variant] ?? variantStyles.default,
        className
      )}
      {...props}
    />
  );
}
