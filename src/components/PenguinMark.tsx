import { useId, type SVGProps } from "react"

/** Face cut-out: two cheek lobes meeting in a rounded forehead notch over a wide chin. */
const PENGUIN_FACE =
  "M66 226C66 191 95 166 130 161C170 155 206 166 230 190Q256 214 282 190C306 166 342 155 382 161C417 166 446 191 446 226V300C446 394 360 456 256 456S66 394 66 300Z"
const PENGUIN_BEAK = "M196 296C222 276 290 270 318 288C326 294 325 305 319 313L270 389C264 399 252 399 246 389L196 315C190 307 190 301 196 296Z"

/**
 * danalytics penguin mark in `currentColor`, with the face cut out so it sits on any
 * surface. Traced from "Penguin" by Ayub Irawan (Noun Project icon 1798134, CC BY 3.0);
 * same geometry as public/favicon.svg.
 */
export function PenguinMark(props: SVGProps<SVGSVGElement>) {
  const mask = useId()
  return (
    <svg viewBox="24 30 464 464" fill="currentColor" aria-hidden="true" {...props}>
      <defs>
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
          <rect width="512" height="512" fill="#fff" />
          <path d={PENGUIN_FACE} fill="#000" />
        </mask>
      </defs>
      <circle cx="256" cy="262" r="226" mask={`url(#${mask})`} />
      <circle cx="144" cy="238" r="32" />
      <circle cx="368" cy="238" r="32" />
      <path d={PENGUIN_BEAK} />
    </svg>
  )
}
