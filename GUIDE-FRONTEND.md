# Guide d'intégration du Frontend Next.js

Ce guide t'explique comment intégrer et déployer le nouveau frontend Next.js avec ton backend FastAPI existant.

## 📦 Structure créée

```
ehr-planning/
├── api/
│   └── index.py              # Ton backend FastAPI (inchangé)
├── public/
│   └── *.html               # tes pages HTML statiques (fallback)
├── frontend/                # ✨ NOUVEAU FRONTEND
│   ├── app/
│   │   ├── layout.tsx       # Layout avec Tailwind + dark mode
│   │   ├── page.tsx        # Accueil avec calendrier et matchs
│   │   ├── admin/page.tsx  # Panneau admin (connexion + gestion)
│   │   ├── matches/page.tsx # Liste complète des matchs
│   │   ├── salles/page.tsx # Stats par salle avec graphiques
│   │   └── classements/page.tsx # Classements calculés
│   ├── components/
│   │   ├── Navbar.tsx       # Barre de navigation
│   │   └── Calendar.tsx     # Calendrier FullCalendar
│   ├── lib/
│   │   ├── api.ts           # Client API pour ton backend
│   │   └── types.ts         # Types TypeScript
│   ├── public/
│   ├── package.json
│   ├── tailwind.config.ts
│   └── README.md
├── vercel.json              # Config Vercel mise à jour
└── requirements.txt
```

## 🚀 Étapes pour déployer

### Option 1 : Déploiement complet sur Vercel (recommandé)

1. **Push le code sur GitHub**
   ```bash
   git add frontend/ vercel.json
   git commit -m "Add Next.js frontend with Tailwind"
   git push
   ```

2. **Sur Vercel**
   - Va dans ton projet existant sur Vercel
   - Dans **Settings → Git**, vérifie que la branche est à jour
   - Vercel détectera automatiquement :
     - Le backend Python (`api/index.py`)
     - Le frontend Next.js (`frontend/`)
   - **Ajoute ces variables d'environnement** (Settings → Environment Variables) :
     ```
     TURSO_URL=ta_url_turso
     TURSO_TOKEN=ton_token_turso
     RESET_ADMIN_SECRET=ton_secret_admin
     ```

3. **Redéploie**
   - Vercel redéploiera automatiquement avec la nouvelle configuration
   - Ton site sera accessible sur la même URL

### Option 2 : Développement local

1. **Installe les dépendances du frontend**
   ```bash
   cd frontend
   npm install
   ```

2. **Démarre le backend FastAPI** (dans un terminal)
   ```bash
   uvicorn api.index:app --reload --port 8000
   ```

3. **Démarre le frontend Next.js** (dans un autre terminal)
   ```bash
   cd frontend
   npm run dev
   ```

4. **Accède au site**
   - Frontend : [http://localhost:3000](http://localhost:3000)
   - Backend API : [http://localhost:8000/api/app-info](http://localhost:8000/api/app-info)

4. **Modifie la connexion au backend** (si nécessaire)
   Dans `frontend/lib/api.ts`, change :
   ```typescript
   const BASE_URL = 'http://localhost:8000'; // Pour le développement local
   ```

## ⚡ Ce qui a été amélioré

| **Ancien (HTML)** | **Nouveau (Next.js)** |
|-------------------|------------------------|
| Design basique | ✅ Design moderne avec Tailwind CSS |
| Pas de dark mode | ✅ Dark mode automatique |
| Pages statiques | ✅ Pages dynamiques avec React |
| Pas de calendrier | ✅ Calendrier interactif (FullCalendar) |
| Filtres manuels | ✅ Filtres dynamiques |
| Auth basique | ✅ Auth persistante (localStorage) |
| Pas de graphiques | ✅ Graphiques avec Recharts |
| Non responsive | ✅ 100% responsive |

## 📋 Fonctionnalités disponibles

### Pages
- **/`** - Accueil avec calendrier + liste des matchs + stats
- **/matches** - Liste complète avec filtres (saison, salle, équipe, journée)
- **/salles** - Statistiques par salle avec graphiques
- **/classements** - Classements des équipes calculés automatiquement
- **/admin** - Panneau d'administration (connexion + gestion)

### Composants
- **Navbar** - Barre de navigation avec dark mode toggle
- **Calendar** - Calendrier FullCalendar avec événements des matchs

### API Client
Tous tes endpoints FastAPI sont supportés :
- `GET /api/matches` - Liste des matchs
- `GET /api/saisons` - Liste des saisons
- `POST /api/saisons/current` - Changer saison active
- `GET /api/stats` - Stats globales
- `GET /api/stats/salles` - Stats par salle
- `POST /api/login` - Connexion
- `POST /api/logout` - Déconnexion
- `GET /api/me` - Infos utilisateur
- `POST /api/import` - Import Excel
- etc.

## 🛠 Personnalisation

### 1. Modifier les couleurs
Édite `frontend/tailwind.config.ts` :
```typescript
colors: {
  ehr: {
    blue: '#004080',  // Ta couleur EHR
    light: '#cce0ff',
    dark: '#001a33',
  },
}
```

### 2. Modifier le logo
Édite `frontend/components/Navbar.tsx` (ligne ~15-20) :
```tsx
<div className="w-10 h-10 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center">
  <span className="text-ehr-blue dark:text-white font-bold text-lg">TON LOGO</span>
</div>
```

### 3. Ajouter une nouvelle page
Exemple pour ajouter une page "Équipes" :

1. Crée `frontend/app/teams/page.tsx`
2. Ajoute un lien dans la navbar (`frontend/components/Navbar.tsx`)
3. Crée les fonctions API nécessaires dans `frontend/lib/api.ts`

## 🎯 Prochaines étapes suggérées

### Priorité Moyenne
- [ ] Ajouter la **création/édition de matchs** dans /admin
- [ ] Ajouter un bouton pour **exporter en iCal** depuis l'UI
- [ ] Implémenter la **gestion des indisponibilités**

### Priorité Basse
- [ ] Ajouter un système de **notifications** (toast)
- [ ] Implémenter la **recherche globale**
- [ ] Ajouter un **mode impression** pour les classements
- [ ] Intégrer **Google Analytics**

## 💡 Astuces

### Problème : Le backend n'est pas accessible en développement
**Solution** : Vérifie que ton backend tourne sur `http://localhost:8000` et que `BASE_URL` est correct dans `frontend/lib/api.ts`.

### Problème : Les images ne s'affichent pas
**Solution** : Place tes images dans `frontend/public/` et utilise `/nom-de-l-image.png` dans ton code.

### Problème : Le dark mode ne fonctionne pas
**Solution** : Vérifie que tu as bien `next-themes` d'installé et que `<ThemeProvider>` est dans ton layout.

### Problème : FullCalendar ne s'affiche pas
**Solution** : Installe les dépendances : `npm install @fullcalendar/react @fullcalendar/daygrid @fullcalendar/interaction`

## 📚 Documentation utile

- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [FullCalendar React](https://fullcalendar.io/docs/react)
- [Recharts](http://recharts.org/en-US)
- [FastAPI](https://fastapi.tiangolo.com/)

---

**Besoin d'aide ?**
- Vérifie les logs dans la console du navigateur (F12)
- Vérifie les logs du backend (`uvicorn api.index:app`)
- Consulte le [README.md](frontend/README.md) pour plus de détails

**Créé avec** ❤️ Next.js | Tailwind CSS | TypeScript | FastAPI | Turso
