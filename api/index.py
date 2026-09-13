"""
api/index.py — EHR Planning, fichier unique pour Vercel.
Tout est ici : DB, import Excel, API REST, pages HTML.
"""
import hashlib, os, tempfile, secrets, re, sys
from datetime import datetime
from pathlib import Path
from typing import Optional

# ── Fix import path pour Vercel ───────────────────────────────────────────────
sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, HTMLResponse
import libsql_experimental as libsql

# ── Config ────────────────────────────────────────────────────────────────────
TURSO_URL   = os.environ.get("TURSO_URL", "")
TURSO_TOKEN = os.environ.get("TURSO_TOKEN", "")

# ── Base de données ───────────────────────────────────────────────────────────

def get_conn():
    if TURSO_URL:
        return libsql.connect(database=TURSO_URL, auth_token=TURSO_TOKEN or "", sync_url=TURSO_URL)
    return libsql.connect("/tmp/ehr_local.db")

def db_fetchall(sql: str, params: tuple = ()) -> list:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(sql, params)
    if not cur.description:
        return []
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in (cur.fetchall() or [])]

def db_fetchone(sql: str, params: tuple = ()):
    r = db_fetchall(sql, params)
    return r[0] if r else None

def db_execute(sql: str, params: tuple = ()):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(sql, params)
    conn.commit()
    return cur.lastrowid

