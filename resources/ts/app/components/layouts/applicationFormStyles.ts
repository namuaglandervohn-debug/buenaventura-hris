const applicationControlSx = {
  paddingBlock: { xs: '14px', sm: '16px' },
  paddingInlineStart: { xs: '14px', sm: '15px' },
  fontSize: { xs: '0.9rem', sm: '0.95rem' },
  fontWeight: 400,
  color: '#1f2937',
};

export const applicationTextFieldSx = {
  '& .MuiInputLabel-root.Mui-focused': { color: '#000000', fontWeight: 400 },
  '& .MuiInputLabel-root.Mui-disabled': { color: '#000000', fontWeight: 400, opacity: 0.72 },
  '& .MuiInputLabel-asterisk': { color: '#000000' },
  '& .hris-field': {
    backgroundColor: '#fbfefc',
    transition: 'all 0.25s ease',
    boxShadow: '0 6px 16px rgba(15, 23, 42, 0.025)',
    '& > input, & > textarea': { ...applicationControlSx, paddingInlineEnd: applicationControlSx.paddingInlineStart },
    '& > .form-select': applicationControlSx,
    '& fieldset': { borderColor: 'rgba(22, 101, 52, 0.14)', borderWidth: '1px' },
    '&:hover': { backgroundColor: '#ffffff', boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)' },
    '&:hover fieldset': { borderColor: 'rgba(34, 197, 94, 0.46)' },
    '&.Mui-focused': { backgroundColor: '#ffffff', boxShadow: '0 0 0 5px rgba(34,197,94,0.10), 0 12px 28px rgba(15,23,42,0.06)' },
    '&.Mui-focused fieldset': { borderColor: '#22c55e', borderWidth: '1.5px' },
  },
  '& .MuiFormHelperText-root': {
    mx: { xs: 0.5, sm: 1.75 },
    overflowWrap: 'anywhere',
    fontWeight: 600,
  },
};

export const applicationButtonSx = {
  textTransform: 'none',
  fontWeight: 700,
  borderRadius: '16px',
  minHeight: { xs: 46, sm: 52 },
  px: { xs: 2.5, sm: 4 },
  lineHeight: 1.25,
  whiteSpace: 'normal',
  overflowWrap: 'anywhere',
  textAlign: 'center',
  letterSpacing: '-0.01em',
  transition: 'all 0.25s ease',
  boxShadow: '0 12px 28px rgba(31,122,71,0.14)',
  '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 16px 34px rgba(31,122,71,0.20)' },
};

export const applicationSecondaryButtonSx = {
  ...applicationButtonSx, borderColor: '#166534', color: '#166534', background: '#ffffff',
};

export const applicationPrimaryButtonSx = {
  ...applicationButtonSx,
  backgroundImage: 'var(--hris-primary-gradient)',
  boxShadow: '0 12px 25px rgba(22,101,52,0.25)',
  '&:hover': { ...applicationButtonSx['&:hover'], backgroundImage: 'var(--hris-primary-hover-gradient)' },
  '&:focus-visible, &:active': { backgroundImage: 'var(--hris-primary-hover-gradient)' },
  '&:disabled, &[aria-disabled="true"]': { backgroundImage: 'none' },
};
