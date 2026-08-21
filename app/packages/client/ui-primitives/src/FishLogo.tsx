// QQ penguin mark used as the product mascot (sidebar rail + hero). Native
// 24×24; hero usage scales to 34. Fills are QQ brand colors so the penguin
// stays recognizable in both light and dark themes.

import type { IconProps } from './icons/props.ts'

/**
 * Inner penguin geometry in a 24×24 user space. Shared by {@link FishLogo}
 * and the sidebar wordmark so the mascot stays one drawing.
 */
export function QqPenguinGlyph() {
  return (
    <g>
      <ellipse cx="12" cy="13.35" rx="7.55" ry="8.05" fill="#1C1C1E" />
      <ellipse cx="12" cy="16.35" rx="4.7" ry="4.85" fill="#F4F8FC" />
      <ellipse cx="9.25" cy="9.55" rx="2.2" ry="2.55" fill="#FFFFFF" />
      <ellipse cx="14.75" cy="9.55" rx="2.2" ry="2.55" fill="#FFFFFF" />
      <circle cx="9.8" cy="10.05" r="0.95" fill="#1C1C1E" />
      <circle cx="15.3" cy="10.05" r="0.95" fill="#1C1C1E" />
      <circle cx="10.2" cy="9.55" r="0.32" fill="#FFFFFF" />
      <circle cx="15.7" cy="9.55" r="0.32" fill="#FFFFFF" />
      <path
        d="M10.45 11.55c.5 1.05 1.2 1.6 1.55 1.6s1.05-.55 1.55-1.6c.1-.22-.08-.4-.32-.4h-2.46c-.24 0-.42.18-.32.4Z"
        fill="#FFB000"
      />
      <path
        d="M7.15 13.15c1.45-1.05 3.15-1.6 4.85-1.6s3.4.55 4.85 1.6c-1.25.5-2.9.85-4.85.85s-3.6-.35-4.85-.85Z"
        fill="#E60012"
      />
      <path
        d="M15.55 13.55c.2.95.7 2.05.4 2.85-.18.5-.72.62-1 .28-.32-.4-.12-1.45.22-2.25.1-.22.28-.52.38-.88Z"
        fill="#C40010"
      />
      <ellipse cx="9.15" cy="21.4" rx="2.2" ry="1.05" fill="#FF9A00" />
      <ellipse cx="14.85" cy="21.4" rx="2.2" ry="1.05" fill="#FF9A00" />
    </g>
  )
}

/**
 * Render the QQ penguin logo.
 * @param props.size - width and height in px (default 24).
 * @param props.className - extra class for layout placement.
 * @returns the logo svg (aria-hidden; pair with the wordmark for accessibility).
 */
export function FishLogo({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <QqPenguinGlyph />
    </svg>
  )
}
