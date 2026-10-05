const cache = new Map();

export async function loadJSON(path, options = {}) {
  const {
    cache: useCache = true,
    forceReload = false
  } = options;

  if (useCache && !forceReload && cache.has(path)) {
    return cache.get(path);
  }

  const response = await fetch(path, {
    cache: forceReload ? 'no-store' : 'default'
  });

  if (!response.ok) {
    throw new Error(
      `Data Center: gagal memuat ${path} (${response.status})`
    );
  }

  const data = await response.json();

  if (useCache) {
    cache.set(path, data);
  }

  return data;
}

export function clearDataCache() {
  cache.clear();
}