def db_init():
    conn = get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date_str TEXT NOT NULL DEFAULT '',
            date_iso TEXT NOT NULL DEFAULT '9999-99-99',
            team_name TEXT NOT NULL DEFAULT '',
            coach TEXT DEFAULT '',
            match_text TEXT NOT NULL DEFAULT '',
            opponent TEXT DEFAULT '',
            home INTEGER,
            time_str TEXT DEFAULT '',
            journee TEXT DEFAULT '',
            match_type TEXT DEFAULT 'champ',
            note TEXT DEFAULT '',
            manually_edited INTEGER DEFAULT 0,
            excel_import_id TEXT,
            created_at TEXT DEFAULT '',
            updated_at TEXT DEFAULT '',
            salle TEXT DEFAULT '',
            camionnette TEXT DEFAULT '',
            conducteur TEXT DEFAULT '',
            heure_depart TEXT DEFAULT '',
            lieu_rdv TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            hashed_password TEXT NOT NULL,
            role TEXT DEFAULT 'viewer',
            team_filter TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS import_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT DEFAULT '',
            imported_at TEXT DEFAULT '',
            rows_created INTEGER DEFAULT 0,
            rows_updated INTEGER DEFAULT 0,
            rows_skipped INTEGER DEFAULT 0,
            status TEXT DEFAULT 'ok',
            message TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS app_metadata (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version TEXT DEFAULT '1.0.0',
            last_updated TEXT DEFAULT '',
            last_commit TEXT DEFAULT '',
            deploy_message TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS import_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            import_id TEXT UNIQUE,
            status TEXT DEFAULT 'starting',
            progress INTEGER DEFAULT 0,
            message TEXT DEFAULT '',
            created_at TEXT DEFAULT '',
            updated_at TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            created_at TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS evenements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            titre TEXT NOT NULL DEFAULT '',
            date_iso TEXT NOT NULL DEFAULT '',
            date_str TEXT DEFAULT '',
            heure TEXT DEFAULT '',
            lieu TEXT DEFAULT '',
            description TEXT DEFAULT '',
            categorie TEXT DEFAULT 'club',
            created_at TEXT DEFAULT '',
            updated_at TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS indispos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            salle TEXT NOT NULL,
            date_iso TEXT NOT NULL,
            label TEXT DEFAULT '',
            created_at TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS team_coaches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_name TEXT NOT NULL,
            coach_name TEXT NOT NULL,
            coach_order INTEGER DEFAULT 1,
            created_at TEXT DEFAULT '',
            updated_at TEXT DEFAULT '',
            UNIQUE(team_name, coach_order)
        );
        CREATE TABLE IF NOT EXISTS team_parents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_name TEXT NOT NULL,
            parent_name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'responsable_stable_de_marque',
            phone TEXT DEFAULT '',
            email TEXT DEFAULT '',
            created_at TEXT DEFAULT '',
            updated_at TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'autre',
            quantity INTEGER DEFAULT 1,
            location TEXT DEFAULT '',
            responsible TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            created_at TEXT DEFAULT '',
            updated_at TEXT DEFAULT ''
        );
    """)
    conn.commit()
    pwd = hashlib.sha256(b"ehr2025").hexdigest()
    db_execute(
        "INSERT OR IGNORE INTO users (username,hashed_password,role) VALUES (?,?,?)",
        ("admin", pwd, "admin")
    )
    # Migration: ajouter colonnes si absentes (idempotent via try/except)
    for col_sql in [
        "ALTER TABLE matches ADD COLUMN salle TEXT DEFAULT ''",
        "ALTER TABLE matches ADD COLUMN camionnette TEXT DEFAULT ''",
        "ALTER TABLE matches ADD COLUMN conducteur TEXT DEFAULT ''",
        "ALTER TABLE matches ADD COLUMN heure_depart TEXT DEFAULT ''",
        "ALTER TABLE matches ADD COLUMN lieu_rdv TEXT DEFAULT ''",
        "ALTER TABLE matches ADD COLUMN saison TEXT DEFAULT ''",
    ]:
        try: db_execute(col_sql)
        except: pass

    # Saison par défaut si jamais configurée (ne touche pas si déjà présente)
    db_execute("INSERT OR IGNORE INTO settings (key,value) VALUES ('current_saison', ?)", ("2025-2026",))

    # Rétro-remplissage : déduit la saison depuis date_iso pour les matchs qui n'en ont pas encore
    try:
        rows = db_fetchall("SELECT id, date_iso FROM matches WHERE saison='' OR saison IS NULL")
        for r in rows:
            s = _saison_from_date(r["date_iso"])
            if s:
                db_execute("UPDATE matches SET saison=? WHERE id=?", (s, r["id"]))
    except Exception as e:
        print(f"[WARN] backfill saison: {e}")

    # Initialiser la version de l'application
    try:
        metadata = db_fetchone("SELECT * FROM app_metadata LIMIT 1")
        if not metadata:
            db_execute("INSERT INTO app_metadata (version, last_updated, last_commit, deploy_message) VALUES (?, ?, ?, ?)",
                       ("1.0.0", datetime.now().isoformat(), "", "Initial version"))
    except Exception as e:
        print(f"[INIT] Initialisation app_metadata: {e}")

# ── Import Excel ──────────────────────────────────────────────────────────────

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

TEAM_ROW = 11; COACH_ROW = 13; DATE_COL = 4; FIRST_TEAM_COL = 5; HEADER_ROWS = 14

def _saison_from_date(date_iso: str) -> str:
    """Déduit la saison (ex: '2025-2026') à partir d'une date ISO 'YYYY-MM-DD'.
    Convention club : la saison démarre en juillet (fin de trêve estivale)."""
    try:
        y, m = int(date_iso[0:4]), int(date_iso[5:7])
    except Exception:
        return ""
    if m >= 7:
        return f"{y}-{y+1}"
    return f"{y-1}-{y}"

def _s(v): return str(v).strip() if v is not None else ""
def _iso(s):
    try:
        p = s.split(" ")[0].split("/"); d,m,y = p[0],p[1],p[2]
        if len(y)==2: y="20"+y
        return f"{y}-{m.zfill(2)}-{d.zfill(2)}"
    except: return "9999-99-99"
def _time(t):
    m = re.search(r"à\s*([\d]+h[\d]*)", t, re.IGNORECASE)
    return m.group(1) if m else ""
def _opponent(text):
    line = text.split("\n")[0].strip()
    if " - EHR" in line: return line.split(" - EHR")[0].strip()
    if "EHR - " in line: return line.split("EHR - ")[1].strip()
    return line.replace("EHR","").replace("-","").strip()
def _home_val(text):
    line = text.split("\n")[0]
    if re.search(r"^EHR[\s\-]", line): return 1
    if re.search(r"\-\s*EHR", line): return 0
    return None
def _mtype(text, journee=""):
    t,j = text.lower(), journee.lower()
    if re.search(r"exempt|forfait", t): return "exempt"
    if re.search(r"report", t) and not re.search(r"coupe|cdf", t+j): return "report"
    if re.search(r"coupe|cdf|moselle|moelle", t+j): return "coupe"
    if re.search(r"amical|tournoi", t+j): return "amical"
    return "champ"
def _key(date_str, team, text):
    return hashlib.md5(f"{date_str}|{team}|{text.split(chr(10))[0]}".encode()).hexdigest()[:16]
def _noise(text):
    """Retourne True si le texte est un label/note et pas un vrai match."""
    noise = [
        r"^journée\s+\d",    # Journée 1, Journée 2...
        r"^j\d+$",             # J1, J2...
        r"^coupe de",           # Coupe de Moselle...
        r"^match amical$",
        r"^forfait g",
        r"^retrait ",
        r"impératif",
        r"report du",
        r"avancé au",
        r"^a placer",           # a placer le samedi
        r"^faire conclusion",   # Faire conclusion hors délai
        r"^dde report",         # dde report pour le ...
        r"^suite inversion",
        r"^demande de report",
        r"^sans colle",
        r"^modif salle",
        r"^inversion accept",
        r"^report$",            # juste "Report"
        r"^exempt\s*\d*$",    # Exempt seul (géré ailleurs)
        r"^\d+h\d*\s*[-–]",    # 18h00 - 20h00 (créneau)
        r"^coupe de moselle",
        r"^coupe de france",
        r"^plateau",
        r"^tournoi",
    ]
    t = text.lower().strip()
    # Filtre longueur
    if len(t) < 4: return True
    # Filtre patterns
    if any(re.search(p, t) for p in noise): return True
    # Un vrai match DOIT contenir "EHR" ou un nom d adversaire reconnaissable
    # Si pas de lettre du tout (juste chiffres/symbols) -> noise
    if not re.search(r'[a-zA-ZÀ-ÿ]{3,}', text): return True
    return False

# Mapping couleur de fond Excel → salle EHR
BG_TO_SALLE = {
    40: "Hettange Hall",   # bleu  #00CCFF
    50: "Hettange Poly",   # vert  #99CC00
    13: "Rodemack",        # jaune #FFFF00
    51: "Kanfen",          # orange #FFCC00
    9:  "",                # blanc = salle non definie
    64: "",                # pas de fond = salle non definie
    65: "",
    0:  "",
}

def _read_xls(path):
    wb = xlrd.open_workbook(path, formatting_info=True)
    sh = wb.sheet_by_name("Planning")
    teams = {c: {"name":_s(sh.cell_value(TEAM_ROW,c)),"coach":_s(sh.cell_value(COACH_ROW,c))}
             for c in range(FIRST_TEAM_COL, sh.ncols) if _s(sh.cell_value(TEAM_ROW,c))}

    # Passe unique : lire valeurs + bg en une seule fois
    raw_vals = {}   # (r,c) -> str
    raw_bg   = {}   # (r,c) -> int
    for r in range(HEADER_ROWS, sh.nrows):
        for c in range(sh.ncols):
            v = _s(sh.cell_value(r, c))
            if v: raw_vals[(r,c)] = v
        for c in range(FIRST_TEAM_COL, sh.ncols):
            try:
                xf = wb.xf_list[sh.cell_xf_index(r, c)]
                bg = xf.background.pattern_colour_index
                if bg not in (9, 64, 65, 0): raw_bg[(r,c)] = bg
            except: pass

    # Construire journee_map : pour chaque (r,c) qui contient un match,
    # chercher la journée dans la même colonne, lignes r+1..r+3
    IS_JOURNEE = re.compile(r"^(journee|journée|j\d+$|coupe|amical|phase\s+\d|tour\s+\d|\d+e\s+tour)", re.I)
    journee_index = {}  # (r,c) -> str
    nrows = sh.nrows
    for r in range(HEADER_ROWS, nrows):
        for c in range(FIRST_TEAM_COL, sh.ncols):
            if (r,c) not in raw_vals: continue
            for j in range(1, 4):
                rj = r + j
                if rj >= nrows: break
                v2 = raw_vals.get((rj, c), "")
                if v2 and IS_JOURNEE.match(v2.strip()):
                    journee_index[(r,c)] = v2
                    break

    # Construire rows : liste de (row_list, bg_map, journee_map) par r
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
    wb = openpyxl.load_workbook(path, data_only=True); sh = wb["Planning"]
    teams = {c: {"name":_s(sh.cell(row=TEAM_ROW+1,column=c+1).value),"coach":_s(sh.cell(row=COACH_ROW+1,column=c+1).value)}
             for c in range(FIRST_TEAM_COL, sh.max_column+1) if _s(sh.cell(row=TEAM_ROW+1,column=c+1).value)}
    rows = [[_s(sh.cell(row=r,column=c+1).value) for c in range(sh.max_column)]
            for r in range(HEADER_ROWS+1, sh.max_row+1)]
    return teams, rows


def _detect_file_format(sh):
    """Détecte si le fichier utilise le nouveau format (salles en colonnes 0-3) ou l'ancien (couleurs de fond)."""
    # Vérifier si les colonnes 0-3 contiennent des noms de salles
    salle_keywords = ['hall', 'poly', 'rodemack', 'kanfen']
    for r in range(8, 11):
        for c in range(4):
            val = str(sh.cell_value(r, c)).lower()
            if any(kw in val for kw in salle_keywords):
                return "new_format"
    # Vérifier si la ligne TEAM_ROW contient des noms d'équipes
    if sh.nrows > TEAM_ROW:
        team_val = str(sh.cell_value(TEAM_ROW, FIRST_TEAM_COL)).strip()
        if team_val and len(team_val) > 3 and any(letter.isalpha() for letter in team_val):
            return "standard"
    return "standard"


