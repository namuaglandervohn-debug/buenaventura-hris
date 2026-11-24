import { Button as BootstrapButton, Spinner } from 'react-bootstrap';
import type { MouseEvent } from 'react';
import { classes, element, forwardControl, simple } from './style';

export type ButtonProps = any;
export const Box = simple('div');
export const Paper = forwardControl<any>(({ elevation, square, variant, className, ...props }, ref) =>
  element('div', { ...props, ref, className: classes('hris-paper MuiPaper-root', className) }, {
    borderRadius: square ? 0 : '16px',
    boxShadow: elevation ? 1 : undefined,
    border: variant === 'outlined' ? '1px solid var(--bs-border-color)' : undefined,
  }));
export const Card = simple('div', 'card MuiCard-root');
export const CardContent = simple('div', 'card-body MuiCardContent-root');
export const Container = forwardControl<any>(({ maxWidth, disableGutters, ...props }, ref) =>
  element('div', { ...props, ref, className: classes('container', disableGutters && 'px-0', props.className) }, {
    maxWidth: maxWidth === false ? 'none' : ({ xs: 444, sm: 600, md: 900, lg: 1200, xl: 1536 } as any)[maxWidth],
  }));
export const Stack = forwardControl<any>(({ spacing, direction = 'column', divider, useFlexGap, ...props }, ref) =>
  element('div', { ...props, ref }, { display: 'flex', flexDirection: direction, gap: spacing }));
export const Grid = forwardControl<any>(({
  container, size, spacing, rowSpacing, columnSpacing, columns = 12, item, xs, sm, md, lg, xl, ...props
}, ref) => {
  const sizes = size != null ? (typeof size === 'object' ? size : { xs: size }) : { xs, sm, md, lg, xl };
  const width = Object.fromEntries(Object.entries(sizes).filter(([, v]) => v != null).map(([k, v]) => [k,
    typeof v === 'number' ? `calc((100% + var(--hris-grid-gap, 0px)) * ${v / (typeof columns === 'number' ? columns : 12)} - var(--hris-grid-gap, 0px))` : v === 'grow' ? 'auto' : v,
  ]));
  const gap = columnSpacing ?? spacing ?? 0;
  const variableGap = typeof gap === 'object'
    ? Object.fromEntries(Object.entries(gap).map(([k, value]) => [k, `${Number(value) * 8}px`])) : `${gap * 8}px`;
  return element('div', { ...props, ref, className: classes('hris-grid', props.className) }, {
    minWidth: 0, width: Object.keys(width).length ? width : undefined,
    ...(container ? { display: 'flex', flexWrap: 'wrap', rowGap: rowSpacing ?? spacing, columnGap: gap, '--hris-grid-gap': variableGap } : {}),
  });
});

