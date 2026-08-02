// Client API pour communiquer avec le backend FastAPI
// Configuration pour Vercel: frontend et backend sur la même origine

import { User, Match, Team, Saison, Stats, StatsSalle, AppInfo, Indispo } from './types';

const getApiUrl = (path: string, params?: Record<string, string | number>): string => {
  if (typeof window !== 'undefined') {
    const url = new URL(path, window.location.origin);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) url.searchParams.append(key, String(value));
      });
    }
    return url.toString();
  }
  // SSR: utilise localhost:3000 (Next.js) ou configure selon ton env
  const url = new URL(path, 'http://localhost:3000');
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.append(key, String(value));
    });
  }
  return url.toString();
};

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: number;
}

// ==================== AUTHENTIFICATION ====================

export async function login(username: string, password: string): Promise<ApiResponse<User>> {
  const response = await fetch(getApiUrl('/api/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Erreur de connexion' }));
    return { error: error.detail, status: response.status };
  }
  const data = await response.json().catch(() => null);
  return { data, status: response.status };
}

export async function logout(token: string): Promise<ApiResponse<void>> {
  const response = await fetch(getApiUrl('/api/logout'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `token=${token}`,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Erreur' }));
    return { error: error.detail, status: response.status };
  }
  return { status: response.status };
}

export async function getMe(token: string): Promise<ApiResponse<any>> {
  const response = await fetch(getApiUrl('/api/me', { token }));
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Token invalide' }));
    return { error: error.detail, status: response.status };
  }
  const data = await response.json().catch(() => null);
  return { data, status: response.status };
}

// ==================== SAISONS ====================

export async function getSaisons(): Promise<ApiResponse<any[]>> {
  const response = await fetch(getApiUrl('/api/saisons'));
  if (!response.ok) return { error: 'Erreur', status: response.status };
  const data = await response.json();
  return { data: Array.isArray(data) ? data : [], status: response.status };
}

export async function setCurrentSaison(saison: string, token: string): Promise<ApiResponse<void>> {
  const response = await fetch(getApiUrl('/api/saisons/current'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `saison=${saison}&token=${token}`,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Erreur' }));
    return { error: error.detail, status: response.status };
  }
  return { status: response.status };
}

// ==================== MATCHS ====================

export async function getMatches(params?: { saison?: string; salle?: string; journee?: number; limit?: number; offset?: number }): Promise<ApiResponse<any[]>> {
  const response = await fetch(getApiUrl('/api/matches', params));
  if (!response.ok) return { error: 'Erreur', status: response.status };
  const data = await response.json();
  return { data: Array.isArray(data) ? data : [], status: response.status };
}

export async function getMatchById(matchId: number): Promise<ApiResponse<any>> {
  const response = await fetch(getApiUrl(`/api/matches/${matchId}`));
  if (!response.ok) return { error: 'Erreur', status: response.status };
  return { data: await response.json(), status: response.status };
}

export async function createMatch(match: any, token: string): Promise<ApiResponse<any>> {
  const formData = new URLSearchParams();
  Object.entries(match).forEach(([key, value]) => {
    if (value !== undefined) formData.append(key, String(value));
  });
  formData.append('token', token);
  const response = await fetch(getApiUrl('/api/matches'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  });
  if (!response.ok) return { error: 'Erreur', status: response.status };
  return { data: await response.json(), status: response.status };
}

export async function updateMatch(matchId: number, match: any, token: string): Promise<ApiResponse<any>> {
  const formData = new URLSearchParams();
  Object.entries(match).forEach(([key, value]) => {
    if (value !== undefined) formData.append(key, String(value));
  });
  formData.append('token', token);
  const response = await fetch(getApiUrl(`/api/matches/${matchId}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  });
  if (!response.ok) return { error: 'Erreur', status: response.status };
  return { data: await response.json(), status: response.status };
}

export async function deleteMatch(matchId: number, token: string): Promise<ApiResponse<void>> {
  const response = await fetch(getApiUrl(`/api/matches/${matchId}`), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `token=${token}`,
  });
  if (!response.ok) return { error: 'Erreur', status: response.status };
  return { status: response.status };
}

// ==================== STATS ====================

export async function getStats(params?: { saison?: string }): Promise<ApiResponse<any>> {
  const response = await fetch(getApiUrl('/api/stats', params));
  if (!response.ok) return { error: 'Erreur', status: response.status };
  return { data: await response.json(), status: response.status };
}

export async function getStatsBySalle(params?: { saison?: string }): Promise<ApiResponse<any[]>> {
  const response = await fetch(getApiUrl('/api/stats/salles', params));
  if (!response.ok) return { error: 'Erreur', status: response.status };
  const data = await response.json();
  return { data: Array.isArray(data) ? data : [], status: response.status };
}

// ==================== EQUIPES ====================

export async function getTeams(): Promise<ApiResponse<any[]>> {
  const response = await fetch(getApiUrl('/api/teams'));
  if (!response.ok) return { error: 'Erreur', status: response.status };
  const data = await response.json();
  return { data: Array.isArray(data) ? data : [], status: response.status };
}

// ==================== SALLES ====================

export async function getSalles(): Promise<ApiResponse<string[]>> {
  const response = await fetch(getApiUrl('/api/salles'));
  if (!response.ok) return { error: 'Erreur', status: response.status };
  const data = await response.json();
  return { data: Array.isArray(data) ? data : [], status: response.status };
}

// ==================== INDISPONIBILITES ====================

export async function getIndispos(): Promise<ApiResponse<any[]>> {
  const response = await fetch(getApiUrl('/api/indispos'));
  if (!response.ok) return { error: 'Erreur', status: response.status };
  const data = await response.json();
  return { data: Array.isArray(data) ? data : [], status: response.status };
}

export async function createIndispo(indispo: any, token: string): Promise<ApiResponse<any>> {
  const formData = new URLSearchParams();
  Object.entries(indispo).forEach(([key, value]) => {
    if (value !== undefined) formData.append(key, String(value));
  });
  formData.append('token', token);
  const response = await fetch(getApiUrl('/api/indispos'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  });
  if (!response.ok) return { error: 'Erreur', status: response.status };
  return { data: await response.json(), status: response.status };
}

export async function deleteIndispo(indispoId: number, token: string): Promise<ApiResponse<void>> {
  const response = await fetch(getApiUrl(`/api/indispos/${indispoId}`), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `token=${token}`,
  });
  if (!response.ok) return { error: 'Erreur', status: response.status };
  return { status: response.status };
}

// ==================== IMPORT/EXPORT ====================

export async function importMatches(file: File, token: string): Promise<ApiResponse<any>> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('token', token);
  const response = await fetch(getApiUrl('/api/import'), {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) return { error: 'Erreur', status: response.status };
  return { data: await response.json(), status: response.status };
}

export async function exportICal(token: string): Promise<ApiResponse<Blob>> {
  const response = await fetch(getApiUrl('/api/export/ical', { token }));
  if (!response.ok) return { error: 'Erreur', status: response.status };
  return { data: await response.blob(), status: response.status };
}

// ==================== APP INFO ====================

export async function getAppInfo(): Promise<ApiResponse<any>> {
  const response = await fetch(getApiUrl('/api/app-info'));
  if (!response.ok) return { error: 'Erreur', status: response.status };
  return { data: await response.json(), status: response.status };
}

// ==================== UTILS ====================

export function formatDateForApi(date: Date): string {
  const pad = (num: number) => num.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseApiDate(dateString: string | undefined | null): Date {
  if (!dateString) return new Date();
  return new Date(dateString.replace(' ', 'T'));
}
