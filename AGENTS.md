# AGENTS.md - Configuration Agent Dédié EHR Planning

## 📋 Contexte du Projet

**Nom** : EHR Planning  
**Description** : Application de gestion de planning pour le club EHR Handball  
**Client** : Team Beamon / EHR Handball Club  
**URL Production** : https://ehr-planning.vercel.app

---

## 🏗️ Architecture Technique

### Structure des Dossiers
```
ehr-planning/
├── frontend/           # Application Next.js 14
│   ├── app/            # Pages et routes (App Router)
│   │   ├── matches/    # Liste des matchs
│   │   ├── salles/     # Gestion des salles
│   │   ├── inventory/  # Gestion de l'inventaire
│   │   ├── admin/      # Interface admin + import
│   │   ├── team-management/ # Gestion des encadrants
│   │   ├── user-management/ # Gestion des utilisateurs
│   │   └── calendar/   # Composant calendrier
│   ├── components/     # Composants React
│   │   └── Calendar.tsx # Calendrier FullCalendar
│   │   └── Navbar.tsx  # Barre de navigation
│   ├── lib/            # Utilities et API client
│   │   ├── api.ts      # Appels API vers le backend
│   │   └── types.ts    # Types TypeScript
│   └── tailwind.config.ts
│
└── api/               # Backend FastAPI
    ├── index.py       # Point d'entrée principal
    ├── handler.py     # Handler Vercel
    └── server.py      # Server alternatif
```

### Stack Technique

| Composant | Technologie | Version | Rôle |
|-----------|-------------|---------|------|
| **Frontend** | Next.js | 14.2.3 | Framework React |
| **Langage Front** | TypeScript | Latest | Typage strict |
| **Styling** | Tailwind CSS | Latest | Design system |
| **Calendrier** | FullCalendar | 6.x | Composant calendrier |
| **Backend** | FastAPI | Latest | API REST |
| **Langage Back** | Python | 3.11+ | Logique métier |
| **Base de données** | Turso DB | SQLite compatible | Persistance |
| **Hébergement** | Vercel | Auto-deploy | Hosting |
| **Authentification** | JWT | localStorage | Gestion utilisateurs |

---

## 🎯 Règles Métiers (IMPORTANT)

### 🏟️ Salles et Couleurs Excel

**Mapping Couleur de Fond → Salle** (pour les matchs à domicile uniquement) :

| Couleur | Code xlrd | Code openpyxl | Salle | Statut |
|---------|-----------|---------------|-------|--------|
| Jaune | 13 | `#FFFF00` | **Rodemack** | ✅ |
| Bleu | 40 | `#00CCFF` | **Hettange** | ✅ |
| Vert | 50 | `#99CC00` | **Hettange** | ✅ |
| Orange | 51 | `#FFCC00` | **Kanfen** | ✅ |
| Blanc | 9 | `#FFFFFF` | "" (pas encore décidé) | ⏳ |
| Pas de fond | 64, 65, 0 | - | "" (pas encore décidé) | ⏳ |

**Salles EHR** : `['Hettange', 'Rodemack', 'Kanfen']`

**Anciennes valeurs à normaliser** :
- `Hettange Hall` → `Hettange`
- `Hettange Poly` → `Hettange`

### 🥊 Logique des Matchs

**Détermination Domicile/Extérieur** :
- **Domicile** (home=1) : Si EHR est en **premier** dans le texte
  - Ex: `EHR - US Hettange`, `EHR vs Thionville`
- **Extérieur** (home=0) : Si EHR est en **second** dans le texte
  - Ex: `US Hettange - EHR`, `Thionville vs EHR`

**Types de matchs** :
- `champ` : Championnat
- `coupe` : Coupe
- `amical` : Match amical

### 📦 Inventaire

**Catégories** : 
`ballons`, `maillots`, `dossards`, `cles`, `badges`, `chronometres`, `buts_portatifs`, `filets`, `autre`

**Conditions** :
`neuf`, `bon`, `use`, `a_remplacer`, `hors_service`

**Champs importants** :
- `name` (obligatoire)
- `category`
- `quantity`
- `cost`
- `purchase_year`
- `purchase_date`
- `team_owner`
- `item_condition`
- `serial_number`
- `supplier`
- `location`
- `responsible`

---

## 🔧 Configuration Développement

### Environnement

**Variables d'environnement** (Vercel) :
```bash
TURSO_URL=<url_turso_db>
TURSO_TOKEN=<token_turso>
```

