export const v2Tokens = {
  colors: {
    bg: '#05070D',
    surface: 'rgba(255, 255, 255, 0.06)',
    surface2: 'rgba(255, 255, 255, 0.08)',
    border: 'rgba(255, 255, 255, 0.10)',
    text: '#EAF0FF',
    muted: 'rgba(234, 240, 255, 0.70)',
    accentCyan: '#00F5FF',
    accentPurple: '#A855F7',
    danger: '#FB7185',
    success: '#34D399',
    warning: '#FBBF24',
  },
  radii: {
    xl: '18px',
    lg: '14px',
    md: '12px',
  },
  shadows: {
    glow: '0 0 0 1px rgba(0,245,255,0.10), 0 12px 40px rgba(0,0,0,0.55)',
    soft: '0 10px 30px rgba(0,0,0,0.35)',
  },
} as const;

export type V2Tokens = typeof v2Tokens;

export function v2CssVars(tokens: V2Tokens = v2Tokens) {
  return {
    ['--v2-bg' as any]: tokens.colors.bg,
    ['--v2-surface' as any]: tokens.colors.surface,
    ['--v2-surface2' as any]: tokens.colors.surface2,
    ['--v2-border' as any]: tokens.colors.border,
    ['--v2-text' as any]: tokens.colors.text,
    ['--v2-muted' as any]: tokens.colors.muted,
    ['--v2-accent-cyan' as any]: tokens.colors.accentCyan,
    ['--v2-accent-purple' as any]: tokens.colors.accentPurple,
    ['--v2-danger' as any]: tokens.colors.danger,
    ['--v2-success' as any]: tokens.colors.success,
    ['--v2-warning' as any]: tokens.colors.warning,
    ['--v2-radius-xl' as any]: tokens.radii.xl,
    ['--v2-radius-lg' as any]: tokens.radii.lg,
    ['--v2-radius-md' as any]: tokens.radii.md,
    ['--v2-shadow-glow' as any]: tokens.shadows.glow,
    ['--v2-shadow-soft' as any]: tokens.shadows.soft,
  } as import('react').CSSProperties;
}

