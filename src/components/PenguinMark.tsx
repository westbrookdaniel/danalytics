import { useId, type SVGProps } from "react"

/**
 * danalytics penguin mark in `currentColor`, with the face cut out so it sits on any
 * surface. Same geometry as public/favicon.svg.
 */
export function PenguinMark(props: SVGProps<SVGSVGElement>) {
  const mask = useId()
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <defs>
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
          <rect width="24" height="24" fill="#fff" />
          {/* Face: two cheeks over a rounder chin; their meeting point leaves the forehead notch. */}
          <circle cx="8.9" cy="12.4" r="4" fill="#000" />
          <circle cx="15.1" cy="12.4" r="4" fill="#000" />
          <circle cx="12" cy="15.8" r="5.2" fill="#000" />
        </mask>
      </defs>
      <path d="M4.2 13.2 3.3 20.4M19.8 13.2l.9 7.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4 11a8 8 0 0 1 16 0v3a8 8 0 0 1-16 0z" mask={`url(#${mask})`} />
      <circle cx="9.4" cy="13.1" r="1" />
      <circle cx="14.6" cy="13.1" r="1" />
      <path d="M11.2 15.7h1.6l-.8 1.1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}
