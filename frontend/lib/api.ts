const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

interface RequestOptions extends RequestInit {
  requiresAuth?: boolean;
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<{ data: T; status: number; latencyMs: number }> {
  const { requiresAuth = true, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (requiresAuth && typeof window !== 'undefined') {
    const token = localStorage.getItem('auth_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const url = `${API_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const startTime = performance.now();

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
    });

    const latencyMs = Math.round(performance.now() - startTime);

    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }

    let data: any = {};
    const text = await response.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text };
      }
    }

    if (!response.ok) {
      throw new ApiError(
        data.message || `Request failed with status ${response.status}`,
        response.status,
        data,
      );
    }

    return { data: data as T, status: response.status, latencyMs };
  } catch (error: any) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      error.message || 'Network connection error. Is the backend API running?',
      0,
    );
  }
}

export const api = {
  // Auth
  register: (email: string, password: string) =>
    apiRequest<{ user: { id: string; email: string }; accessToken: string }>(
      '/auth/register',
      { method: 'POST', body: JSON.stringify({ email, password }), requiresAuth: false },
    ),

  login: (email: string, password: string) =>
    apiRequest<{ user: { id: string; email: string }; accessToken: string }>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }), requiresAuth: false },
    ),

  // Jobs
  submitImportJob: (payload: { records?: any[]; csvContent?: string }) =>
    apiRequest<{ jobId: string; status: string; totalRows: number; message: string; createdAt: string }>(
      '/jobs/import',
      { method: 'POST', body: JSON.stringify(payload) },
    ),

  getJob: (jobId: string) =>
    apiRequest<import('./types').Job>(`/jobs/${jobId}`, { method: 'GET' }),

  getMyJobs: () =>
    apiRequest<import('./types').Job[]>('/jobs', { method: 'GET' }),

  getJobRecords: (jobId: string) =>
    apiRequest<import('./types').ImportedRecord[]>(`/jobs/${jobId}/records`, { method: 'GET' }),
};
