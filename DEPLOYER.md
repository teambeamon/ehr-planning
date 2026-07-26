# EHR Planning — Mise à jour v1.3.0-beta

## Ce qui change
- **Sécurité** : `/api/reset-admin` n'est plus utilisable publiquement (il fallait juste appeler l'endpoint pour reprendre la main sur le compte admin — corrigé). `/api/debug` ne fuit plus les usernames/rôles à n'importe qui — accès admin requis désormais.
- **Saisons** : les matchs sont maintenant rattachés à une saison (déduite automatiquement de la date, ex: un match le 15/09/2026 → saison `2026-2027`). Une saison "active" détermine ce qui s'affiche par défaut.
- **Stats par salle** : nouvel endpoint qui donne, par salle et par saison, le nombre total de matchs et la répartition des jours selon le nombre de matchs ce jour-là (combien de jours à 2 matchs, à 3 matchs, etc., jusqu'au maximum observé).

## Fichiers à copier dans ton repo git
1. `api/index.py` → remplace `api/index.py`

(vercel.json et requirements.txt sont inchangés cette fois, pas besoin de les retoucher.)

## Commandes
```bash
cp api/index.py ~/CHEMIN_TON_REPO/api/index.py
cd ~/CHEMIN_TON_REPO
git add api/index.py
git commit -m "v1.3.0-beta - securite reset-admin/debug + saisons + stats par salle"
git push
```

## Étape indispensable côté Vercel : le secret de réinitialisation admin
Avant que `/api/reset-admin` puisse te resservir un jour (mot de passe oublié), il te faut définir une variable d'environnement sur Vercel :

1. Vercel → ton projet → **Settings → Environment Variables**
2. Ajoute `RESET_ADMIN_SECRET` avec une valeur longue et aléatoire que **toi seul connais** (garde-la précieusement, par exemple dans un gestionnaire de mots de passe).
3. Redéploie (un simple push suffit à redéclencher le build).

Sans cette variable configurée, l'endpoint reste désactivé (403) — c'est voulu : mieux vaut être bloqué que laisser n'importe qui réinitialiser l'admin.

Pour l'utiliser en cas de besoin :
```bash
curl -X POST https://ehr-planning-qq5f.vercel.app/api/reset-admin -d "secret=TA_VALEUR_SECRETE"
```

## Étape indispensable côté app : passer à la saison 2026-2027
La base garde une saison "active" par défaut (`2025-2026` au premier déploiement). Pour basculer sur la nouvelle saison, connecte-toi en admin et appelle :
```bash
curl -X POST https://ehr-planning-qq5f.vercel.app/api/saisons/current \
  -d "saison=2026-2027" -d "token=TON_TOKEN_ADMIN"
```
(Récupère `TON_TOKEN_ADMIN` via `/api/login`, ou ajoute un petit bouton dans `admin.html` qui fait cet appel — dis-moi si tu veux que je le prépare.)

Une fois basculé :
- `/api/matches` (sans paramètre `saison`) n'affichera par défaut que les matchs 2026-2027.
- Les anciens matchs 2025-2026 restent en base, consultables avec `?saison=2025-2026` ou `?saison=all`.
- Les nouveaux imports Excel de la saison 2026-2027 seront automatiquement rattachés à la bonne saison (pas besoin de le préciser).

## Nouveaux endpoints utiles
- `GET /api/saisons` → liste des saisons présentes en base + saison active
- `GET /api/stats?saison=2026-2027` → stats globales filtrées sur une saison (mets `all` ou rien pour la saison active par défaut)
- `GET /api/stats/salles?saison=2026-2027` → pour chaque salle : total de matchs + `{"1": 12, "2": 4, "3": 1}` = 12 jours avec 1 match, 4 jours avec 2 matchs, 1 jour avec 3 matchs, + le max observé

## Vérification après déploiement
Ouvre : https://ehr-planning-qq5f.vercel.app/api/app-info
Tu dois voir `{"version":"1.3.0-beta",...}`
