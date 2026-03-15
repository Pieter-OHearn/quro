import axios from 'axios';

const ABSOLUTE_URL_PATTERN = /^[a-z][a-z\d+.-]*:\/\//i;

export function resolveApiBaseUrl(rawBaseUrl?: string): string {
  const baseUrl = rawBaseUrl ?? import.meta.env.VITE_API_URL;
  const trimmedBaseUrl = baseUrl?.trim();
  if (!trimmedBaseUrl) return '';
  return trimmedBaseUrl.replace(/\/+$/, '');
}

export function buildApiUrl(path: string, rawBaseUrl?: string): string {
  if (ABSOLUTE_URL_PATTERN.test(path)) return path;

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const baseUrl = resolveApiBaseUrl(rawBaseUrl);

  return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
}

const apiBaseUrl = resolveApiBaseUrl();

export const api = axios.create({
  baseURL: apiBaseUrl || undefined,
  withCredentials: true,
});

const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

api.interceptors.request.use((config) => {
  if (!CSRF_SAFE_METHODS.has((config.method ?? '').toUpperCase())) {
    const token = document.cookie
      .split('; ')
      .find((row) => row.startsWith('csrf_token='))
      ?.split('=')[1];
    if (token) {
      config.headers['X-CSRF-Token'] = token;
    }
  }
  return config;
});
