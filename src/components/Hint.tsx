import type { ReactElement, ReactNode } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/** Explains a control on hover/focus. `children` must be a single focusable element. */
export function Hint({ content, side = "bottom", children }: { content: ReactNode; side?: "top" | "bottom" | "left" | "right"; children: ReactElement }) {
  return (
    <Tooltip delayDuration={250}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="max-w-64 text-[12px] leading-snug">
        {content}
      </TooltipContent>
    </Tooltip>
  )
}
