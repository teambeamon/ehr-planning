// Client API pour communiquer avec le backend FastAPI
// Base URL : En développement = http://localhost:3000, en prod = '' (même origine)

const BASE_URL = typeof window !== 'undefined' ? '' : 'http://localhost:3000';

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: number;
}

/**
 * Effectue une requête vers l'API backend
 */
async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit & { params?: Record<string, string> }
): Promise<ApiResponse<T>> {
  const url = new URL(`${BASE_URL}${endpoint}`);
  
  // Ajouter les paramètres de query
  if (options?.params) {
    Object.entries(options.params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, value);
      }
    });
  }

  try {
    const response = await fetch(url.toString(), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        error: data?.detail || data?.message || 'Erreur API',
        status: response.status,
      };
    }

    return { data, status: response.status };
  } catch (error) {
    console.error('API Error:', error);
    return {
      error: 'Impossible de contacter le serveur',
      status: 500,
    };
  }
}

// ==================== AUTHENTIFICATION ====================

export async function login(username: string, password: string) {
  const response = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Erreur de connexion' }));
    return { error: error.detail, status: response.status };
  }
  
  return { data: await response.json(), status: response.status };
}

export async function logout(token: string) {
  return apiRequest<void>(`/api/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `token=${token}`,
  });
}

export async function getMe(token: string) {
  return apiRequest<User>(`/api/me?token=${token}`);
}

// ==================== MATCHS ====================

export async function getMatches(params?: {
  saison?: string;
  salle?: string;
  journee?: number;
  limit?: number;
  offset?: number;
}) {
  return apiRequest<Match[]>('/api/matches', { params });
}

export async function getMatchById(matchId: number) {
  return apiRequest<Match>(`/api/matches/${matchId}`);
}

export async function createMatch(match: Omit<Match, 'id'>, token: string) {
  return apiRequest<Match>('/api/matches', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Bearer ${token}`,
    },
    body: new URLSearchParams(Object.entries(match)).toString(),
  });
}

export async function updateMatch(matchId: number, match: Partial<Match>, token: string) {
  return apiRequest<Match>(`/api/matches/${matchId}`, {
    method: 'PUT',
    headers: { 
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Bearer ${token}`,
    },
    body: new URLSearchParams(Object.entries(match)).toString(),
  });
}

export async function deleteMatch(matchId: number, token: string) {
  return apiRequest<void>(`/api/matches/${matchId}`, {
    method: 'DELETE',
    headers: { 
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Bearer ${token}`,
    },
    body: `token=${token}`,
  });
}

// ==================== SAISONS ====================

export async function getSaisons() {
  return apiRequest<Saison[]>('/api/saisons');
}

export async function setCurrentSaison(saison: string, token: string) {
  return apiRequest<void>('/api/saisons/current', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `saison=${saison}&token=${token}`,
  });
}

// ==================== STATS ====================

export async function getStats(params?: { saison?: string }) {
  return apiRequest<Stats>('/api/stats', { params });
}

export async function getStatsBySalle(params?: { saison?: string }) {
  return apiRequest<StatsSalle[]>('/api/stats/salles', { params });
}

// ==================== EQUIPES ====================

export async function getTeams() {
  return apiRequest<Team[]>('/api/teams');
}

// ==================== SALLES ====================

export async function getSalles() {
  return apiRequest<string[]>('/api/salles');
}

// ==================== INDISPONIBILITES ====================

export async function getIndispos() {
  return apiRequest<Indispo[]>('/api/indispos');
}

export async function createIndispo(indispo: Omit<Indispo, 'id'>, token: string) {
  return apiRequest<Indispo>('/api/indispos', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Bearer ${token}`,
    },
    body: new URLSearchParams(Object.entries(indispo)).toString(),
  });
}

export async function deleteIndispo(indispoId: number, token: string) {
  return apiRequest<void>(`/api/indispos/${indispoId}`, {
    method: 'DELETE',
    headers: { 
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Bearer ${token}`,
    },
    body: `token=${token}`,
  });
}

// ==================== IMPORT/EXPORT ====================

export async function importMatches(file: File, token: string) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('token', token);
  
  const response = await fetch(`${BASE_URL}/api/import`, {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Erreur lors de l\'import' }));
    return { error: error.detail, status: response.status };
  }
  
  return { data: await response.json(), status: response.status };
}

export async function exportICal(token: string) {
  const response = await fetch(`${BASE_URL}/api/export/ical?token=${token}`);
  if (!response.ok) {
    return { error: 'Erreur lors de l\'export', status: response.status };
  }
  return { data: await response.blob(), status: response.status };
}

// ==================== APP INFO ====================

export async function getAppInfo() {
  return apiRequest<AppInfo>('/api/app-info');
}

// ==================== UTILS ====================

/**
 * Formate une date pour l'API (YYYY-MM-DD HH:MM)
 */
export function formatDateForApi(date: Date): string {
  const pad = (num: number) => num.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Parse une date de l'API (YYYY-MM-DD HH:MM)
 */
export function parseApiDate(dateString: string): Date {
  return new Date(dateString.replace(' ', 'T'));
}
