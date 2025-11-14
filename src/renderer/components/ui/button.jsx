import { cn } from '../../lib/utils';

const variantStyles = {
  default:
    'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/20 hover:from-indigo-500 hover:to-purple-500 focus-visible:ring-indigo-500/50 dark:shadow-indigo-500/40',
  secondary:
    'bg-slate-100 text-slate-900 border border-slate-200 hover:bg-slate-200 focus-visible:ring-indigo-500/50 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700',
  outline:
    'border border-slate-200 text-slate-900 hover:border-slate-300 hover:bg-slate-50 focus-visible:ring-indigo-500/50 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-50 dark:hover:border-slate-600',
  ghost:
    'bg-transparent text-slate-900 hover:bg-slate-100 focus-visible:ring-indigo-500/50 dark:text-slate-50 dark:hover:bg-slate-900/50'
};

export function Button({ variant = 'default', className, ...props }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-70 disabled:pointer-events-none disabled:cursor-not-allowed',
        variantStyles[variant] ?? variantStyles.default,
        className
      )}
      {...props}
    />
  );
}
