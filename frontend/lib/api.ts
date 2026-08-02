// Client API pour communiquer avec le backend FastAPI
// Configuration pour Vercel: frontend et backend sur la même origine

import { User, Match, Team, Saison, Stats, StatsSalle, AppInfo, Indispo } from './types';

// URL de base pour l'API - configurée via variables d'environnement
const getBaseUrl = (): string => {
  // Côté client: utiliser window.location.origin
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  // Côté serveur: utiliser NEXT_PUBLIC_API_URL si disponible, sinon localhost:8000
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
};

const getApiUrl = (path: string, params?: Record<string, string | number>): string => {
  const baseUrl = getBaseUrl();
  const url = new URL(path, baseUrl);
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

// Définir LoginResponse localement pour éviter les problèmes de dépendances circulaires
export interface LoginResponse {
  token: string;
  username: string;
  role: string;
}

export async function login(username: string, password: string): Promise<ApiResponse<LoginResponse>> {
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

export async function getMe(token: string): Promise<ApiResponse<User>> {
  const response = await fetch(getApiUrl('/api/me', { token }));
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Token invalide' }));
    return { error: error.detail, status: response.status };
  }
  const data = await response.json().catch(() => null);
  // Le backend retourne {username, role, token} pour /api/me aussi
  if (data) {
    // Normaliser pour correspondre au type User
    const userData: User = {
      username: data.username,
      role: data.role as 'admin' | 'user',
      token: data.token
    };
    return { data: userData, status: response.status };
  }
  return { error: 'Données utilisateur invalides', status: response.status };
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

// ==================== SAISONS ====================

export async function getSaisons(): Promise<ApiResponse<Saison[]>> {
  const response = await fetch(getApiUrl('/api/saisons'));
  if (!response.ok) return { error: 'Erreur', status: response.status };
  const data = await response.json();
  
  // Le backend retourne {saisons: string[], current: string}
  // Transformer en Saison[] avec active: boolean
  if (data && data.saisons && Array.isArray(data.saisons)) {
    const saisons: Saison[] = data.saisons.map((nom: string) => ({
      nom,
      active: nom === data.current
    }));
    return { data: saisons, status: response.status };
  }
  
  return { data: [], status: response.status };
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

export async function getMatches(params?: { saison?: string; salle?: string; journee?: number; limit?: number; offset?: number }): Promise<ApiResponse<Match[]>> {
  const response = await fetch(getApiUrl('/api/matches', params));
  if (!response.ok) return { error: 'Erreur', status: response.status };
  const data = await response.json();
  return { data: Array.isArray(data) ? data : [], status: response.status };
}

export async function getMatchById(matchId: number): Promise<ApiResponse<Match>> {
  const response = await fetch(getApiUrl(`/api/matches/${matchId}`));
  if (!response.ok) return { error: 'Erreur', status: response.status };
  return { data: await response.json(), status: response.status };
}

export async function createMatch(match: Omit<Match, 'id'>, token: string): Promise<ApiResponse<Match>> {
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

export async function updateMatch(matchId: number, match: Partial<Match>, token: string): Promise<ApiResponse<Match>> {
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

export async function getStats(params?: { saison?: string }): Promise<ApiResponse<Stats>> {
  const response = await fetch(getApiUrl('/api/stats', params));
  if (!response.ok) return { error: 'Erreur', status: response.status };
  return { data: await response.json(), status: response.status };
}

export async function getStatsBySalle(params?: { saison?: string }): Promise<ApiResponse<StatsSalle[]>> {
  const response = await fetch(getApiUrl('/api/stats/salles', params));
  if (!response.ok) return { error: 'Erreur', status: response.status };
  const data = await response.json();
  return { data: Array.isArray(data) ? data : [], status: response.status };
}

// ==================== EQUIPES ====================

export async function getTeams(): Promise<ApiResponse<Team[]>> {
  const response = await fetch(getApiUrl('/api/teams'));
  if (!response.ok) return { error: 'Erreur', status: response.status };
  const data = await response.json();
  return { data: Array.isArray(data) ? data : [], status: response.status };
}

// ==================== SALLES ====================

export async function getSalles(): Promise<ApiResponse<string[]>> {
  // Le backend n'a pas d'endpoint /api/salles, on utilise /api/matches pour extraire les salles
  const response = await fetch(getApiUrl('/api/matches', { limit: 500 }));
  if (!response.ok) return { error: 'Erreur', status: response.status };
  
  try {
    const data = await response.json();
    if (Array.isArray(data)) {
      // Extraire les salles uniques depuis les matchs
      const salles: string[] = [];
      const seen = new Set<string>();
      data.forEach((match: any) => {
        if (match.salle && typeof match.salle === 'string' && !seen.has(match.salle)) {
          seen.add(match.salle);
          salles.push(match.salle);
        }
      });
      return { data: salles, status: response.status };
    }
    return { data: [], status: response.status };
  } catch (err) {
    return { error: 'Erreur de parsing', status: response.status };
  }
}

// ==================== INDISPONIBILITES ====================

export async function getIndispos(): Promise<ApiResponse<Indispo[]>> {
  const response = await fetch(getApiUrl('/api/indispos'));
  if (!response.ok) return { error: 'Erreur', status: response.status };
  const data = await response.json();
  return { data: Array.isArray(data) ? data : [], status: response.status };
}

export async function createIndispo(indispo: Omit<Indispo, 'id'>, token: string): Promise<ApiResponse<Indispo>> {
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

export interface ImportResult {
  status: string;
  filename: string;
  created: number;
  updated: number;
  skipped: number;
  message: string;
  total_matches?: number;
  processed_matches?: number;
}

export interface PreviewResult {
  status: string;
  filename: string;
  dates: string[];
  teams: string[];
  date_count: number;
  team_count: number;
}

export async function previewFile(file: File, token: string): Promise<ApiResponse<PreviewResult>> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('token', token);
  const response = await fetch(getApiUrl('/api/import/preview'), {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Erreur lors de la prévisualisation' }));
    return { error: error.detail || error.message || 'Erreur lors de la prévisualisation', status: response.status };
  }
  return { data: await response.json(), status: response.status };
}

export async function importMatches(file: File, token: string): Promise<ApiResponse<ImportResult>> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('token', token);
  const response = await fetch(getApiUrl('/api/import'), {
    method: 'POST',
    body: formData,
    // Ne pas définir Content-Type header - le navigateur le fait automatiquement pour FormData
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Erreur lors de l\'import' }));
    return { error: error.detail || error.message || 'Erreur lors de l\'import', status: response.status };
  }
  return { data: await response.json(), status: response.status };
}

export async function exportICal(token: string): Promise<ApiResponse<Blob>> {
  const response = await fetch(getApiUrl('/api/export/ical', { token }));
  if (!response.ok) return { error: 'Erreur', status: response.status };
  return { data: await response.blob(), status: response.status };
}

// ==================== APP INFO ====================

export async function getAppInfo(): Promise<ApiResponse<AppInfo>> {
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
  if (!dateString) {
    // Retourner une date invalide qui sera gérée par le frontend
    return new Date('1970-01-01T00:00:00');
  }
  try {
    return new Date(dateString.replace(' ', 'T'));
  } catch {
    return new Date('1970-01-01T00:00:00');
  }
}

export function formatDateForDisplay(dateString: string | undefined | null): string {
  if (!dateString) return 'Date invalide';
  try {
    const date = new Date(dateString.replace(' ', 'T'));
    if (isNaN(date.getTime())) return 'Date invalide';
    return date.toLocaleString('fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Date invalide';
  }
}
