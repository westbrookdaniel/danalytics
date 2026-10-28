import type { SVGProps } from "react"

/** danalytics mark: a rising frontier through four points on a rounded tile. Same drawing as public/favicon.svg. */
export function LogoMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <rect x="1" y="1" width="22" height="22" rx="6" className="fill-foreground" />
      <g className="fill-background stroke-background">
        <polyline points="6,16.5 10,11.5 13.5,13.5 18,7" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="6" cy="16.5" r="1.7" stroke="none" />
        <circle cx="10" cy="11.5" r="1.7" stroke="none" />
        <circle cx="13.5" cy="13.5" r="1.7" stroke="none" />
        <circle cx="18" cy="7" r="2.1" stroke="none" />
      </g>
    </svg>
  )
}
