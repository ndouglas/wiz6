export interface FormatTableOpts {
  numeric?: readonly boolean[];
}

export function formatTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  opts: FormatTableOpts = {},
): string {
  if (rows.length === 0) return headers.join('  ');
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)),
  );
  const align = opts.numeric ?? [];
  const renderRow = (cells: readonly string[]): string =>
    cells
      .map((cell, i) => {
        const w = widths[i]!;
        return align[i] ? cell.padStart(w) : cell.padEnd(w);
      })
      .join('  ');
  const lines = [renderRow(headers)];
  for (const row of rows) lines.push(renderRow(row));
  return lines.join('\n');
}
