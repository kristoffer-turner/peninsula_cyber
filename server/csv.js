// Cells come from public form submissions, so a name like "=HYPERLINK(...)"
// would run as a formula when the export is opened in Excel/Sheets. A leading
// apostrophe makes spreadsheets treat it as plain text.
function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvCell).join(','));
  }
  return lines.join('\n') + '\n';
}

module.exports = { csvCell, toCsv };
