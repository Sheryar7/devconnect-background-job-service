export interface ParsedRecord {
  externalId: string;
  [key: string]: any;
}

export function parseCsvContent(csvString: string): ParsedRecord[] {
  if (!csvString || !csvString.trim()) {
    return [];
  }

  const lines = csvString
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''));
  const records: ParsedRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim().replace(/^["']|["']$/g, ''));
    const record: Record<string, any> = {};

    headers.forEach((header, index) => {
      record[header] = values[index] !== undefined ? values[index] : null;
    });

    const externalId =
      record['externalId'] ||
      record['external_id'] ||
      record['id'] ||
      record['sku'] ||
      `REC-${i}`;

    records.push({
      ...record,
      externalId: String(externalId),
    });
  }

  return records;
}