const typography: Record<string, [string, string, number | undefined]> = {
  h1: ['h1', '3rem', 700], h2: ['h2', '2.5rem', 700], h3: ['h3', '2.25rem', 700],
  h4: ['h4', '2.125rem', undefined], h5: ['h5', '1.5rem', undefined], h6: ['h6', '1.25rem', undefined],
  subtitle1: ['p', '1rem', undefined], subtitle2: ['p', '.875rem', 500],
  body1: ['p', '1rem', undefined], body2: ['p', '.875rem', undefined],
  caption: ['span', '.75rem', undefined], overline: ['span', '.75rem', undefined],
};
export const Typography = forwardControl<any>(({
  variant = 'body1', gutterBottom, noWrap, paragraph, align, className, ...props
}, ref) => {
  const [tag, fontSize, fontWeight] = typography[variant] ?? typography.body1;
  return element(paragraph ? 'p' : tag, { ...props, ref, className: classes('hris-type MuiTypography-root', className) }, {
    fontSize, fontWeight, lineHeight: variant.startsWith('h') ? 1.25 : 1.5,
    marginBottom: paragraph ? '1rem' : gutterBottom ? '.35em' : 0, textAlign: align,
    ...(noWrap ? { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } : {}),
  });
});
const variantFor = (variant: string, color: string) => {
  const tone = color === 'error' ? 'danger' : color === 'inherit' ? 'secondary' : color;
  return variant === 'outlined' ? `outline-${tone}` : variant === 'contained' ? tone : 'link';
};
export const Button = forwardControl<any>(({
  variant = 'text', color = 'primary', size, startIcon, endIcon, fullWidth, disableElevation,
  disableRipple, disableFocusRipple, className, href, type, children, disabled, onClick, ...props
}, ref) => {
  const as = props.component ?? (href ? 'a' : undefined);
  return element(BootstrapButton, {
    ...props, component: undefined, ref, as, href, type: type ?? (as ? undefined : 'button'),
    disabled, 'aria-disabled': disabled || undefined,
    onClick: disabled ? (event: MouseEvent) => { event.preventDefault(); event.stopPropagation(); } : onClick,
    variant: variantFor(variant, color), size: size === 'small' ? 'sm' : size === 'large' ? 'lg' : undefined,
    className: classes('hris-button MuiButton-root', fullWidth && 'w-100', className),
    children: <>{startIcon && <span className="MuiButton-startIcon">{startIcon}</span>}{children}{endIcon && <span className="MuiButton-endIcon">{endIcon}</span>}</>,
  });
});
export const ButtonBase = forwardControl<any>(({ disableRipple, disableTouchRipple, focusRipple, ...props }, ref) =>
  element('button', { type: 'button', ...props, ref, className: classes('hris-button-base', props.className) }));
export const IconButton = forwardControl<any>(({ edge, size, color, disableRipple, ...props }, ref) =>
  element('button', { type: 'button', ...props, ref, className: classes('hris-icon-button MuiIconButton-root', props.className) }, {
    padding: size === 'small' ? '5px' : '8px', color: color === 'primary' ? 'primary.main' : color,
  }));
export const Link = forwardControl<any>(({ underline, ...props }, ref) =>
  element('a', { ...props, ref }, { textDecoration: underline === 'none' ? 'none' : undefined }));
export const Avatar = forwardControl<any>(({ src, alt, children, variant, imgProps, ...props }, ref) =>
  element('span', { ...props, ref, className: classes('hris-avatar MuiAvatar-root', props.className),
    children: src ? <img src={src} alt={alt ?? ''} {...imgProps} /> : children,
  }, { borderRadius: variant === 'square' ? 0 : variant === 'rounded' ? '9px' : '50%' }));
export const Chip = forwardControl<any>(({
  label, icon, avatar, deleteIcon, onDelete, clickable, size, variant, color, disabled, onClick, ...props
}, ref) => element('span', {
  ...props, ref, onClick: disabled ? undefined : onClick,
  role: onClick ? 'button' : undefined, tabIndex: onClick && !disabled ? 0 : undefined,
  'aria-disabled': disabled || undefined,
  onKeyDown: onClick ? (event: any) => { if (!disabled && ['Enter', ' '].includes(event.key)) { event.preventDefault(); onClick(event); } } : undefined,
  className: classes('badge hris-chip MuiChip-root', (clickable || onClick) && 'hris-chip-action', variant === 'outlined' && 'hris-chip-outline', props.className),
  children: <>{avatar}{icon && <span className="MuiChip-icon">{icon}</span>}<span className="MuiChip-label">{label}</span>
    {onDelete && <button type="button" className="hris-button-base MuiChip-deleteIcon" aria-label="Remove" onClick={event => { event.stopPropagation(); onDelete(event); }}>{deleteIcon ?? '×'}</button>}</>,
}, { fontSize: size === 'small' ? '.78rem' : '.875rem', opacity: disabled ? .6 : undefined, cursor: clickable || onClick ? 'pointer' : undefined,
  color: color ? `${color}.main` : undefined }));
export const Divider = forwardControl<any>(({ orientation, flexItem, light, textAlign, children, ...props }, ref) =>
  element(children || orientation === 'vertical' ? 'div' : 'hr', { ...props, ref, children,
    className: classes(orientation === 'vertical' ? 'vr' : undefined, 'MuiDivider-root', props.className),
  }));
