/** Keep tokens within this tab, including across reloads. */
export function createTabAuthOptions(storage: Storage) {
  const storagePrefix = 'buenaventura_hris_auth_v2';
  // Supabase uses storageKey for BroadcastChannel and its lock as well. A unique
  // channel prevents another tab's SIGNED_IN event from replacing this user.
  const instanceId = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const storageKey = `${storagePrefix}-${instanceId}`;
  const tabKey = (key: string) => key.replace(storageKey, storagePrefix);
  return {
    storageKey,
    storage: {
      getItem: (key: string) => storage.getItem(tabKey(key)),
      setItem: (key: string, value: string) => storage.setItem(tabKey(key), value),
      removeItem: (key: string) => storage.removeItem(tabKey(key)),
    },
    persistSession: true,
    autoRefreshToken: true,
  };
}
