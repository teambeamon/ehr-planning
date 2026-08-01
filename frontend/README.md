# EHR Planning - Frontend (Next.js)

Frontend moderne pour l'application EHR Planning, construit avec **Next.js 14**, **Tailwind CSS** et **TypeScript**.

## 🚀 Déploiement rapide sur Vercel

### 1. Pousse le code sur GitHub
```bash
cd ehr-planning
git add frontend/
git commit -m "Add Next.js frontend"
git push
```

### 2. Déploie sur Vercel
1. Va sur [https://vercel.com](https://vercel.com)
2. Importe ton dépôt GitHub
3. Vercel détectera automatiquement le projet Next.js dans le dossier `/frontend`
4. **Configurer les variables d'environnement** (importantes) :
   - `TURSO_URL` : URL de ta base de données Turso
   - `TURSO_TOKEN` : Token d'authentification Turso
   - `RESET_ADMIN_SECRET` : Secret pour la réinitialisation admin (optionnel)

5. Déploie !

## 🛠 Développement local

### Prérequis
- Node.js 18+
- npm ou yarn

### Installation
```bash
cd frontend
npm install
```

### Démarrer le frontend
```bash
npm run dev
```
Le frontend sera accessible sur [http://localhost:3000](http://localhost:3000)

### Démarrer le backend (FastAPI)
Dans un autre terminal :
```bash
# Depuis la racine du projet
python -m uvicorn api.index:app --reload --port 8000
```

### Configurer la connexion au backend
Dans `frontend/lib/api.ts`, modifie `BASE_URL` si nécessaire :
```typescript
const BASE_URL = 'http://localhost:8000'; // Pour le développement
```

## 📁 Structure du projet

```
frontend/
├── app/                      # Pages Next.js (App Router)
│   ├── layout.tsx           # Layout principal avec dark mode
│   ├── page.tsx            # Page d'accueil
│   ├── admin/
│   │   └── page.tsx        # Panneau d'administration
│   ├── matches/
│   │   └── page.tsx        # Liste des matchs
│   ├── salles/
│   │   └── page.tsx        # Statistiques par salle
│   └── classements/
│       └── page.tsx        # Classements des équipes
├── components/               # Composants React réutilisables
│   ├── Navbar.tsx          # Barre de navigation
│   └── Calendar.tsx        # Calendrier FullCalendar
├── lib/                     # Logique métier et types
│   ├── api.ts              # Client API pour le backend
│   └── types.ts            # Types TypeScript
├── public/                  # Assets statiques
├── package.json
├── tailwind.config.ts      # Configuration Tailwind
└── tsconfig.json
```

## ✨ Fonctionnalités

### Déjà implémentées
- ✅ **Design moderne** avec Tailwind CSS
- ✅ **Dark mode** automatique (suivant les préférences système)
- ✅ **Calendrier interactif** avec FullCalendar
- ✅ **Filtrage des matchs** par saison, salle, équipe, journée
- ✅ **Authentification** persistante (localStorage)
- ✅ **Pages** : Accueil, Admin, Matchs, Salles, Classements
- ✅ **Graphiques** avec Recharts (stats par salle)
- ✅ **Classements** calculés automatiquement
- ✅ **Responsive** (adapté mobile/tablette)

### À implémenter (si besoin)
- [ ] **CRUD complet des matchs** (création/édition)
- [ ] **Gestion des utilisateurs** (création, rôles)
- [ ] **Notifications** en temps réel
- [ ] **Export PDF** des classements
- [ ] **Recherche globale**

## 📡 API Backend

Le frontend communique avec ton API FastAPI existante. Tous les endpoints sont supportés :

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/api/login` | POST | Connexion |
| `/api/logout` | POST | Déconnexion |
| `/api/me` | GET | Infos utilisateur |
| `/api/matches` | GET | Liste des matchs |
| `/api/matches/{id}` | GET/PUT/DELETE | Gestion des matchs |
| `/api/saisons` | GET | Liste des saisons |
| `/api/saisons/current` | POST | Changer saison active |
| `/api/stats` | GET | Statistiques globales |
| `/api/stats/salles` | GET | Stats par salle |
| `/api/teams` | GET | Liste des équipes |
| `/api/import` | POST | Import Excel |
| `/api/export/ical` | GET | Export iCal |
| `/api/indispos` | GET/POST | Indisponibilités |

## 🎨 Personnalisation

### Couleurs
Modifie les couleurs dans `tailwind.config.ts` :
```typescript
colors: {
  primary: {
    50: '#eff6ff',
    500: '#3b82f6',
    600: '#2563eb',
  },
  ehr: {
    blue: '#004080',  // Bleu EHR
    light: '#cce0ff',
    dark: '#001a33',
  },
}
```

### Logo
Remplace le logo dans `components/Navbar.tsx` (ligne avec `EHR`).

## 🔧 Configuration avancée

### Variables d'environnement
Crée un fichier `.env.local` dans le dossier `frontend/` :
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Déploiement avec Docker
Crée un `Dockerfile` dans `frontend/` :
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## 📝 Notes

- Le frontend utilise **App Router** de Next.js 14
- Les composants sont en **Client Components** (`'use client'`) pour les interactions
- Les données sont fetchées côté client avec `useEffect`
- Le backend reste en **FastAPI** (inchangé)
- **Turso** est utilisé comme base de données (via ton backend existant)

## 🤝 Contribution

1. Fork le dépôt
2. Crée une branche (`git checkout -b feature/nouvelle-fonctionnalite`)
3. Commit tes changements (`git commit -m 'Ajout nouvelle fonctionnalite'`)
4. Push (`git push origin feature/nouvelle-fonctionnalite`)
5. Ouvre une Pull Request

---

**Technologies** : Next.js 14 | React 18 | TypeScript | Tailwind CSS | FullCalendar | Recharts | SWR

**Backend** : FastAPI | Turso (libSQL) | Python 3.10+