**Base de données locale** : `/tmp/ehr_local.db` (fallback)

### Dépendances

**Frontend** (`frontend/package.json`) :
```json
{
  "dependencies": {
    "next": "14.2.3",
    "react": "^18",
    "react-dom": "^18",
    "next-themes": "^0.3.0",
    "@fullcalendar/react": "^6.1.10",
    "@fullcalendar/daygrid": "^6.1.10",
    "@fullcalendar/interaction": "^6.1.10",
    "recharts": "^2.12.2",
    "framer-motion": "^11.0.0"
  }
}
```

**Backend** (`api/requirements.txt`) :
```
fastapi
uvicorn
python-multipart
xlrd>=2.0.0
openpyxl
libsql-experimental
python-jose[cryptography]
passlib
```

### Installation

```bash
# Frontend
cd frontend
npm install
npm run dev  # http://localhost:3000

# Backend (local)
cd api
pip install -r requirements.txt
uvicorn index:app --reload  # http://localhost:8000
```

---

## 🚀 Workflow de Déploiement

### 1. Développement Local

**Frontend** : `npm run dev` (port 3000)  
**Backend** : `uvicorn api.index:app --reload` (port 8000)

**Proxy API** : Le frontend appelle `/api/...` qui est proxyfié vers le backend

### 2. Branches

| Branche | Usage | Déploiement |
|---------|-------|-------------|
| `main` | Production | Vercel Auto |
| `dev` | Développement | Manuel |
| `feature/*` | Nouvelles fonctionnalités | Pas de déploiement |

### 3. Déploiement Vercel

**Processus** :
1. Push sur `main` → Déclenche build Vercel
2. Vercel exécute `npm run build` (frontend)
3. Vercel déploie l'api Python
4. Site disponible sur https://ehr-planning.vercel.app

**Commandes** :
```bash
# Commit standard
git add .
git commit -m "[Fix] description de la correction"
git push origin main

# Avec co-authorship
git commit -m "description

Generated by Mistral Vibe.
Co-Authored-By: Mistral Vibe <vibe@mistral.ai>"
```

### 4. Build et Erreurs

**Problèmes courants** :
- `SyntaxError` dans `api/index.py` → Vérifier les accolades
- `Type error` dans frontend → Vérifier les types TypeScript
- `Module not found` → `npm install` manquant

---

## 🔐 Authentification et Rôles

### Endpoints Auth

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/api/auth/login` | POST | Connexion (username, password) |
| `/api/auth/me` | GET | Info utilisateur courant |
| `/api/auth/logout` | POST | Déconnexion |

### Rôles

| Rôle | Permissions |
|------|-------------|
| `admin` | Accès complet + gestion utilisateurs |
| `user` | Accès lecture/écriture (sauf admin) |
| `viewer` | Lecture seule |

**Stockage token** : `localStorage.setItem('ehr_token', token)`

---

## 📡 Endpoints API Principaux

### Matchs

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/api/matches` | GET | Liste des matchs (filtres: team, month, match_type, search, saison) |
| `/api/matches` | POST | Créer un match |
| `/api/matches/{id}` | GET | Détails d'un match |
| `/api/matches/{id}` | DELETE | Supprimer un match |
| `/api/import/matches` | POST | Importer depuis Excel |
| `/api/import/preview` | POST | Prévisualiser Excel |

### Inventaire

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/api/inventory` | GET | Liste de l'inventaire |
| `/api/inventory` | POST | Ajouter un article |
| `/api/inventory/{id}` | PUT | Mettre à jour un article |
| `/api/inventory/{id}` | DELETE | Supprimer un article |

### Autres

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/api/teams` | GET | Liste des équipes |
| `/api/saisons` | GET | Liste des saisons |
| `/api/stats/salles` | GET | Stats par salle |
| `/api/indispos` | GET/POST/DELETE | Gestion des indisponibilités |

---

## 🎨 Conventions de Code

### Frontend (TypeScript/React)

**Noms de fichiers** :
- Pages : `page.tsx` (App Router)
- Composants : `PascalCase.tsx`
- Utilities : `camelCase.ts`

**Styling** :
- Tailwind CSS pour tous les styles
- Préfixe classes : `bg-ehr-blue`, `text-ehr-light` (voir tailwind.config.ts)
- Responsive : `md:`, `lg:`, `xl:` breakpoints

