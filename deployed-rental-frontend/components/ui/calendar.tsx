import * as React from "react"

import { cn } from "@/lib/utils"

interface CalendarProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  mode?: "single" | "multiple" | "range"
  selected?: Date | Date[] | { from: Date; to: Date }
  onSelect?: (date?: Date) => void
  initialFocus?: boolean
}

const Calendar = React.forwardRef<HTMLDivElement, CalendarProps>(
  ({ className, mode = "single", selected, onSelect, initialFocus, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("p-3 pointer-events-auto", className)}
        {...props}
      >
        <div className="flex flex-col space-y-4">
          <div className="text-center text-sm text-muted-foreground">
            日曆元件（簡化版）
          </div>
          <div className="grid grid-cols-7 gap-1">
            {["日", "一", "二", "三", "四", "五", "六"].map((day) => (
              <div key={day} className="text-center text-xs font-medium">
                {day}
              </div>
            ))}
            {Array.from({ length: 31 }).map((_, i) => (
              <div
                key={i}
                className="text-center p-1 text-sm hover:bg-accent rounded"
                onClick={() => onSelect?.(new Date())}
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }
)
Calendar.displayName = "Calendar"

export { Calendar }