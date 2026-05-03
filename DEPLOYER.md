# EHR Planning — Mise à jour

## Fichiers à copier dans ton repo git

1. `api/index.py`  → remplace `api/index.py`
2. `vercel.json`   → remplace `vercel.json`  
3. `requirements.txt` → remplace `requirements.txt`

## Commandes

```bash
# Depuis le dossier où tu as décompressé ce ZIP :
cp api/index.py ~/CHEMIN_TON_REPO/api/index.py
cp vercel.json ~/CHEMIN_TON_REPO/vercel.json
cp requirements.txt ~/CHEMIN_TON_REPO/requirements.txt

# Puis :
cd ~/CHEMIN_TON_REPO
git add api/index.py vercel.json requirements.txt
git commit -m "v1.1.0-beta - badge beta + version + evenements"
git push
```

## Vérification après déploiement

Ouvre : https://ehr-planning-qq5f.vercel.app/api/app-info
Tu dois voir : {"version":"1.1.0-beta","beta":true,...}
