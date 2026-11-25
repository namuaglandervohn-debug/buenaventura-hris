export type RecruitmentStatusPalette = {
  bg: string;
  color: string;
  border: string;
  dot: string;
};

const RECRUITMENT_STATUS_PALETTES: Record<string, RecruitmentStatusPalette> = {
  interview: { bg: '#e5f2e9', color: '#14532d', border: '#8fbea0', dot: '#14532d' },
  hired: { bg: '#eff8f0', color: '#3f8f58', border: '#b8dfc0', dot: '#83c996' },
  pending: { bg: '#fff7df', color: '#946200', border: '#f0d27c', dot: '#e3ad45' },
  rejected: { bg: '#fdebea', color: '#a52c27', border: '#efb8b8', dot: '#c95c54' },
  withdrawn: { bg: '#eaf3fc', color: '#2e6eaa', border: '#b4d2ee', dot: '#5b8cbd' },
  neutral: { bg: '#f4f7f3', color: '#5f6e63', border: '#dce8da', dot: '#718176' },
};

export function recruitmentStatusPalette(status: string): RecruitmentStatusPalette {
  const normalized = String(status ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (normalized.includes('withdraw')) return RECRUITMENT_STATUS_PALETTES.withdrawn;
  if (normalized.includes('reject') || normalized.includes('not qualified') || normalized.includes('not hired')) {
    return RECRUITMENT_STATUS_PALETTES.rejected;
  }
  if (normalized.includes('interview')) return RECRUITMENT_STATUS_PALETTES.interview;
  if (normalized === 'hired' || (normalized.includes('hired') && !normalized.includes('not hired'))) {
    return RECRUITMENT_STATUS_PALETTES.hired;
  }
  if (['submitted', 'under review', 'missing requirements', 'pending review'].includes(normalized)) {
    return RECRUITMENT_STATUS_PALETTES.pending;
  }
  return RECRUITMENT_STATUS_PALETTES.neutral;
}

export function recruitmentStatusLabel(status: string) {
  return status === 'Submitted' ? 'Application Received' : status;
}
