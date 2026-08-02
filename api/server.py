"""
EHR Planning Backend - FastAPI Application
Fichier principal pour Vercel Serverless Functions
Organise en sections logiques pour une meilleure maintenabilite
"""

import hashlib
import os
import tempfile
import secrets
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional
import uuid

# ============================================================================
# CONFIGURATION ET INITIALISATION
# ============================================================================

# Configuration Turso
TURSO_URL = os.environ.get("TURSO_URL", "")
TURSO_TOKEN = os.environ.get("TURSO_TOKEN", "")
APP_VERSION = "1.3.0-beta"
DEPLOY_AUTO_SECRET = os.environ.get("DEPLOY_AUTO_SECRET", "")

# ============================================================================
# IMPORTS FASTAPI
# ============================================================================

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, HTMLResponse
import libsql_experimental as libsql

# ============================================================================
# BASE DE DONNEES - Fonctions utilitaires
# ============================================================================

_db: Optional[libsql.Connection] = None

def _get_db():
    """Obtient ou cree la connexion a la base de donnees Turso/Local"""
    global _db
    if _db is None:
        try:
            _db = libsql.connect(url=TURSO_URL, auth_token=TURSO_TOKEN)
        except Exception:
            _db = libsql.connect(url="file:local.db")
    return _db

def db_execute(sql: str, params: tuple = ()):
    """Execute une requete SQL avec commit"""
    try:
        _get_db().execute(sql, params)
        _get_db().commit()
    except Exception as e:
        print(f"[DB] Execute error: {e}")
        raise

def db_fetchone(sql: str, params: tuple = ()):
    """Recupere une seule ligne"""
    try:
        result = _get_db().execute(sql, params).fetchone()
        return result if result else {}
    except Exception as e:
        print(f"[DB] FetchOne error: {e}")
        return {}

def db_fetchall(sql: str, params: tuple = ()):
    """Recupere toutes les lignes"""
    try:
        return _get_db().execute(sql, params).fetchall()
    except Exception as e:
        print(f"[DB] FetchAll error: {e}")
        return []


# ============================================================================
# CREATION DE L'APPLICATION FASTAPI
# ============================================================================

app = FastAPI(title="EHR Planning")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# FONCTIONS UTILITAIRES
# ============================================================================

def _hash(text: str) -> str:
    """Hash un texte avec SHA256"""
    return hashlib.sha256(text.encode()).hexdigest()


def _s(v):
    """Convertit une valeur en string et supprime les espaces"""
    return str(v).strip() if v is not None else ""


def _iso(s):
    """Convertit une date JJ/MM/AAAA en format ISO YYYY-MM-DD"""
    try:
        p = s.split(" ")[0].split("/")
        d, m, y = p[0], p[1], p[2]
        if len(y) == 2:
            y = "20" + y
        return f"{y}-{m.zfill(2)}-{d.zfill(2)}"
    except:
        return "9999-99-99"


def _time(t):
    """Extrait l'heure d'un texte (format: 'a HHhMM')"""
    m = re.search(r"a\s*([\d]+h[\d]*)", t, re.IGNORECASE)
    return m.group(1) if m else ""


def _opponent(text):
    """Extrait l'adversaire d'un texte de match"""
    line = text.split("\n")[0].strip()
    if " - EHR" in line:
        return line.split(" - EHR")[0].strip()
    if "EHR - " in line:
        return line.split("EHR - ")[1].strip()
    return line.replace("EHR", "").replace("-", "").strip()


def _home_val(text):
    """Determine si le match est a domicile (1), exterieur (0) ou neutre (None)"""
    line = text.split("\n")[0]
    if re.search(r"^EHR[\s\-]", line):
        return 1
    if re.search(r"\-\s*EHR", line):
        return 0
    return None


