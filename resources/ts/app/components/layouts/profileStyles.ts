import { accountColors } from './accountColors';

const border = 'rgba(139, 184, 144, 0.24)';
const borderStrong = 'rgba(73, 156, 92, 0.32)';

export const profileCardSx = {
  borderRadius: '26px',
  border: `1px solid ${border}`,
  background: 'rgba(255, 255, 255, 0.92)',
  boxShadow: '0 20px 55px rgba(43, 91, 55, 0.10)',
};

export const profileDetailsSx = {
  borderRadius: '20px',
  border: `1px solid ${border}`,
  background: 'rgba(245, 252, 241, 0.88)',
  boxShadow: '0 12px 28px rgba(43, 91, 55, 0.08)',
};

export const profileFieldSx = {
  '& .MuiOutlinedInput-root': {
    backgroundColor: '#fbfef9',
    transition: 'all 180ms ease',
    '& fieldset': { borderColor: border },
    '&:hover fieldset': { borderColor: borderStrong },
    '&.Mui-focused fieldset': { borderColor: '#3aa865', borderWidth: 1.5 },
    '&.Mui-disabled': { backgroundColor: '#f6fbf4' },
  },
  '& .MuiInputLabel-root': { color: '#6c7d70' },
  '& .MuiInputBase-input.Mui-disabled': { WebkitTextFillColor: '#1e2d24' },
  '& .MuiFormHelperText-root': { color: '#6c7d70' },
};
export const profileHeroSx = {
  ...profileCardSx,
  p: { xs: 2, sm: 2.75, md: 3.25 },
  mb: 2.5,
  position: 'relative',
  overflow: 'hidden',
  background: accountColors.dashboardHeading,
  '&:before': {
    content: '""', position: 'absolute', width: 260, height: 260,
    borderRadius: '50%', right: -90, top: -110, background: 'rgba(76, 175, 80, 0.12)',
  },
  '&:after': {
    content: '""', position: 'absolute', width: 160, height: 160,
    borderRadius: '50%', left: { xs: '70%', md: '44%' }, bottom: -95, background: 'rgba(174, 222, 144, 0.18)',
  },
};

export const profileAvatarSx = {
  width: { xs: 68, sm: 82 },
  height: { xs: 68, sm: 82 },
  bgcolor: '#3aa865',
  color: '#fff',
  fontSize: { xs: '1.45rem', sm: '1.85rem' },
  fontWeight: 700,
  border: '4px solid rgba(255,255,255,0.84)',
  boxShadow: '0 18px 34px rgba(31, 122, 70, 0.20)',
  flexShrink: 0,
};

export const profileIconSx = {
  width: 42,
  height: 42,
  borderRadius: '16px',
  display: 'grid',
  placeItems: 'center',
  bgcolor: '#e6f8e9',
  color: '#1f7a46',
  flexShrink: 0,
};
