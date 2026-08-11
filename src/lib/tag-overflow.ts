/**
 * Returns the largest number of items that fit within `maxRows`, while
 * reserving space for the exact "+N נוספים" indicator when items are hidden.
 * Widths must be measured from the rendered elements using the same styles as
 * the visible list.
 */
export function visibleItemCountForRows(
  itemWidths: number[],
  containerWidth: number,
  moreIndicatorWidths: Record<number, number>,
  maxRows: number,
  gap: number,
): number {
  if (itemWidths.length === 0 || containerWidth <= 0 || maxRows <= 0) return 0;

  const rowsNeeded = (widths: number[]) => {
    let rows = 1;
    let used = 0;
    for (const width of widths) {
      if (used > 0 && used + gap + width > containerWidth) {
        rows += 1;
        used = width;
      } else {
        used += (used > 0 ? gap : 0) + width;
      }
    }
    return rows;
  };

  if (rowsNeeded(itemWidths) <= maxRows) return itemWidths.length;

  for (let visible = itemWidths.length - 1; visible >= 0; visible -= 1) {
    const hidden = itemWidths.length - visible;
    const moreWidth = moreIndicatorWidths[hidden] ?? 0;
    if (rowsNeeded([...itemWidths.slice(0, visible), moreWidth]) <= maxRows) return visible;
  }

  return 0;
}