def _mtype(text, journee=""):
    """Determine le type de match (champ, coupe, amical, report, exempt)"""
    t, j = text.lower(), journee.lower()
    if re.search(r"exempt|forfait", t):
        return "exempt"
    if re.search(r"report", t) and not re.search(r"coupe|cdf", t + j):
        return "report"
    if re.search(r"coupe|cdf|moselle|moelle", t + j):
        return "coupe"
    if re.search(r"amical|tournoi", t + j):
        return "amical"
    return "champ"


def _key(date_str, team, text):
    """Genere une clef unique pour un match"""
    return hashlib.md5(f"{date_str}|{team}|{text.split(chr(10))[0]}".encode()).hexdigest()[:16]


def _noise(text):
    """Determine si un texte est un bruit (pas un vrai match)"""
    noise = [
        r"^journee\s+\d", r"^j\d+$", r"^coupe de", r"^match amical$",
        r"^forfait g", r"^retrait ", r"impératif", r"report du", r"avancé au",
        r"^a placer", r"^faire conclusion", r"^dde report", r"^suite inversion",
        r"^demande de report", r"^sans colle", r"^modif salle", r"^inversion accept",
        r"^report$", r"^exempt\s*\d*$", r"^\d+h\d*\s*[-\u2013]",
        r"^coupe de moselle", r"^coupe de france", r"^plateau", r"^tournoi",
    ]
    t = text.lower().strip()
    if len(t) < 4:
        return True
    if any(re.search(p, t) for p in noise):
        return True
    if not re.search(r'[a-zA-Z\xC0-\u017F]{3,}', text):
        return True
    return False


# ============================================================================
# MAPPING COULEURS -> SALLES
# ============================================================================

BG_TO_SALLE = {
    40: "Hettange Hall",   # bleu
    50: "Hettange Poly",   # vert
    13: "Rodemack",        # jaune
    51: "Kanfen",          # orange
    9: "",                # blanc
    64: "",               # pas de fond
    65: "",
    0: "",
}


# ============================================================================
# CONSTANTES POUR LE PARSING EXCEL
# ============================================================================

TEAM_ROW = 11
COACH_ROW = 13
DATE_COL = 4
FIRST_TEAM_COL = 5
HEADER_ROWS = 14


# ============================================================================
# INITIALISATION DE LA BASE DE DONNEES
# ============================================================================

try:
    import xlrd
    HAVE_XLRD = True
except ImportError:
    HAVE_XLRD = False

try:
    import openpyxl
    HAVE_OPENPYXL = True
except ImportError:
    HAVE_OPENPYXL = False

