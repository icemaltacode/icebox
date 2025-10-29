const STORAGE_KEY = 'icebox_vle_long_token';

export const getStoredVleToken = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export const setStoredVleToken = (token: string | null) => {
  try {
    if (token) {
      localStorage.setItem(STORAGE_KEY, token);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
};

export const getVleAuthToken = (): string | null => getStoredVleToken();
