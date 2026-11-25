const ID_FORMATS: Record<string, { groups: number[]; maxLength: number }> = {
  tin: { groups: [3, 3, 3, 3], maxLength: 15 },
  sss: { groups: [2, 7, 1], maxLength: 12 },
  philhealth: { groups: [2, 9, 1], maxLength: 14 },
  pagibig: { groups: [4, 4, 4], maxLength: 14 },
};

const governmentIdKey = (label: string) => label.toLowerCase().replace(/[^a-z]/g, '');

export function governmentIdMaxLength(label: string) {
  return ID_FORMATS[governmentIdKey(label)]?.maxLength;
}

export function formatGovernmentId(label: string, value: unknown) {
  const format = ID_FORMATS[governmentIdKey(label)];
  if (!format) return String(value ?? '');

  const digits = String(value ?? '').replace(/\D/g, '').slice(0, format.groups.reduce((sum, length) => sum + length, 0));
  let offset = 0;
  const parts: string[] = [];
  for (const length of format.groups) {
    if (offset >= digits.length) break;
    parts.push(digits.slice(offset, offset + length));
    offset += length;
  }
  return parts.join('-');
}