# Creation des tables si elles n'existent pas
def _init_db():
    """Initialise la base de donnees avec les tables necessaires"""
    db_execute("""
        CREATE TABLE IF NOT EXISTS matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date_str TEXT DEFAULT '',
            date_iso TEXT DEFAULT '',
            team_name TEXT DEFAULT '',
            coach TEXT DEFAULT '',
            match_text TEXT DEFAULT '',
            opponent TEXT DEFAULT '',
            home INTEGER DEFAULT NULL,
            time_str TEXT DEFAULT '',
            match_type TEXT DEFAULT '',
            note TEXT DEFAULT '',
            manually_edited INTEGER DEFAULT 0,
            excel_import_id TEXT,
            created_at TEXT DEFAULT '',
            updated_at TEXT DEFAULT '',
            salle TEXT DEFAULT '',
            camionnette TEXT DEFAULT '',
            conducteur TEXT DEFAULT '',
            heure_depart TEXT DEFAULT '',
            lieu_rdv TEXT DEFAULT '',
            saison TEXT DEFAULT ''
        )
    """)

    db_execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            hashed_password TEXT NOT NULL,
            role TEXT DEFAULT 'viewer',
            team_filter TEXT DEFAULT ''
        )
    """)

    db_execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            created_at TEXT DEFAULT ''
        )
    """)

    db_execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT DEFAULT ''
        )
    """)

    db_execute("""
        CREATE TABLE IF NOT EXISTS import_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT DEFAULT '',
            imported_at TEXT DEFAULT '',
            rows_created INTEGER DEFAULT 0,
            rows_updated INTEGER DEFAULT 0,
            rows_skipped INTEGER DEFAULT 0,
            status TEXT DEFAULT 'ok',
            message TEXT DEFAULT ''
        )
    """)

    db_execute("""
        CREATE TABLE IF NOT EXISTS indispos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT DEFAULT '',
            salle TEXT DEFAULT '',
            raison TEXT DEFAULT ''
        )
    """)

    db_execute("""
        CREATE TABLE IF NOT EXISTS app_metadata (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version TEXT DEFAULT '1.0.0',
            last_updated TEXT DEFAULT '',
            last_commit TEXT DEFAULT '',
            deploy_message TEXT DEFAULT ''
        )
    """)

    db_execute("""
        CREATE TABLE IF NOT EXISTS import_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            import_id TEXT UNIQUE,
            status TEXT DEFAULT 'starting',
            progress INTEGER DEFAULT 0,
            message TEXT DEFAULT '',
            created_at TEXT DEFAULT '',
            updated_at TEXT DEFAULT ''
        )
    """)

    # Migration: ajouter colonnes si absentes
    for col_sql in [
        "ALTER TABLE matches ADD COLUMN salle TEXT DEFAULT ''",
        "ALTER TABLE matches ADD COLUMN camionnette TEXT DEFAULT ''",
        "ALTER TABLE matches ADD COLUMN conducteur TEXT DEFAULT ''",
        "ALTER TABLE matches ADD COLUMN heure_depart TEXT DEFAULT ''",
        "ALTER TABLE matches ADD COLUMN lieu_rdv TEXT DEFAULT ''",
        "ALTER TABLE matches ADD COLUMN saison TEXT DEFAULT ''",
    ]:
        try:
            db_execute(col_sql)
        except:
            pass

    # Saison par defaut
    db_execute("INSERT OR IGNORE INTO settings (key,value) VALUES ('current_saison', ?)", ("2025-2026",))

    # Retro-remplissage saison
    try:
        rows = db_fetchall("SELECT id, date_iso FROM matches WHERE saison='' OR saison IS NULL")
        for r in rows:
            s = _saison_from_date(r["date_iso"])
            if s:
                db_execute("UPDATE matches SET saison=? WHERE id=?", (s, r["id"]))
    except Exception as e:
        print(f"[WARN] backfill saison: {e}")

    # Initialiser la version
    try:
        metadata = db_fetchone("SELECT * FROM app_metadata LIMIT 1")
        if not metadata:
            db_execute("INSERT INTO app_metadata (version, last_updated, last_commit, deploy_message) VALUES (?, ?, ?, ?)",
                       ("1.0.0", datetime.now().isoformat(), "", "Initial version"))
    except Exception as e:
        print(f"[INIT] Initialisation app_metadata: {e}")


# Initialiser la base de donnees au demarrage
_init_db()


# ============================================================================
# FONCTIONS DE VERSION ET METADONNEES
# ============================================================================

def _saison_from_date(date_iso: str) -> str:
    """Deduit la saison (ex: '2025-2026') a partir d'une date ISO 'YYYY-MM-DD'."""
    try:
        y, m = int(date_iso[0:4]), int(date_iso[5:7])
    except Exception:
        return ""
    if m >= 7:
        return f"{y}-{y+1}"
    return f"{y-1}-{y}"


def _increment_version():
    """Increment la version selon le versionnement semantique (patch)."""
    metadata = db_fetchone("SELECT version FROM app_metadata LIMIT 1")
    if not metadata or not metadata["version"]:
        return "1.0.0"
    
    current_version = metadata["version"]
    parts = current_version.split('.')
    
    if len(parts) != 3:
        return "1.0.0"
    
    try:
        major, minor, patch = int(parts[0]), int(parts[1]), int(parts[2])
        new_version = f"{major}.{minor}.{patch + 1}"
        
        now = datetime.now().isoformat()
        db_execute("UPDATE app_metadata SET version=?, last_updated=?, deploy_message=? WHERE id=1",
                   (new_version, now, f"Auto-increment from {current_version} to {new_version}"))
        
        return new_version
    except:
        return current_version


