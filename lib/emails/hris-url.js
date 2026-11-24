export function getHrisEmailUrl(env, path) {
  const deployment = env.VERCEL_ENV === 'production'
    ? env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL
    : env.VERCEL_URL;
  const origin = env.HRIS_EMAIL_ORIGIN?.trim() || (deployment && `https://${deployment}`) || env.APP_URL?.trim();
  if (!origin) return null;

  try {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return new URL(path, url.origin).href;
  } catch {
    return null;
  }
}
