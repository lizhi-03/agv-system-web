/** iOS 系统色板：按 AGV 编号稳定取色，地图与列表保持一致 */
export const AGV_COLORS = [
  '#0a84ff',
  '#30d158',
  '#ff9f0a',
  '#ff375f',
  '#bf5af2',
  '#64d2ff',
  '#ffd60a',
  '#30b0c7',
  '#ff6482',
  '#5e5ce6',
  '#ac8e68',
  '#8e8e93',
]

export function agvColor(code: string): string {
  let hash = 0
  for (let i = 0; i < code.length; i += 1) {
    hash = (hash * 31 + code.charCodeAt(i)) >>> 0
  }
  return AGV_COLORS[hash % AGV_COLORS.length]
}

/** #rrggbb → rgba() */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  const full =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value
  const parsed = Number.parseInt(full, 16)
  const r = (parsed >> 16) & 255
  const g = (parsed >> 8) & 255
  const b = parsed & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