def _get_app_version():
    """Recupere la version actuelle de l'application."""
    metadata = db_fetchone("SELECT version, last_updated, last_commit, deploy_message FROM app_metadata LIMIT 1")
    if not metadata:
        now = datetime.now().isoformat()
        db_execute("INSERT INTO app_metadata (version, last_updated, last_commit, deploy_message) VALUES (?, ?, ?, ?)",
                   ("1.0.0", now, "", "Initial version"))
        return {"version": "1.0.0", "last_updated": now, "last_commit": "", "deploy_message": "Initial version"}
    
    return {
        "version": metadata["version"],
        "last_updated": metadata["last_updated"],
        "last_commit": metadata["last_commit"],
        "deploy_message": metadata["deploy_message"]
    }


# ============================================================================
# AUTHENTIFICATION
# ============================================================================

def _auth(token: str) -> dict:
    """Verifie le token et retourne l'utilisateur"""
    if not token:
        raise HTTPException(401, "Token requis")
    
    session = db_fetchone("SELECT username FROM sessions WHERE token=?", (token,))
    if not session:
        raise HTTPException(401, "Token invalide ou expire")
    
    user = db_fetchone("SELECT username, role FROM users WHERE username=?", (session["username"],))
    if not user:
        raise HTTPException(401, "Utilisateur non trouve")
    
    return user


# ============================================================================
# PARSING EXCEL
# ============================================================================

def _read_xls(path):
    """Parse les fichiers .xls avec xlrd"""
    wb = xlrd.open_workbook(path, formatting_info=True)
    sh = wb.sheet_by_name("Planning")
    teams = {c: {"name":_s(sh.cell_value(TEAM_ROW,c)),"coach":_s(sh.cell_value(COACH_ROW,c))}
             for c in range(FIRST_TEAM_COL, sh.ncols) if _s(sh.cell_value(TEAM_ROW,c))}

    # Lire valeurs + couleurs de fond
    raw_vals = {}
    raw_bg = {}
    for r in range(HEADER_ROWS, sh.nrows):
        for c in range(sh.ncols):
            v = _s(sh.cell_value(r, c))
            if v:
                raw_vals[(r,c)] = v
        for c in range(FIRST_TEAM_COL, sh.ncols):
            try:
                xf = wb.xf_list[sh.cell_xf_index(r, c)]
                bg = xf.background.pattern_colour_index
                if bg not in (9, 64, 65, 0):
                    raw_bg[(r,c)] = bg
            except:
                pass

    # Construire journee_map
    IS_JOURNEE = re.compile(r"^(journee|journee|j\d+$|coupe|amical|phase\s+\d|tour\s+\d|\d+e\s+tour)", re.I)
    journee_index = {}
    nrows = sh.nrows
    for r in range(HEADER_ROWS, nrows):
        for c in range(FIRST_TEAM_COL, sh.ncols):
            if (r,c) not in raw_vals:
                continue
            for j in range(1, 4):
                rj = r + j
                if rj >= nrows:
                    break
                v2 = raw_vals.get((rj, c), "")
                if v2 and IS_JOURNEE.match(v2.strip()):
                    journee_index[(r,c)] = v2
                    break

    rows = []
    for r in range(HEADER_ROWS, nrows):
        row = [raw_vals.get((r,c),"") for c in range(sh.ncols)]
        bg_map = {c: raw_bg.get((r,c), 9) for c in range(FIRST_TEAM_COL, sh.ncols)}
        journee_map = {c: journee_index[(r,c)] for c in range(FIRST_TEAM_COL, sh.ncols) if (r,c) in journee_index}
        row.append(bg_map)
        row.append(journee_map)
        rows.append(row)
    return teams, rows


