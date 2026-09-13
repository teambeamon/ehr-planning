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
  id?: number;        // Optionnel car le backend /api/teams ne retourne pas d'id
  nom: string;
  couleur: string;
  coach?: string;     // Optionnel
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

export type ParentRole = 'responsable_stable_de_marque' | 'responsable_salle';

export interface TeamCoach {
  id: number;
  team_name: string;
  coach_name: string;
  coach_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface TeamParent {
  id: number;
  team_name: string;
  parent_name: string;
  role: ParentRole;
  phone: string;
  email: string;
  created_at?: string;
  updated_at?: string;
}

export interface TeamWithStaff extends Team {
  coaches: TeamCoach[];
  parents: TeamParent[];
}

export type InventoryCategory = 
  | 'ballons'
  | 'maillots'
  | 'dossards'
  | 'cles'
  | 'badges'
  | 'chronometres'
  | 'buts_portatifs'
  | 'filets'
  | 'autre';

export interface InventoryItem {
  id: number;
  name: string;
  category: InventoryCategory | string;
  quantity: number;
  location?: string;
  responsible?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

// Mapper les catégories pour l'affichage
export const INVENTORY_CATEGORY_LABELS: Record<string, string> = {
  'ballons': 'Ballons',
  'maillots': 'Maillots',
  'dossards': 'Dossards',
  'cles': 'Clés',
  'badges': 'Badges',
  'chronometres': 'Chronomètres',
  'buts_portatifs': 'Buts portatifs',
  'filets': 'Filets',
  'autre': 'Autre'
};

// Couleurs pour les catégories
export const INVENTORY_CATEGORY_COLORS: Record<string, string> = {
  'ballons': '#3b82f6',
  'maillots': '#10b981',
  'dossards': '#f59e0b',
  'cles': '#ef4444',
  'badges': '#8b5cf6',
  'chronometres': '#06b6d4',
  'buts_portatifs': '#84cc16',
  'filets': '#eab308',
  'autre': '#6366f1'
};
