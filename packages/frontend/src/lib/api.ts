import axios, { type AxiosRequestConfig } from 'axios';
import { LIST_PAGE_MAX_LIMIT, type ListPage } from '@quro/shared';

const ABSOLUTE_URL_PATTERN = /^[a-z][a-z\d+.-]*:\/\//i;
const UNAUTHORIZED_STATUS = 401;
const EXPECTED_AUTH_401_PATHS = new Set(['/api/auth/me', '/api/auth/signin']);

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export function registerUnauthorizedHandler(handler: UnauthorizedHandler): () => void {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null;
  };
}

export function notifyUnauthorizedResponse(status: number | undefined, url: string | undefined) {
  if (status !== UNAUTHORIZED_STATUS || !url) return;
  const path = new URL(url, 'http://quro.local').pathname;
  if (!EXPECTED_AUTH_401_PATHS.has(path)) unauthorizedHandler?.();
}

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

api.interceptors.response.use(undefined, (error: unknown) => {
  if (axios.isAxiosError(error)) {
    notifyUnauthorizedResponse(error.response?.status, error.config?.url);
  }
  return Promise.reject(error);
});

// Keep transport envelopes at the API boundary. T describes the JSON payload;
// endpoints with a different wire shape still normalize explicitly at the caller.
type ApiResponse<T> = { data: T };

export async function apiGet<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await api.get<ApiResponse<T>>(path, config);
  return response.data.data;
}

function rowId(row: unknown): unknown {
  return typeof row === 'object' && row !== null ? (row as { id?: unknown }).id : undefined;
}

// Pages are separate reads, so a row edited to a later position between two of them comes back
// twice; the later copy is the current one.
function keepLatestCopies<T>(rows: readonly T[]): T[] {
  const lastIndex = new Map<unknown, number>();
  rows.forEach((row, index) => {
    const id = rowId(row);
    if (id !== undefined) lastIndex.set(id, index);
  });
  return rows.filter((row, index) => {
    const id = rowId(row);
    return id === undefined || lastIndex.get(id) === index;
  });
}

/**
 * Reads every page of a paged list endpoint, following `nextCursor` until the server reports
 * the last page. Each request is bounded by the server's hard cap; the caller receives the
 * complete ordered result, so totals computed from it cover the whole ledger.
 */
export async function apiGetAllPages<T>(path: string, config?: AxiosRequestConfig): Promise<T[]> {
  const rows: T[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const params: Record<string, unknown> = {
      ...(config?.params as Record<string, unknown> | undefined),
      limit: LIST_PAGE_MAX_LIMIT,
    };
    if (cursor !== null) params.cursor = cursor;
    const response = await api.get<Partial<ListPage<T>>>(path, { ...config, params });
    rows.push(...(response.data.data ?? []));
    cursor = response.data.nextCursor ?? null;
    if (cursor !== null) {
      if (seenCursors.has(cursor)) throw new Error(`List pagination did not advance for ${path}`);
      seenCursors.add(cursor);
    }
  } while (cursor !== null);
  return keepLatestCopies(rows);
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await api.post<ApiResponse<T>>(path, body, config);
  return response.data.data;
}

export async function apiPatch<T>(
  path: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await api.patch<ApiResponse<T>>(path, body, config);
  return response.data.data;
}

export async function apiPut<T>(
  path: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await api.put<ApiResponse<T>>(path, body, config);
  return response.data.data;
}

export async function apiDelete<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await api.delete<ApiResponse<T>>(path, config);
  return response.data.data;
}

export function readApiErrorMessage(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const responseError = (error as { response?: { data?: { error?: unknown } } }).response?.data
    ?.error;
  return typeof responseError === 'string' ? responseError : null;
}

export function resolveApiErrorMessage(error: unknown, fallback: string): string {
  const apiError = readApiErrorMessage(error);
  if (apiError) return apiError;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