def _read_xlsx(path):
    """Parse les fichiers .xlsx avec openpyxl"""
    wb = openpyxl.load_workbook(path, data_only=True)
    sh = wb["Planning"]
    teams = {c: {"name":_s(sh.cell(row=TEAM_ROW+1,column=c+1).value),"coach":_s(sh.cell(row=COACH_ROW+1,column=c+1).value)}
             for c in range(FIRST_TEAM_COL, sh.max_column+1) if _s(sh.cell(row=TEAM_ROW+1,column=c+1).value)}
    rows = [[_s(sh.cell(row=r,column=c+1).value) for c in range(sh.max_column)]
            for r in range(HEADER_ROWS+1, sh.max_row+1)]
    return teams, rows


def _detect_file_format(sh):
    """Detecte si le fichier utilise le nouveau format (salles en colonnes 0-3) ou l'ancien."""
    salle_keywords = ['hall', 'poly', 'rodemack', 'kanfen']
    for r in range(8, 11):
        for c in range(4):
            val = str(sh.cell_value(r, c)).lower()
            if any(kw in val for kw in salle_keywords):
                return "new_format"
    if sh.nrows > TEAM_ROW:
        team_val = str(sh.cell_value(TEAM_ROW, FIRST_TEAM_COL)).strip()
        if team_val and len(team_val) > 3 and any(letter.isalpha() for letter in team_val):
            return "standard"
    return "standard"


def _read_xls_new_format(path):
    """Parseur pour le nouveau format de fichier ou les salles sont dans les colonnes 0-3."""
    wb = xlrd.open_workbook(path, formatting_info=True)
    sh = wb.sheet_by_name("Planning")
    
    # Lire les salles pour chaque colonne d'equipe (lignes 8-10)
    salle_map = {}
    salle_keywords = {
        'hall': 'Hettange Hall',
        'poly': 'Hettange Poly', 
        'rodemack': 'Rodemack',
        'kanfen': 'Kanfen'
    }
    
    for c in range(5, sh.ncols):
        for r in range(8, 11):
            val = str(sh.cell_value(r, c)).lower()
            for kw, salle in salle_keywords.items():
                if kw in val:
                    salle_map[c] = salle
                    break
            if c in salle_map:
                break
        if c not in salle_map:
            try:
                xf = wb.xf_list[sh.cell_xf_index(14, c)]
                bg = xf.background.pattern_colour_index
                salle_map[c] = BG_TO_SALLE.get(bg, "")
            except:
                salle_map[c] = ""
    
    # Lire les noms des equipes (ligne 11)
    teams = {}
    for c in range(5, sh.ncols):
        name = _s(sh.cell_value(11, c))
        coach = _s(sh.cell_value(13, c)) if sh.nrows > 13 else ""
        if name:
            teams[c] = {"name": name, "coach": coach}
    
    # Lire les donnees
    matches = []
    current_date = ""
    
    for r in range(14, sh.nrows):
        dv = _s(sh.cell_value(r, DATE_COL))
        if dv and re.search(r"\d{2}/\d{2}/\d{2}", dv):
            current_date = dv.replace("\n", " ").strip()
        if not current_date: 
            continue
            
        for c in range(5, sh.ncols):
            if c not in teams:
                continue
            val = _s(sh.cell_value(r, c))
            if not val or val in ("0.0", " ") or _noise(val):
                continue
            
            home = _home_val(val)
            salle = salle_map.get(c, "")
            
            # Determiner la journee
            journee = ""
            for jr in range(r+1, min(r+4, sh.nrows)):
                jval = _s(sh.cell_value(jr, c))
                if jval and re.search(r"(journee|j\d+)", jval, re.I):
                    journee = jval.strip()
                    break
            
            matches.append({
                "date_str": current_date, "date_iso": _iso(current_date),
                "team_name": teams[c]["name"], "coach": teams[c]["coach"],
                "match_text": val, "opponent": _opponent(val),
                "home": home, "time_str": _time(val),
                "match_type": _mtype(val, journee),
                "salle": salle,
                "journee": journee,
                "excel_import_id": _key(current_date, teams[c]["name"], val),
            })
    
    return matches


