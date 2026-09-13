// Types pour les données de l'API EHR Planning

export interface User {
  id?: number;
  username: string;
  role: 'admin' | 'user';
  token?: string; // Optional car token peut être géré séparément
}

export interface LoginResponse {
  token: string;
  username: string;
  role: string;
}

export interface Team {
  id: number;
  nom: string;
  couleur: string;
}

export interface Match {
  id: number;
  date_str: string;      // Format: JJ/MM/AAAA
  date_iso: string;      // Format: YYYY-MM-DD
  team_name: string;     // Nom de l'équipe EHR
  opponent: string;      // Adversaire
  salle: string;
  saison: string;
  journee: string;       // Ex: "J1", "J2", "Coupe"
  home: number | null;   // 1 = domicile, 0 = extérieur, null = neutre
  time_str: string;      // Ex: "15h00"
  match_text: string;    // Texte complet du match
  match_type: string;    // champ, coupe, amical, report, exempt
  note: string;
  coach: string;
  manually_edited: boolean;
  camionnette: string;
  conducteur: string;
  heure_depart: string;
  lieu_rdv: string;
  // Champs pour les scores (optionnels, gérés côté frontend pour les classements)
  score1?: number | null;
  score2?: number | null;
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
  saison?: string;
  total_matches: number;
  days_distribution: Record<string, number>; // { "1": 10, "2": 3, ... }
  max_matches_per_day: number;
}

export interface AppInfo {
  version: string;
  turso_connected: boolean;
}

export interface AppVersion {
  version: string;
  app_version_code?: string;
  beta?: boolean;
  last_updated?: string;
  last_commit?: string;
  deploy_message?: string;
  last_import?: any;
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
