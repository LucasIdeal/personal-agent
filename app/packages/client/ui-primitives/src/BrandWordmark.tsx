// QQ assistant wordmark: penguin + product name + 答辩 badge. Native 138×24
// so the sidebar brand row keeps its original slot. Name ink rides
// currentColor; the penguin and badge stay in QQ colors.

import type { IconProps } from './icons/props.ts'
import { QqPenguinGlyph } from './FishLogo.tsx'

const WORDMARK_FONT = "ui-sans-serif, system-ui, 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC', sans-serif"

/**
 * Render the full brand wordmark.
 * @param props.size - height in px (default 24; width keeps the 138:24 ratio).
 * @param props.className - extra class for layout placement.
 * @returns the wordmark svg (aria-hidden decorative brand art).
 */
export function BrandWordmark({ size = 24, className }: IconProps) {
  return (
    <svg
      width={(size * 138) / 24}
      height={size}
      className={className}
      viewBox="0 0 138 24"
      fill="none"
      aria-hidden="true"
    >
      <g transform="translate(0,1) scale(0.92)">
        <QqPenguinGlyph />
      </g>
      <text
        x="28"
        y="16.5"
        fill="currentColor"
        fontFamily={WORDMARK_FONT}
        fontSize="13"
        fontWeight="650"
        letterSpacing="0.2"
      >
        智能助理
      </text>
      <rect x="88" y="5" width="46" height="14" rx="3" fill="#12B7F5" />
      <text
        x="111"
        y="15.2"
        fill="#FFFFFF"
        fontFamily={WORDMARK_FONT}
        fontSize="9"
        fontWeight="700"
        textAnchor="middle"
      >
        部门答辩
      </text>
    </svg>
  )
}