def parse_excel(path):
    """Parse un fichier Excel et retourne la liste des matchs."""
    # Essayer le nouveau format en premier pour les fichiers .xls
    if path.endswith(".xls") and HAVE_XLRD:
        try:
            wb = xlrd.open_workbook(path, formatting_info=True)
            sh = wb.sheet_by_name("Planning")
            format_type = _detect_file_format(sh)
            if format_type == "new_format":
                return _read_xls_new_format(path)
        except:
            pass
    
    # Utiliser les parseurs standard
    if path.endswith(".xls") and HAVE_XLRD: 
        teams, rows = _read_xls(path)
    elif HAVE_OPENPYXL: 
        teams, rows = _read_xlsx(path)
    else: 
        raise RuntimeError("xlrd ou openpyxl requis")
    
    matches, current_date = [], ""
    for row in rows:
        journee_map = row[-1] if isinstance(row[-1], dict) else {}
        bg_map = row[-2] if len(row)>=2 and isinstance(row[-2], dict) else {}
        dv = row[DATE_COL] if len(row)>DATE_COL else ""
        if dv and re.search(r"\d{2}/\d{2}/\d{2}", dv):
            current_date = dv.replace("\n"," ").strip()
        if not current_date:
            continue
        for col, team in teams.items():
            if col>=len(row)-1:
                continue
            val = row[col]
            if not val or val in ("0.0"," ") or _noise(val):
                continue
            home = _home_val(val)
            salle = ""
            if home == 1:
                bg = bg_map.get(col, 9)
                salle = BG_TO_SALLE.get(bg, "Kanfen")
            journee = journee_map.get(col, "")
            matches.append({
                "date_str": current_date, "date_iso": _iso(current_date),
                "team_name": team["name"], "coach": team["coach"],
                "match_text": val, "opponent": _opponent(val),
                "home": home, "time_str": _time(val),
                "match_type": _mtype(val, journee),
                "salle": salle,
                "journee": journee,
                "excel_import_id": _key(current_date, team["name"], val),
            })
    return matches


# ============================================================================
# IMPORT DES MATCHS
# ============================================================================

