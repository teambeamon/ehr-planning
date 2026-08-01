// Types pour les données de l'API EHR Planning

export interface User {
  id: number;
  username: string;
  role: 'admin' | 'user';
  token?: string;
}

export interface Team {
  id: number;
  nom: string;
  couleur: string;
}

export interface Match {
  id: number;
  date: string; // Format: YYYY-MM-DD HH:MM
  equipo1: string;
  equipo2: string;
  salle: string;
  saison: string;
  journee: number;
  score1?: number | null;
  score2?: number | null;
  arbitre?: string;
  delegue?: string;
}

export interface Saison {
  nom: string;
  active: boolean;
}

export interface Indispo {
  id: number;
  date: string;
  salle: string;
  raison: string;
}

export interface Stats {
  total_matches: number;
  matches_by_day: Record<string, number>; // { "1": 12, "2": 5, ... }
  matches_by_salle: Record<string, number>;
}

export interface StatsSalle {
  salle: string;
  total_matches: number;
  days_distribution: Record<string, number>; // { "1": 10, "2": 3, ... }
  max_matches_per_day: number;
}

export interface AppInfo {
  version: string;
  turso_connected: boolean;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface ApiError {
  detail: string;
}

export interface MatchImportData {
  date: string;
  team1: string;
  team2: string;
  salle: string;
  journee: number;
  saison?: string;
}