def _read_xls_new_format(path):
    """Parseur pour le nouveau format de fichier où les salles sont dans les colonnes 0-3."""
    wb = xlrd.open_workbook(path, formatting_info=True)
    sh = wb.sheet_by_name("Planning")
    
    # Lire les salles pour chaque colonne d'équipe (lignes 8-10)
    # Mapping: colonne -> salle
    salle_map = {}
    salle_keywords = {
        'hall': 'Hettange Hall',
        'poly': 'Hettange Poly', 
        'rodemack': 'Rodemack',
        'kanfen': 'Kanfen'
    }
    
    for c in range(5, sh.ncols):
        # Vérifier les lignes 8, 9, 10 pour cette colonne
        for r in range(8, 11):
            val = str(sh.cell_value(r, c)).lower()
            for kw, salle in salle_keywords.items():
                if kw in val:
                    salle_map[c] = salle
                    break
            if c in salle_map:
                break
        # Si aucune salle trouvée, essayer avec la couleur de fond
        if c not in salle_map:
            try:
                xf = wb.xf_list[sh.cell_xf_index(14, c)]
                bg = xf.background.pattern_colour_index
                salle_map[c] = BG_TO_SALLE.get(bg, "")
            except:
                salle_map[c] = ""
    
    # Lire les noms des équipes (ligne 11)
    teams = {}
    for c in range(5, sh.ncols):
        name = _s(sh.cell_value(11, c))
        coach = _s(sh.cell_value(13, c)) if sh.nrows > 13 else ""
        if name:
            teams[c] = {"name": name, "coach": coach}
    
    # Lire les données
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
            
            # Déterminer la journée (chercher "Journée X" ou "JX" dans les lignes suivantes)
            journee = ""
            for jr in range(r+1, min(r+4, sh.nrows)):
                jval = _s(sh.cell_value(jr, c))
                if jval and re.search(r"(journée|j\d+)", jval, re.I):
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
        teams,rows = _read_xls(path)
    elif HAVE_OPENPYXL: 
        teams,rows = _read_xlsx(path)
    else: 
        raise RuntimeError("xlrd ou openpyxl requis")
    
    matches, current_date = [], ""
    for row in rows:
        # row[-1] = journee_map, row[-2] = bg_map
        journee_map = row[-1] if isinstance(row[-1], dict) else {}
        bg_map = row[-2] if len(row)>=2 and isinstance(row[-2], dict) else {}
        dv = row[DATE_COL] if len(row)>DATE_COL else ""
        if dv and re.search(r"\d{2}/\d{2}/\d{2}", dv):
            current_date = dv.replace("\n"," ").strip()
        if not current_date: continue
        for col, team in teams.items():
            if col>=len(row)-1: continue  # -1 car bg_map est le dernier
            val = row[col]
            if not val or val in ("0.0"," ") or _noise(val): continue
            home = _home_val(val)
            # Salle depuis couleur de fond (uniquement si domicile)
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