def do_import(path, filename, progress_callback=None):
    """
    Importe les matchs depuis un fichier Excel.
    progress_callback est une fonction optionnelle qui prend (progress, status, message).
    """
    now = datetime.now().isoformat()
    import_id = str(uuid.uuid4())
    
    # Initialiser la progression
    try:
        db_execute("INSERT INTO import_progress (import_id, status, progress, message, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                   (import_id, "parsing", 0, "Debu du parsing du fichier...", now, now))
        if progress_callback:
            progress_callback(0, "parsing", "Debu du parsing du fichier...")
    except:
        pass
    
    try: 
        parsed = parse_excel(path)
        try:
            db_execute("UPDATE import_progress SET status=?, progress=?, message=?, updated_at=? WHERE import_id=?",
                       ("processing", 10, f"Fichier parse: {len(parsed)} matchs trouves", now, import_id))
            if progress_callback:
                progress_callback(10, "processing", f"Fichier parse: {len(parsed)} matchs trouves")
        except:
            pass
    except Exception as e:
        try:
            db_execute("UPDATE import_progress SET status=?, progress=?, message=?, updated_at=? WHERE import_id=?",
                       ("error", 0, f"Erreur lors du parsing: {str(e)}", now, import_id))
        except:
            pass
        return {"status":"error","message":str(e),"created":0,"updated":0,"skipped":0,"filename":filename,"total_matches":0,"processed_matches":0}

    created = updated = skipped = 0
    total_matches = len(parsed)

    existing_rows = db_fetchall("SELECT id, excel_import_id, manually_edited FROM matches WHERE excel_import_id IS NOT NULL")
    existing_map = {r["excel_import_id"]: r for r in existing_rows}

    to_insert = []
    to_update = []

    for m in parsed:
        key = m["excel_import_id"]
        ex = existing_map.get(key)
        saison = _saison_from_date(m["date_iso"])
        if ex:
            if ex["manually_edited"]:
                skipped += 1
                continue
            to_update.append((m["match_text"],m["opponent"],m["home"],m["time_str"],
                               m["match_type"],m.get("salle",""),saison,now, ex["id"]))
            updated += 1
        else:
            to_insert.append((m["date_str"],m["date_iso"],m["team_name"],m["coach"],
                               m["match_text"],m["opponent"],m["home"],m["time_str"],
                               m["match_type"],"",m["excel_import_id"],now,now,
                               m.get("salle",""),m.get("journee",""),saison))
            created += 1

    BATCH = 50
    total_batches = (len(to_update) // BATCH) + (1 if len(to_update) % BATCH else 0)
    for batch_num, i in enumerate(range(0, len(to_update), BATCH)):
        batch = to_update[i:i+BATCH]
        for args in batch:
            db_execute("UPDATE matches SET match_text=?,opponent=?,home=?,time_str=?,match_type=?,salle=?,saison=?,updated_at=? WHERE id=?", args)
        progress = 20 + int((batch_num + 1) / max(total_batches, 1) * 40)
        try:
            db_execute("UPDATE import_progress SET status=?, progress=?, message=?, updated_at=? WHERE import_id=?",
                       ("updating", progress, f"Mise a jour des matchs: {batch_num + 1}/{total_batches} lots", now, import_id))
            if progress_callback:
                progress_callback(progress, "updating", f"Mise a jour des matchs: {batch_num + 1}/{total_batches} lots")
        except:
            pass

    total_insert_batches = (len(to_insert) // BATCH) + (1 if len(to_insert) % BATCH else 0)
    for batch_num, i in enumerate(range(0, len(to_insert), BATCH)):
        batch = to_insert[i:i+BATCH]
        for args in batch:
            db_execute("""INSERT INTO matches (date_str,date_iso,team_name,coach,match_text,opponent,home,
                          time_str,match_type,note,manually_edited,excel_import_id,created_at,updated_at,salle,journee,saison)
                          VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?)""", args)
        progress = 60 + int((batch_num + 1) / max(total_insert_batches, 1) * 30)
        try:
            db_execute("UPDATE import_progress SET status=?, progress=?, message=?, updated_at=? WHERE import_id=?",
                       ("inserting", progress, f"Insertion des matchs: {batch_num + 1}/{total_insert_batches} lots", now, import_id))
            if progress_callback:
                progress_callback(progress, "inserting", f"Insertion des matchs: {batch_num + 1}/{total_insert_batches} lots")
        except:
            pass

    try:
        db_execute("UPDATE import_progress SET status=?, progress=?, message=?, updated_at=? WHERE import_id=?",
                   ("completed", 100, f"Import termine: {created} crees, {updated} mis a jour, {skipped} ignores", now, import_id))
        if progress_callback:
            progress_callback(100, "completed", f"Import termine: {created} crees, {updated} mis a jour, {skipped} ignores")
    except:
        pass

    db_execute("INSERT INTO import_logs (filename,imported_at,rows_created,rows_updated,rows_skipped,status,message) VALUES (?,?,?,?,?,?,?)",
               (filename, now, created, updated, skipped, "ok", ""))
    return {"status":"ok","filename":filename,"created":created,"updated":updated,"skipped":skipped,"message":"",
            "total_matches":total_matches,"processed_matches":created+updated+skipped,"import_id":import_id}


# ============================================================================
# UTILITAIRES DE FORMATAGE
# ============================================================================

def _fix(m: dict) -> dict:
    """Normalise les donnees d'un match"""
    m["home"] = True if m.get("home")==1 else (False if m.get("home")==0 else None)
    m["manually_edited"] = bool(m.get("manually_edited",0))
    return m


# ============================================================================
# PAGES HTML (pour compatibilite)
# ============================================================================

def _html(name):
    """Charge un fichier HTML depuis public/"""
    try:
        with open(Path(__file__).parent.parent / "public" / name, "r", encoding="utf-8") as f:
            return f.read()
    except:
        return "<html><body>Page non trouvee</body></html>"


# ============================================================================
# ENDPOINTS FASTAPI
# ============================================================================

# --- Pages HTML ---
@app.get("/")
def page_index():
    return HTMLResponse(_html("index.html"))

@app.get("/admin")
def page_admin():
    return HTMLResponse(_html("admin.html"))

@app.get("/salles")
def page_salles():
    return HTMLResponse(_html("salles.html"))

@app.get("/evenements")
def page_evenements():
    return HTMLResponse(_html("evenements.html"))

@app.get("/classements")
def page_classements():
    return HTMLResponse(_html("classements.html"))


# --- Proxy FFHB ---
@app.get("/api/ffhb-proxy")
async def ffhb_proxy(url: str = ""):
    """Proxy CORS pour les requetes FFHB."""
    import httpx
    ALLOWED = ["ffhandball.fr", "competitions.ffhandball.fr"]
    if not any(d in url for d in ALLOWED):
        raise HTTPException(400, "URL non autorisee")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url, headers={"User-Agent": "EHR-Planning/1.0", "Accept": "application/json"})
            return r.json()
    except Exception as e:
        raise HTTPException(502, f"Erreur proxy: {e}")


# --- Authentification ---
@app.post("/api/login")
def login(username: str=Form(...), password: str=Form(...)):
    u = db_fetchone("SELECT username,hashed_password,role FROM users WHERE username=?", (username,))
    if not u or u["hashed_password"] != _hash(password):
        raise HTTPException(401, "Identifiants invalides")
    token = secrets.token_hex(32)
    now = datetime.now().isoformat()
    try:
        db_execute("CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, username TEXT NOT NULL, created_at TEXT DEFAULT '')")
    except: pass
    db_execute("INSERT OR REPLACE INTO sessions (token,username,created_at) VALUES (?,?,?)",
               (token, username, now))
    return {"token": token, "role": u["role"], "username": username}

@app.post("/api/logout")
def logout(token: str=Form("")):
    if token:
        try:
            db_execute("DELETE FROM sessions WHERE token=?", (token,))
        except: pass
    return {"ok": True}

@app.get("/api/me")
def me(token: str=""):
    try:
        u = _auth(token)
        return {"username": u["username"], "role": u["role"]}
    except:
        return {"username": None, "role": None}


# --- Reset Admin ---
@app.post("/api/reset-admin")
def reset_admin(secret: str = Form("")):
    """Recree l'admin par defaut si absent ou mot de passe oublie."""
    expected = os.environ.get("RESET_ADMIN_SECRET", "")
    if not expected:
        raise HTTPException(403, "Reinitialisation desactivee (RESET_ADMIN_SECRET non configure)")
    if not secrets.compare_digest(secret, expected):
        raise HTTPException(403, "Secret invalide")
    import hashlib
    pwd = hashlib.sha256(b"ehr2025").hexdigest()
    try:
        db_execute("DELETE FROM users WHERE username='admin'")
    except: pass
    db_execute(
        "INSERT OR REPLACE INTO users (username,hashed_password,role,team_filter) VALUES (?,?,?,?)",
        ("admin", pwd, "admin", "")
    )
    return {"ok": True, "message": "Admin reinitialise avec mot de passe 'ehr2025' — change-le immediatement"}


# --- Users Management ---
@app.get("/api/users")
def list_users(token: str=""):
    _auth(token)
    return db_fetchall("SELECT id,username,role,team_filter FROM users")

@app.post("/api/users")
def create_user(username: str=Form(...), password: str=Form(...),
                role: str=Form("viewer"), team_filter: str=Form(""), token: str=Form("")):
    _auth(token)
    if db_fetchone("SELECT id FROM users WHERE username=?