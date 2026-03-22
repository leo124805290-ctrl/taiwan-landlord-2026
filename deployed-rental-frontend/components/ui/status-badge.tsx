import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface StatusBadgeProps {
  status: string;
  children?: ReactNode;
  className?: string;
}

export default function StatusBadge({ status, children, className }: StatusBadgeProps) {
  const statusConfig = {
    完成: {
      color: 'bg-green-100 text-green-800 border-green-200',
      dot: 'bg-green-500',
    },
    建置中: {
      color: 'bg-blue-100 text-blue-800 border-blue-200',
      dot: 'bg-blue-500',
    },
    待開始: {
      color: 'bg-gray-100 text-gray-800 border-gray-200',
      dot: 'bg-gray-500',
    },
    錯誤: {
      color: 'bg-red-100 text-red-800 border-red-200',
      dot: 'bg-red-500',
    },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.待開始;

  return (
    <span
      className={cn(
        'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border',
        config.color,
        className
      )}
    >
      <span className={cn('w-2 h-2 rounded-full mr-2', config.dot)}></span>
      {children || status}
    </span>
  );
}