def do_import(path, filename, progress_callback=None):
    """
    Importe les matchs depuis un fichier Excel.
    progress_callback est une fonction optionnelle qui prend (progress, status, message) pour la barre de progression.
    """
    import uuid
    now = datetime.now().isoformat()
    
    # Générer un ID unique pour cet import
    import_id = str(uuid.uuid4())
    
    # Initialiser la progression dans la base de données
    try:
        db_execute("INSERT INTO import_progress (import_id, status, progress, message, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                   (import_id, "parsing", 0, "Début du parsing du fichier...", now, now))
        if progress_callback:
            progress_callback(0, "parsing", "Début du parsing du fichier...")
    except:
        pass
    
    try: 
        parsed = parse_excel(path)
        # Mettre à jour la progression après le parsing
        try:
            db_execute("UPDATE import_progress SET status=?, progress=?, message=?, updated_at=? WHERE import_id=?",
                       ("processing", 10, f"Fichier parsé: {len(parsed)} matchs trouvés", now, import_id))
            if progress_callback:
                progress_callback(10, "processing", f"Fichier parsé: {len(parsed)} matchs trouvés")
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

    # Charger tous les excel_import_id existants en une seule requête
    existing_rows = db_fetchall("SELECT id, excel_import_id, manually_edited FROM matches WHERE excel_import_id IS NOT NULL")
    existing_map = {r["excel_import_id"]: r for r in existing_rows}

    to_insert = []
    to_update = []

    for m in parsed:
        key = m["excel_import_id"]
        ex = existing_map.get(key)
        saison = _saison_from_date(m["date_iso"])
        if ex:
            if ex["manually_edited"]: skipped += 1; continue
            to_update.append((m["match_text"],m["opponent"],m["home"],m["time_str"],
                               m["match_type"],m.get("salle",""),saison,now, ex["id"]))
            updated += 1
        else:
            to_insert.append((m["date_str"],m["date_iso"],m["team_name"],m["coach"],
                               m["match_text"],m["opponent"],m["home"],m["time_str"],
                               m["match_type"],"",m["excel_import_id"],now,now,
                               m.get("salle",""),m.get("journee",""),saison))
            created += 1

    # Exécuter les updates par lots de 50
    BATCH = 50
    total_batches = (len(to_update) // BATCH) + (1 if len(to_update) % BATCH else 0)
    for batch_num, i in enumerate(range(0, len(to_update), BATCH)):
        batch = to_update[i:i+BATCH]
        for args in batch:
            db_execute("UPDATE matches SET match_text=?,opponent=?,home=?,time_str=?,match_type=?,salle=?,saison=?,updated_at=? WHERE id=?", args)
        # Mettre à jour la progression
        progress = 20 + int((batch_num + 1) / max(total_batches, 1) * 40)
        try:
            db_execute("UPDATE import_progress SET status=?, progress=?, message=?, updated_at=? WHERE import_id=?",
                       ("updating", progress, f"Mise à jour des matchs: {batch_num + 1}/{total_batches} lots", now, import_id))
            if progress_callback:
                progress_callback(progress, "updating", f"Mise à jour des matchs: {batch_num + 1}/{total_batches} lots")
        except:
            pass

    # Exécuter les inserts par lots de 50
    total_insert_batches = (len(to_insert) // BATCH) + (1 if len(to_insert) % BATCH else 0)
    for batch_num, i in enumerate(range(0, len(to_insert), BATCH)):
        batch = to_insert[i:i+BATCH]
        for args in batch:
            db_execute("""INSERT INTO matches (date_str,date_iso,team_name,coach,match_text,opponent,home,
                          time_str,match_type,note,manually_edited,excel_import_id,created_at,updated_at,salle,journee,saison)
                          VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?)""", args)
        # Mettre à jour la progression
        progress = 60 + int((batch_num + 1) / max(total_insert_batches, 1) * 30)
        try:
            db_execute("UPDATE import_progress SET status=?, progress=?, message=?, updated_at=? WHERE import_id=?",
                       ("inserting", progress, f"Insertion des matchs: {batch_num + 1}/{total_insert_batches} lots", now, import_id))
            if progress_callback:
                progress_callback(progress, "inserting", f"Insertion des matchs: {batch_num + 1}/{total_insert_batches} lots")
        except:
            pass

    # Finaliser l'import
    try:
        db_execute("UPDATE import_progress SET status=?, progress=?, message=?, updated_at=? WHERE import_id=?",
                   ("completed", 100, f"Import terminé: {created} créés, {updated} mis à jour, {skipped} ignorés", now, import_id))
        if progress_callback:
            progress_callback(100, "completed", f"Import terminé: {created} créés, {updated} mis à jour, {skipped} ignorés")
    except:
        pass

    db_execute("INSERT INTO import_logs (filename,imported_at,rows_created,rows_updated,rows_skipped,status,message) VALUES (?,?,?,?,?,?,?)",
               (filename,now,created,updated,skipped,"ok",""))
    return {"status":"ok","filename":filename,"created":created,"updated":updated,"skipped":skipped,"message":"",
            "total_matches":total_matches,"processed_matches":created+updated+skipped,"import_id":import_id}

# ── App FastAPI ───────────────────────────────────────────────────────────────

app = FastAPI(title="EHR Planning")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
def startup():
    try: db_init()
    except Exception as e: print(f"[WARN] db_init: {e}")

# ── Auth ──────────────────────────────────────────────────────────────────────
def _hash(p): return hashlib.sha256(p.encode()).hexdigest()

def _auth(token: str) -> dict:
    if not token:
        raise HTTPException(401, "Non authentifié")
    try:
        s = db_fetchone("SELECT username FROM sessions WHERE token=?", (token,))
    except Exception:
        # Table sessions absente — la créer et demander reconnexion
        try: db_execute("CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, username TEXT NOT NULL, created_at TEXT DEFAULT '')")
        except: pass
        raise HTTPException(401, "Session expirée — veuillez vous reconnecter")
    if not s:
        raise HTTPException(401, "Session expirée — veuillez vous reconnecter")
    u = db_fetchone("SELECT id,username,role,team_filter FROM users WHERE username=?", (s["username"],))
    if not u: raise HTTPException(401, "Utilisateur introuvable")
    return u

def _pdate(s: str) -> str:
    m = re.search(r"(\d{2})/(\d{2})/(\d{2,4})", s)
    if not m: return "9999-99-99"
    d,mo,y = m.groups()
    if len(y)==2: y="20"+y
    return f"{y}-{mo}-{d}"

def _fix(m: dict) -> dict:
    m["home"] = True if m.get("home")==1 else (False if m.get("home")==0 else None)
    m["manually_edited"] = bool(m.get("manually_edited",0))
    return m

# ── Pages HTML ────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
def page_index(): return HTMLResponse(_html("index.html"))

@app.get("/admin", response_class=HTMLResponse)
def page_admin(): return HTMLResponse(_html("admin.html"))

@app.get("/salles", response_class=HTMLResponse)
def page_salles(): return HTMLResponse(_html("salles.html"))

@app.get("/evenements", response_class=HTMLResponse)
def page_evenements(): return HTMLResponse(_html("evenements.html"))

@app.get("/classements", response_class=HTMLResponse)
def page_classements(): return HTMLResponse(_html("classements.html"))

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

# ── Login ─────────────────────────────────────────────────────────────────────

@app.post("/api/login")
def login(username: str=Form(...), password: str=Form(...)):
    u = db_fetchone("SELECT username,hashed_password,role FROM users WHERE username=?", (username,))
    if not u or u["hashed_password"] != _hash(password):
        raise HTTPException(401, "Identifiants invalides")
    token = secrets.token_hex(32)
    now = datetime.now().isoformat()
    # Créer la table sessions si elle n'existe pas (sécurité supplémentaire)
    try:
        db_execute("CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, username TEXT NOT NULL, created_at TEXT DEFAULT '')")
    except: pass
    db_execute("INSERT OR REPLACE INTO sessions (token,username,created_at) VALUES (?,?,?)",
               (token, username, now))
    return {"token": token, "role": u["role"], "username": username}

@app.post("/api/reset-admin")
def reset_admin(secret: str = Form("")):
    """Recrée l'admin par défaut si absent ou mot de passe oublié.
    Protégé par un secret défini uniquement côté serveur (variable d'env RESET_ADMIN_SECRET) :
    sans ce secret configuré, l'endpoint est désactivé (personne ne peut prendre la main sur le compte admin)."""
    expected = os.environ.get("RESET_ADMIN_SECRET", "")
    if not expected:
        raise HTTPException(403, "Réinitialisation désactivée (RESET_ADMIN_SECRET non configuré côté serveur)")
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
    return {"ok": True, "message": "Admin réinitialisé avec mot de passe 'ehr2025' — change-le immédiatement après connexion"}

@app.post("/api/logout")
def logout(token: str=Form("")):
    if token:
        try: db_execute("DELETE FROM sessions WHERE token=?", (token,))
        except: pass
    return {"ok": True}

@app.get("/api/me")
def me(token: str=""):
    try: u = _auth(token); return {"username": u["username"], "role": u["role"]}
    except: return {"username": None, "role": None}


# ── Version et Métadonnées ────────────────────────────────────────────────────

def _increment_version():
    """Incrémente la version selon le versionnement sémantique."""
    metadata = db_fetchone("SELECT version FROM app_metadata LIMIT 1")
    if not metadata or not metadata["version"]:
        return "1.0.0"
    
    current_version = metadata["version"]
    parts = current_version.split('.')
    
    if len(parts) != 3:
        return "1.0.0"
    
    try:
        major, minor, patch = int(parts[0]), int(parts[1]), int(parts[2])
        # Incrémenter la version patch pour les corrections de bugs
        new_version = f"{major}.{minor}.{patch + 1}"
        
        now = datetime.now().isoformat()
        # Mettre à jour la version
        db_execute("UPDATE app_metadata SET version=?, last_updated=?, deploy_message=? WHERE id=1",
                   (new_version, now, f"Auto-increment from {current_version} to {new_version}"))
        
        return new_version
    except:
        return current_version


def _get_app_version():
    """Récupère la version actuelle de l'application."""
    metadata = db_fetchone("SELECT version, last_updated, last_commit, deploy_message FROM app_metadata LIMIT 1")
    if not metadata:
        # Créer une entrée par défaut
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


@app.post("/api/version/increment")
def increment_version(token: str=Form(""), version_type: str=Form("patch")):
    """Incrémente la version de l'application."""
    _auth(token)
    now = datetime.now().isoformat()
    
    version = _increment_version()
    
    # Mettre à jour le last_commit avec un message
    db_execute("UPDATE app_metadata SET last_commit=?, deploy_message=? WHERE id=1",
               (now, f"Manual increment to {version}"))
    
    return {"status": "ok", "version": version, "last_updated": now}


@app.post("/api/version/deploy")
def deploy_version(token: str=Form(""), commit_message: str=Form("")):
    """Marque un nouveau déploiement et incrémente automatiquement la version."""
    _auth(token)
    now = datetime.now().isoformat()
    
    # Incrémenter la version
    version = _increment_version()
    
    # Mettre à jour avec les informations de déploiement
    db_execute("UPDATE app_metadata SET last_updated=?, last_commit=?, deploy_message=? WHERE id=1",
               (now, now, commit_message or f"Deployed version {version}"))
    
    return {"status": "ok", "version": version, "last_updated": now, "message": "Version incrémentée et déploiement enregistré"}


@app.post("/api/version/deploy-auto")
def deploy_version_auto(secret: str=Form(""), commit_message: str=Form("")):
    """
    Endpoint pour le déploiement automatique (appelé par des hooks CI/CD).
    Utilise un secret spécial au lieu d'un token utilisateur.
    """
    # Vérifier le secret de déploiement automatique
    DEPLOY_SECRET = os.environ.get("DEPLOY_AUTO_SECRET", "")
    if not DEPLOY_SECRET:
        raise HTTPException(403, "Déploiement automatique désactivé (DEPLOY_AUTO_SECRET non configuré)")
    if not secrets.compare_digest(secret, DEPLOY_SECRET):
        raise HTTPException(403, "Secret de déploiement invalide")
    
    now = datetime.now().isoformat()
    
    # Incrémenter la version
    version = _increment_version()
    
    # Mettre à jour avec les informations de déploiement
    db_execute("UPDATE app_metadata SET last_updated=?, last_commit=?, deploy_message=? WHERE id=1",
               (now, now, commit_message or f"Auto-deployed version {version}"))
    
    return {"status": "ok", "version": version, "last_updated": now, "message": "Déploiement automatique enregistré"}


@app.get("/api/version")
def get_version():
    """Retourne la version actuelle et les métadonnées de l'application."""
    return _get_app_version()


# ── Matchs ────────────────────────────────────────────────────────────────────

def _current_saison() -> str:
    row = db_fetchone("SELECT value FROM settings WHERE key='current_saison'")
    return (row or {}).get("value", "")

@app.get("/api/matches")
def list_matches(team: str="", month: str="", match_type: str="", search: str="", saison: str=""):
    if not saison:
        saison = _current_saison()
    sql = "SELECT * FROM matches WHERE 1=1"; p = []
    if saison and saison != "all": sql += " AND saison=?"; p.append(saison)
    if team:       sql += " AND team_name=?";    p.append(team)
    if month:      sql += " AND date_iso LIKE ?"; p.append(month+"%")
    if match_type: sql += " AND match_type=?";   p.append(match_type)
    sql += " ORDER BY date_iso, team_name"
    results = [_fix(m) for m in db_fetchall(sql, tuple(p))]
    if search:
        s = search.lower()
        results = [m for m in results if s in (str(m.get("match_text",""))+str(m.get("team_name",""))+str(m.get("opponent",""))+str(m.get("coach",""))).lower()]
    return results

@app.get("/api/matches/{match_id}")
def get_match(match_id: int):
    m = db_fetchone("SELECT * FROM matches WHERE id=?", (match_id,))
    if not m: raise HTTPException(404, "Match introuvable")
    return _fix(m)

@app.post("/api/matches")
def create_match(
    date_str: str=Form(...), team_name: str=Form(...), match_text: str=Form(...),
    coach: str=Form(""), opponent: str=Form(""), home: Optional[str]=Form(None),
    time_str: str=Form(""), journee: str=Form(""), match_type: str=Form("champ"),
    note: str=Form(""), token: str=Form(""),
    salle: str=Form(""), camionnette: str=Form(""), conducteur: str=Form(""),
    heure_depart: str=Form(""), lieu_rdv: str=Form(""), saison: str=Form(""),
):
    _auth(token)
    hv = 1 if home=="true" else (0 if home=="false" else None)
    now = datetime.now().isoformat()
    date_iso = _pdate(date_str)
    sv = saison or _saison_from_date(date_iso)
    new_id = db_execute(
        """INSERT INTO matches (date_str,date_iso,team_name,coach,match_text,opponent,home,
           time_str,journee,match_type,note,manually_edited,created_at,updated_at,
           salle,camionnette,conducteur,heure_depart,lieu_rdv,saison)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?)""",
        (date_str,date_iso,team_name,coach,match_text,opponent,hv,time_str,journee,match_type,note,now,now,
         salle,camionnette,conducteur,heure_depart,lieu_rdv,sv)
    )
    return get_match(new_id)

@app.put("/api/matches/{match_id}")
def update_match(
    match_id: int, date_str: str=Form(""), team_name: str=Form(""),
    match_text: str=Form(""), coach: str=Form(""), opponent: str=Form(""),
    home: Optional[str]=Form(None), time_str: str=Form(""), journee: str=Form(""),
    match_type: str=Form(""), note: str=Form(""), token: str=Form(""),
    salle: str=Form(""), camionnette: str=Form(""), conducteur: str=Form(""),
    heure_depart: str=Form(""), lieu_rdv: str=Form(""), saison: str=Form(""),
):
    _auth(token)
    now = datetime.now().isoformat()
    hv = 1 if home=="true" else (0 if home=="false" else None)
    sets, p = [], []
    if date_str:
        d_iso = _pdate(date_str)
        sets+=["date_str=?","date_iso=?"]; p+=[date_str,d_iso]
        if not saison: saison = _saison_from_date(d_iso)
    if saison:     sets.append("saison=?"); p.append(saison)
    if team_name:  sets.append("team_name=?"); p.append(team_name)
    if match_text: sets.append("match_text=?"); p.append(match_text)
    if coach:      sets.append("coach=?"); p.append(coach)
    if opponent:   sets.append("opponent=?"); p.append(opponent)
    if home is not None: sets.append("home=?"); p.append(hv)
    if time_str:   sets.append("time_str=?"); p.append(time_str)
    if journee:    sets.append("journee=?"); p.append(journee)
    if match_type: sets.append("match_type=?"); p.append(match_type)
    sets+=["note=?","salle=?","camionnette=?","conducteur=?","heure_depart=?","lieu_rdv=?",
           "manually_edited=1","updated_at=?"]
    p+=[note,salle,camionnette,conducteur,heure_depart,lieu_rdv,now,match_id]
    db_execute(f"UPDATE matches SET {', '.join(sets)} WHERE id=?", tuple(p))
    return get_match(match_id)

@app.delete("/api/matches/{match_id}")
def delete_match(match_id: int, token: str=""):
    _auth(token)
    db_execute("DELETE FROM matches WHERE id=?", (match_id,))
    return {"ok": True}

# ── Équipes & Stats ───────────────────────────────────────────────────────────

@app.get("/api/teams")
def list_teams():
    return db_fetchall("SELECT DISTINCT team_name AS name, coach FROM matches ORDER BY team_name")

@app.get("/api/saisons")
def list_saisons():
    rows = db_fetchall("SELECT DISTINCT saison FROM matches WHERE saison!='' ORDER BY saison")
    return {"saisons": [r["saison"] for r in rows], "current": _current_saison()}

@app.post("/api/saisons/current")
def set_saison_courante(saison: str=Form(...), token: str=Form("")):
    u = _auth(token)
    if u["role"] != "admin": raise HTTPException(403)
    if not re.match(r"^\d{4}-\d{4}$", saison):
        raise HTTPException(400, "Format attendu: AAAA-AAAA (ex: 2026-2027)")
    db_execute("INSERT OR REPLACE INTO settings (key,value) VALUES ('current_saison', ?)", (saison,))
    return {"ok": True, "current_saison": saison}

@app.get("/api/debug")
def debug(token: str = ""):
    """Endpoint de diagnostic — réservé aux admins (était public avant, fuite de usernames/rôles corrigée)."""
    u = _auth(token)
    if u["role"] != "admin": raise HTTPException(403)
    try:
        users = db_fetchall("SELECT username, role FROM users")
        sessions_count = len(db_fetchall("SELECT token FROM sessions"))
        return {"status": "ok", "users": users, "sessions": sessions_count}
    except Exception as e:
        return {"status": "error", "message": str(e)}

APP_VERSION = "1.3.0-beta"

@app.get("/api/app-info")
def app_info():
    last_import = db_fetchone("SELECT filename, imported_at, rows_created, rows_updated FROM import_logs ORDER BY imported_at DESC LIMIT 1")
    # Obtenir la version et les métadonnées de la base de données
    app_version_data = _get_app_version()
    return {
        "version": app_version_data["version"],
        "app_version_code": APP_VERSION,
        "beta": True,
        "last_updated": app_version_data["last_updated"],
        "last_commit": app_version_data["last_commit"],
        "deploy_message": app_version_data["deploy_message"],
        "last_import": last_import
    }

@app.get("/api/stats")
def stats(saison: str=""):
    where, p = "WHERE 1=1", []
    if saison and saison != "all": where += " AND saison=?"; p.append(saison)
    total  = (db_fetchone(f"SELECT COUNT(*) AS n FROM matches {where}", tuple(p)) or {}).get("n",0)
    teams  = (db_fetchone(f"SELECT COUNT(DISTINCT team_name) AS n FROM matches {where}", tuple(p)) or {}).get("n",0)
    dates  = (db_fetchone(f"SELECT COUNT(DISTINCT date_iso) AS n FROM matches {where}", tuple(p)) or {}).get("n",0)
    edited = (db_fetchone(f"SELECT COUNT(*) AS n FROM matches {where} AND manually_edited=1", tuple(p)) or {}).get("n",0)
    by_type = {r["match_type"]:r["n"] for r in db_fetchall(f"SELECT match_type, COUNT(*) AS n FROM matches {where} GROUP BY match_type", tuple(p))}
    return {"saison": saison or "toutes","total_matches":total,"total_teams":teams,"total_dates":dates,"manually_edited":edited,"by_type":by_type}

@app.get("/api/stats/salles")
def stats_salles(saison: str=""):
    """Pour chaque salle : nombre total de matchs, et répartition des jours
    selon le nombre de matchs disputés ce jour-là dans cette salle
    (ex: 12 jours avec 1 seul match, 4 jours avec 2 matchs, 1 jour avec 3 matchs...)."""
    if not saison:
        saison = _current_saison()
    sql = "SELECT salle, date_iso, COUNT(*) AS n FROM matches WHERE salle!=''"
    p = []
    if saison and saison != "all":
        sql += " AND saison=?"; p.append(saison)
    sql += " GROUP BY salle, date_iso"
    rows = db_fetchall(sql, tuple(p))

    par_salle = {}
    for r in rows:
        s, n = r["salle"], r["n"]
        d = par_salle.setdefault(s, {"total_matches": 0, "jours_par_nb_matchs": {}, "max_matchs_meme_jour": 0})
        d["total_matches"] += n
        key = str(n)
        d["jours_par_nb_matchs"][key] = d["jours_par_nb_matchs"].get(key, 0) + 1
        if n > d["max_matchs_meme_jour"]:
            d["max_matchs_meme_jour"] = n

    salles = [{"salle": s, **v} for s, v in sorted(par_salle.items())]
    return {"saison": saison or "toutes", "salles": salles}

# ── Import Excel ──────────────────────────────────────────────────────────────

@app.post("/api/import/preview")
async def preview_excel(file: UploadFile=File(...), token: str=Form("")):
    """Retourne un aperçu des dates et équipes dans le fichier Excel sans importer."""
    _auth(token)
    suffix = Path(file.filename).suffix.lower()
    if suffix not in (".xls",".xlsx"): raise HTTPException(400,"Fichier .xls ou .xlsx requis")
    
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await file.read()); tmp_path = tmp.name
    
    try:
        # Parser uniquement pour extraire les dates et équipes
        if suffix == ".xls" and HAVE_XLRD:
            wb = xlrd.open_workbook(tmp_path, formatting_info=True)
            sh = wb.sheet_by_name("Planning")
            
            # Extraire les dates
            dates = set()
            for r in range(14, sh.nrows):
                dv = _s(sh.cell_value(r, DATE_COL))
                if dv and re.search(r"\d{2}/\d{2}/\d{2}", dv):
                    dates.add(dv.replace("\n", " ").strip())
            
            # Extraire les équipes
            teams = set()
            for c in range(5, sh.ncols):
                name = _s(sh.cell_value(11, c))
                if name:
                    teams.add(name)
            
            return {
                "status": "ok",
                "filename": file.filename,
                "dates": sorted(list(dates)),
                "teams": sorted(list(teams)),
                "date_count": len(dates),
                "team_count": len(teams)
            }
        elif HAVE_OPENPYXL:
            wb = openpyxl.load_workbook(tmp_path, data_only=True)
            sh = wb["Planning"]
            
            dates = set()
            for r in range(HEADER_ROWS+1, sh.max_row+1):
                dv = _s(sh.cell(row=r, column=DATE_COL+1).value)
                if dv and re.search(r"\d{2}/\d{2}/\d{2}", dv):
                    dates.add(dv.replace("\n", " ").strip())
            
            teams = set()
            for c in range(FIRST_TEAM_COL, sh.max_column+1):
                name = _s(sh.cell(row=TEAM_ROW+1, column=c+1).value)
                if name:
                    teams.add(name)
            
            return {
                "status": "ok",
                "filename": file.filename,
                "dates": sorted(list(dates)),
                "teams": sorted(list(teams)),
                "date_count": len(dates),
                "team_count": len(teams)
            }
        else:
            return {"status": "error", "message": "xlrd ou openpyxl requis"}
    finally:
        os.unlink(tmp_path)


@app.post("/api/import")
async def import_excel(file: UploadFile=File(...), token: str=Form("")):
    _auth(token)
    suffix = Path(file.filename).suffix.lower()
    if suffix not in (".xls",".xlsx"): raise HTTPException(400,"Fichier .xls ou .xlsx requis")
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await file.read()); tmp_path = tmp.name
    try: result = do_import(tmp_path, file.filename)
    finally: os.unlink(tmp_path)
    return result


@app.get("/api/import/progress/{import_id}")
def get_import_progress(import_id: str, token: str=""):
    """Retourne la progression d'un import en cours."""
    _auth(token)
    progress_data = db_fetchone("SELECT * FROM import_progress WHERE import_id=?", (import_id,))
    if not progress_data:
        return {"error": "Import non trouvé", "progress": 0, "status": "not_found"}
    return {
        "import_id": progress_data["import_id"],
        "status": progress_data["status"],
        "progress": progress_data["progress"],
        "message": progress_data["message"],
        "created_at": progress_data["created_at"],
        "updated_at": progress_data["updated_at"]
    }


@app.get("/api/import/logs")
def import_logs(token: str=""):
    _auth(token)
    return db_fetchall("SELECT * FROM import_logs ORDER BY imported_at DESC LIMIT 20")


@app.get("/api/import/active")
def active_imports(token: str=""):
    """Retourne les imports en cours."""
    _auth(token)
    return db_fetchall("SELECT * FROM import_progress WHERE status != 'completed' AND status != 'error' ORDER BY created_at DESC LIMIT 10")

# ── Export iCal ───────────────────────────────────────────────────────────────

@app.get("/api/export/ical")
def export_ical(team: str=""):
    from icalendar import Calendar, Event as IEvent
    import pytz
    sql = "SELECT * FROM matches WHERE match_type NOT IN ('exempt','report')"
    matches = db_fetchall(sql + (" AND team_name=?" if team else ""), (team,) if team else ())
    cal = Calendar(); cal.add("prodid","-//EHR Planning//FR"); cal.add("version","2.0")
    tz = pytz.timezone("Europe/Paris")
    for m in matches:
        try:
            y,mo,d = m["date_iso"].split("-")
            ev = IEvent()
            ev.add("summary", f"{m['team_name']}: {m['match_text'].split(chr(10))[0][:60]}")
            ev.add("dtstart", datetime(int(y),int(mo),int(d),tzinfo=tz).date())
            ev.add("description", m["match_text"])
            cal.add_component(ev)
        except: pass
    return Response(content=cal.to_ical(), media_type="text/calendar",
                    headers={"Content-Disposition":'attachment; filename="ehr.ics"'})

# ── Utilisateurs ──────────────────────────────────────────────────────────────

@app.get("/api/indispos")
def list_indispos():
    return db_fetchall("SELECT * FROM indispos ORDER BY date_iso")

@app.post("/api/indispos")
def add_indispo(salle: str=Form(...), date_iso: str=Form(...), label: str=Form(""), token: str=Form("")):
    _auth(token)
    now = datetime.now().isoformat()
    new_id = db_execute("INSERT INTO indispos (salle,date_iso,label,created_at) VALUES (?,?,?,?)",
                        (salle, date_iso, label, now))
    return {"ok": True, "id": new_id}

@app.delete("/api/indispos/{indispo_id}")
def delete_indispo(indispo_id: int, token: str=""):
    _auth(token)
    db_execute("DELETE FROM indispos WHERE id=?", (indispo_id,))
    return {"ok": True}

@app.get("/api/evenements")
def list_evenements():
    return db_fetchall("SELECT * FROM evenements ORDER BY date_iso, heure")

@app.post("/api/evenements")
def create_evenement(
    titre: str=Form(...), date_iso: str=Form(...), date_str: str=Form(""),
    heure: str=Form(""), lieu: str=Form(""), description: str=Form(""),
    categorie: str=Form("club"), token: str=Form("")
):
    _auth(token)
    now = datetime.now().isoformat()
    new_id = db_execute(
        "INSERT INTO evenements (titre,date_iso,date_str,heure,lieu,description,categorie,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
        (titre, date_iso, date_str, heure, lieu, description, categorie, now, now)
    )
    return db_fetchone("SELECT * FROM evenements WHERE id=?", (new_id,))

@app.put("/api/evenements/{ev_id}")
def update_evenement(
    ev_id: int, titre: str=Form(""), date_iso: str=Form(""), date_str: str=Form(""),
    heure: str=Form(""), lieu: str=Form(""), description: str=Form(""),
    categorie: str=Form(""), token: str=Form("")
):
    _auth(token)
    now = datetime.now().isoformat()
    sets, p = [], []
    if titre:       sets.append("titre=?");       p.append(titre)
    if date_iso:    sets.append("date_iso=?");    p.append(date_iso)
    if date_str:    sets.append("date_str=?");    p.append(date_str)
    if heure:       sets.append("heure=?");       p.append(heure)
    if lieu:        sets.append("lieu=?");        p.append(lieu)
    if description: sets.append("description=?"); p.append(description)
    if categorie:   sets.append("categorie=?");   p.append(categorie)
    sets.append("updated_at=?"); p.append(now); p.append(ev_id)
    db_execute(f"UPDATE evenements SET {', '.join(sets)} WHERE id=?", tuple(p))
    return db_fetchone("SELECT * FROM evenements WHERE id=?", (ev_id,))

@app.delete("/api/evenements/{ev_id}")
def delete_evenement(ev_id: int, token: str=""):
    _auth(token)
    db_execute("DELETE FROM evenements WHERE id=?", (ev_id,))
    return {"ok": True}

@app.get("/api/users")
def list_users(token: str=""):
    u = _auth(token)
    if u["role"] != "admin": raise HTTPException(403)
    return db_fetchall("SELECT id,username,role,team_filter FROM users")

@app.post("/api/users")
def create_user(username: str=Form(...), password: str=Form(...),
                role: str=Form("viewer"), team_filter: str=Form(""), token: str=Form("")):
    u = _auth(token)
    if u["role"] != "admin": raise HTTPException(403)
    if db_fetchone("SELECT id FROM users WHERE username=?", (username,)):
        raise HTTPException(400,"Nom déjà utilisé")
    db_execute("INSERT INTO users (username,hashed_password,role,team_filter) VALUES (?,?,?,?)",
               (username,_hash(password),role,team_filter))
    return {"ok":True,"username":username,"role":role}

@app.delete("/api/users/{user_id}")
def delete_user(user_id: int, token: str=""):
    u = _auth(token)
    if u["role"] != "admin": raise HTTPException(403)
    db_execute("DELETE FROM users WHERE id=?", (user_id,))
    return {"ok":True}


# ── Team Coaches ──────────────────────────────────────────────────────────────

@app.get("/api/teams/coaches")
def list_team_coaches(team_name: str="", token: str=""):
    """Liste tous les entraîneurs ou ceux d'une équipe spécifique."""
    _auth(token)
    if team_name:
        return db_fetchall("SELECT * FROM team_coaches WHERE team_name=? ORDER BY coach_order", (team_name,))
    return db_fetchall("SELECT * FROM team_coaches ORDER BY team_name, coach_order")

@app.post("/api/teams/coaches")
def create_team_coach(
    team_name: str=Form(...),
    coach_name: str=Form(...),
    coach_order: int=Form(1),
    token: str=Form(...)
):
    """Ajoute un entraîneur à une équipe."""
    _auth(token)
    now = datetime.now().isoformat()
    # Vérifier qu'il n'y a pas déjà un entraîneur avec le même ordre pour cette équipe
    existing = db_fetchone(
        "SELECT id FROM team_coaches WHERE team_name=? AND coach_order=?",
        (team_name, coach_order)
    )
    if existing:
        raise HTTPException(400, f"Un entraîneur avec l'ordre {coach_order} existe déjà pour cette équipe")
    # Limiter à 3 entraîneurs par équipe
    count = db_fetchone(
        "SELECT COUNT(*) as cnt FROM team_coaches WHERE team_name=?",
        (team_name,)
    )
    if count and count["cnt"] >= 3:
        raise HTTPException(400, "Maximum 3 entraîneurs par équipe atteint")
    new_id = db_execute(
        "INSERT INTO team_coaches (team_name, coach_name, coach_order, created_at, updated_at) VALUES (?,?,?,?,?)",
        (team_name, coach_name, coach_order, now, now)
    )
    return {"ok": True, "id": new_id}

@app.put("/api/teams/coaches/{coach_id}")
def update_team_coach(
    coach_id: int,
    team_name: str=Form(""),
    coach_name: str=Form(""),
    coach_order: int=Form(None),
    token: str=Form(...)
):
    """Met à jour un entraîneur."""
    _auth(token)
    now = datetime.now().isoformat()
    sets, params = [], []
    if team_name:
        sets.append("team_name=?"); params.append(team_name)
    if coach_name:
        sets.append("coach_name=?"); params.append(coach_name)
    if coach_order is not None:
        sets.append("coach_order=?"); params.append(coach_order)
    if sets:
        sets.append("updated_at=?"); params.append(now)
        params.append(coach_id)
        db_execute(f"UPDATE team_coaches SET {', '.join(sets)} WHERE id=?", tuple(params))
    return {"ok": True}

@app.delete("/api/teams/coaches/{coach_id}")
def delete_team_coach(coach_id: int, token: str=""):
    """Supprime un entraîneur."""
    _auth(token)
    db_execute("DELETE FROM team_coaches WHERE id=?", (coach_id,))
    return {"ok": True}


# ── Team Parents ──────────────────────────────────────────────────────────────

PARENT_ROLES = ["responsable_stable_de_marque", "responsable_salle"]

@app.get("/api/teams/parents")
def list_team_parents(team_name: str="", token: str=""):
    """Liste tous les parents ou ceux d'une équipe spécifique."""
    _auth(token)
    if team_name:
        return db_fetchall("SELECT * FROM team_parents WHERE team_name=? ORDER BY role, parent_name", (team_name,))
    return db_fetchall("SELECT * FROM team_parents ORDER BY team_name, role, parent_name")

@app.post("/api/teams/parents")
def create_team_parent(
    team_name: str=Form(...),
    parent_name: str=Form(...),
    role: str=Form("responsable_stable_de_marque"),
    phone: str=Form(""),
    email: str=Form(""),
    token: str=Form(...)
):
    """Ajoute un parent dirigeant à une équipe."""
    _auth(token)
    if role not in PARENT_ROLES:
        raise HTTPException(400, f"Rôle invalide. Doit être parmi: {', '.join(PARENT_ROLES)}")
    now = datetime.now().isoformat()
    new_id = db_execute(
        "INSERT INTO team_parents (team_name, parent_name, role, phone, email, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
        (team_name, parent_name, role, phone, email, now, now)
    )
    return {"ok": True, "id": new_id}

@app.put("/api/teams/parents/{parent_id}")
def update_team_parent(
    parent_id: int,
    team_name: str=Form(""),
    parent_name: str=Form(""),
    role: str=Form(""),
    phone: str=Form(""),
    email: str=Form(""),
    token: str=Form(...)
):
    """Met à jour un parent dirigeant."""
    _auth(token)
    now = datetime.now().isoformat()
    sets, params = [], []
    if team_name:
        sets.append("team_name=?"); params.append(team_name)
    if parent_name:
        sets.append("parent_name=?"); params.append(parent_name)
    if role:
        if role not in PARENT_ROLES:
            raise HTTPException(400, f"Rôle invalide. Doit être parmi: {', '.join(PARENT_ROLES)}")
        sets.append("role=?"); params.append(role)
    if phone is not None:
        sets.append("phone=?"); params.append(phone)
    if email is not None:
        sets.append("email=?"); params.append(email)
    if sets:
        sets.append("updated_at=?"); params.append(now)
        params.append(parent_id)
        db_execute(f"UPDATE team_parents SET {', '.join(sets)} WHERE id=?", tuple(params))
    return {"ok": True}

@app.delete("/api/teams/parents/{parent_id}")
def delete_team_parent(parent_id: int, token: str=""):
    """Supprime un parent dirigeant."""
    _auth(token)
    db_execute("DELETE FROM team_parents WHERE id=?", (parent_id,))
    return {"ok": True}


# ── Inventory ─────────────────────────────────────────────────────────────────

INVENTORY_CATEGORIES = [
    "ballons",
    "maillots",
    "dossards",
    "cles",
    "badges",
    "chronometres",
    "buts_portatifs",
    "filets",
    "autre"
]

@app.get("/api/inventory")
def list_inventory(token: str="", category: str="", search: str=""):
    """Liste tout l'inventaire avec filtres optionnels."""
    _auth(token)
    sql = "SELECT * FROM inventory WHERE 1=1"
    params: list = []
    if category and category != "tout":
        sql += " AND category=?"
        params.append(category)
    if search:
        sql += " AND (name LIKE ? OR notes LIKE ? OR location LIKE ? OR responsible LIKE ?)"
        search_param = f"%{search}%"
        params.extend([search_param, search_param, search_param, search_param])
    sql += " ORDER BY category, name"
    return db_fetchall(sql, tuple(params) if params else ())

@app.post("/api/inventory")
def create_inventory_item(
    name: str=Form(...),
    category: str=Form("autre"),
    quantity: int=Form(1),
    location: str=Form(""),
    responsible: str=Form(""),
    notes: str=Form(""),
    token: str=Form(...)
):
    """Ajoute un nouvel article à l'inventaire."""
    _auth(token)
    if category not in INVENTORY_CATEGORIES:
        raise HTTPException(400, f"Catégorie invalide. Doit être parmi: {', '.join(INVENTORY_CATEGORIES)}")
    now = datetime.now().isoformat()
    new_id = db_execute(
        "INSERT INTO inventory (name, category, quantity, location, responsible, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
        (name, category, quantity, location, responsible, notes, now, now)
    )
    return {"ok": True, "id": new_id}

@app.put("/api/inventory/{item_id}")
def update_inventory_item(
    item_id: int,
    name: str=Form(""),
    category: str=Form(""),
    quantity: int=Form(None),
    location: str=Form(""),
    responsible: str=Form(""),
    notes: str=Form(""),
    token: str=Form(...)
):
    """Met à jour un article de l'inventaire."""
    _auth(token)
    now = datetime.now().isoformat()
    sets, params = [], []
    if name:
        sets.append("name=?"); params.append(name)
    if category:
        if category not in INVENTORY_CATEGORIES:
            raise HTTPException(400, f"Catégorie invalide. Doit être parmi: {', '.join(INVENTORY_CATEGORIES)}")
        sets.append("category=?"); params.append(category)
    if quantity is not None:
        sets.append("quantity=?"); params.append(quantity)
    if location is not None:
        sets.append("location=?"); params.append(location)
    if responsible is not None:
        sets.append("responsible=?"); params.append(responsible)
    if notes is not None:
        sets.append("notes=?"); params.append(notes)
    if sets:
        sets.append("updated_at=?"); params.append(now)
        params.append(item_id)
        db_execute(f"UPDATE inventory SET {', '.join(sets)} WHERE id=?", tuple(params))
    return {"ok": True}

@app.delete("/api/inventory/{item_id}")
def delete_inventory_item(item_id: int, token: str=""):
    """Supprime un article de l'inventaire."""
    _auth(token)
    db_execute("DELETE FROM inventory WHERE id=?", (item_id,))
    return {"ok": True}


# Export app for Vercel
# Required for Vercel Serverless Functions
# Explicitly export app at module level
# Vercel requires app to be at module level

# Ensure app is accessible at module level for Vercel
app = app
