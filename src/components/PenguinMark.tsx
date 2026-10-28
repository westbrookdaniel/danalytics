import { useId, type SVGProps } from "react"

const FACE = "M237 225c-11-15-24-22-41-22-24 0-39 22-39 52 0 65 35 117 80 117s80-52 80-117c0-30-15-52-39-52-17 0-30 7-41 22z"

/**
 * danalytics penguin mark in `currentColor`, with the face cut out so it sits on any
 * surface. Same geometry as public/favicon.svg.
 */
export function PenguinMark(props: SVGProps<SVGSVGElement>) {
  const mask = useId()
  return (
    <svg viewBox="104 118 266 284" fill="currentColor" aria-hidden="true" {...props}>
      <defs>
        <mask id={mask} maskUnits="userSpaceOnUse" x="104" y="118" width="266" height="284">
          <rect x="104" y="118" width="266" height="284" fill="#fff" />
          <path d={FACE} fill="#000" />
        </mask>
      </defs>
      <path d="M134 250 124 378M340 250l10 128" fill="none" stroke="currentColor" strokeWidth="20" strokeLinecap="round" />
      <path d="M134 233a103 103 0 0 1 206 0v47c0 64-46 112-103 112S134 344 134 280z" mask={`url(#${mask})`} />
      <path d="M216 198c13 14 16 32 17 104h8c1-72 4-90 17-104z" />
      <circle cx="188" cy="266" r="12" />
      <circle cx="286" cy="266" r="12" />
      <path d="M219 306h36l-18 18z" stroke="currentColor" strokeWidth="10" strokeLinejoin="round" />
    </svg>
  )
}