**Types** :
- Tous dans `lib/types.ts`
- Exporter et réutiliser

### Backend (Python/FastAPI)

**Structure** :
- Tout dans `api/index.py` (pour Vercel)
- Routes : `@app.get()`, `@app.post()`
- Base de données : `db_fetchall()`, `db_execute()`

**Noms** :
- Fonctions : `snake_case`
- Variables : `snake_case`
- Constantes : `UPPER_SNAKE_CASE`

---

## 📝 Instructions pour l'Agent

### ⚡ Priorités

1. **Corriger les bugs** > Ajouter des fonctionnalités > Améliorer le design
2. **Maintenir la compatibilité** avec les données existantes
3. **Respecter les règles métiers** (couleurs→salles, domicile/extérieur)
4. **Optimiser pour mobile** (responsive design)

### ✅ Checklist avant commit

- [ ] Le code compile (`npm run build`)
- [ ] Les types TypeScript sont corrects
- [ ] La logique métiers est respectée
- [ ] Le responsive design est testé
- [ ] Les données existantes ne seront pas corrompues
- [ ] Le message de commit est clair

### 🔄 Tâches Récurrentes

**1. Correction CSS/Responsive** :
```bash
# Vérifier
- Padding adaptés mobile : p-3 md:p-4 lg:p-6
- Textes : text-sm md:text-base
- Grilles : grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Tables : overflow-x-auto, text-sm
```

**2. Nouvelle Fonctionnalité** :
```
- Backend : Ajouter endpoint dans api/index.py
- Frontend : Créer page/composant dans frontend/app/
- Types : Mettre à jour lib/types.ts
- API : Ajouter fonction dans lib/api.ts
```

**3. Déploiement** :
```bash
git add .
git commit -m "[Type] description"
git push origin main
# Vercel déploiement automatique
```

### 🚨 Erreurs Courantes et Solutions

**Problème** : `SyntaxError: '{' was never closed`  
**Solution** : Vérifier les accolades dans `api/index.py`, utiliser un linter

**Problème** : `Type error: string is not assignable to type XYZ`  
**Solution** : Vérifier les types dans `lib/types.ts` et les casts

**Problème** : `Module not found: @fullcalendar/react`  
**Solution** : `cd frontend && npm install`

**Problème** : Déploiement Vercel échoue  
**Solution** : Vérifier les logs Vercel, souvent syntaxe Python ou dépendances manquantes

**Problème** : Modal trop large sur mobile  
**Solution** : `max-w-lg md:max-w-xl`, `overflow-y-auto`, `max-h-[90vh]`

---

## 📞 Contacts et Ressources

**Repository** : https://github.com/teambeamon/ehr-planning  
**Production** : https://ehr-planning.vercel.app  
**Vercel Dashboard** : https://vercel.com/teambeamon/ehr-planning

**Équipe** :
- Développeur : Mistral Vibe (via cette configuration)
- Club : EHR Handball

---

## 🎯 Objectifs Futurs

1. **Améliorer l'inventaire** :
   - Ajout d'images pour les articles
   - Code-barres / QR codes
   - Alertes de stock faible

2. **Gestion des utilisateurs** :
   - Page de profil
   - Réinitialisation de mot de passe
   - Rôles granulaires

3. **Calendrier amélioré** :
   - Synchronisation avec Google Calendar
   - Notifications par email
   - Gestion des indisponibilités

4. **Mobile** :
   - PWA (Progressive Web App)
   - Notifications push
   - Optimisation tactile

---

## 📌 Notes Spécifiques

### Samedi et Dimanche côte à côte
 Dans la vue calendrier, les week-ends doivent être affichés côte à côte.  
Voir : `frontend/app/calendar/` ou composant FullCalendar.

### Menu Inventaire
Le menu inventaire doit être visible pour les utilisateurs connectés.  
Vérifier : `frontend/components/Navbar.tsx` ligne 73-76

### Filtre Équipes
Le filtre par équipe dans les matchs doit fonctionner.  
Backend : Vérifier endpoint `/api/matches` avec paramètre `team`

### Match à Domicile/Extérieur
La détermination se fait par la position de "EHR" dans le texte du match.  
Voir : `frontend/components/Calendar.tsx` fonction `computeHomeFromText`

---

**Dernière mise à jour** : 13 septembre 2026  
**Version** : 1.0  
**Mainteneur** : Mistral Vibe