export const CircularProgress = forwardControl<any>(({ size = 32, color, thickness, variant, value, ...props }, ref) =>
  element(Spinner, { ...props, ref, animation: 'border', role: 'status', 'aria-label': 'Loading' }, {
    width: size, height: size, borderWidth: thickness ? `${thickness / 2}px` : undefined, color: color && color !== 'inherit' ? `${color}.main` : undefined,
  }));
export const LinearProgress = forwardControl<any>(({ value, variant, color, ...props }, ref) =>
  element('div', { ...props, ref, role: 'progressbar', 'aria-valuenow': value, className: classes('progress MuiLinearProgress-root', props.className),
    children: <div className={classes('progress-bar MuiLinearProgress-bar', variant !== 'determinate' && 'progress-bar-striped progress-bar-animated')} style={{ width: `${value ?? 100}%` }} />,
  }));
export const Skeleton = forwardControl<any>(({ variant, animation, children, ...props }, ref) =>
  element('span', { ...props, ref, className: classes('placeholder-glow hris-skeleton', props.className), children }, { borderRadius: variant === 'circular' ? '50%' : variant === 'rounded' ? '8px' : 0 }));
export const AppBar = forwardControl<any>(({ elevation, color, position, ...props }, ref) =>
  element('header', { ...props, ref, className: classes('hris-app-bar MuiAppBar-root', props.className) }, { position, zIndex: 1030 }));
export const Toolbar = simple('div', 'hris-toolbar MuiToolbar-root');
export const List = forwardControl<any>(({ disablePadding, dense, subheader, children, ...props }, ref) =>
  element('ul', { ...props, ref, className: classes('list-unstyled MuiList-root', props.className), children: <>{subheader}{children}</> }, { paddingBlock: disablePadding ? 0 : '8px' }));
export const ListItem = forwardControl<any>(({ disablePadding, secondaryAction, divider, children, ...props }, ref) =>
  element('li', { ...props, ref, children: <>{children}{secondaryAction}</>, className: classes('MuiListItem-root', props.className) }, { padding: disablePadding ? 0 : '8px 16px' }));
export const ListItemButton = forwardControl<any>(({ selected, disabled, disableGutters, ...props }, ref) =>
  element(props.component ? 'div' : 'button', { type: props.component ? undefined : 'button', ...props, disabled,
    ref, className: classes('hris-list-button MuiListItemButton-root', selected && 'Mui-selected', props.className),
  }, { paddingInline: disableGutters ? 0 : undefined }));
export const ListItemIcon = simple('span', 'hris-list-icon MuiListItemIcon-root');
export const ListItemText = forwardControl<any>(({ primary, secondary, primaryTypographyProps, secondaryTypographyProps, inset, ...props }, ref) =>
  element('span', { ...props, ref, className: classes('hris-list-text MuiListItemText-root', props.className),
    children: <>{primary != null && <Typography component="span" className="MuiListItemText-primary" {...primaryTypographyProps}>{primary}</Typography>}
      {secondary != null && <Typography component="span" variant="body2" className="MuiListItemText-secondary" {...secondaryTypographyProps}>{secondary}</Typography>}</>,
  }, { paddingInlineStart: inset ? '48px' : undefined }));
export const Badge = forwardControl<any>(({ badgeContent, color = 'error', max = 99, showZero, invisible, variant, overlap, anchorOrigin, children, ...props }, ref) =>
  element('span', { ...props, ref, className: classes('hris-badge MuiBadge-root', props.className),
    children: <>{children}{!invisible && (variant === 'dot' || (badgeContent != null && (showZero || badgeContent !== 0))) &&
      <span className="badge MuiBadge-badge" style={{ backgroundColor: color === 'error' ? '#b73e2d' : '#1f7a47' }}>
        {variant === 'dot' ? '' : typeof badgeContent === 'number' && badgeContent > max ? `${max}+` : badgeContent}
      </span>}</>,
  }));
