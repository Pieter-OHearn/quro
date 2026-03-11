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
