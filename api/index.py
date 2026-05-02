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
PUBLIC_DIR  = Path(__file__).parent.parent / "public"

def _html(name: str) -> str:
    return (PUBLIC_DIR / name).read_text(encoding="utf-8")

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
            updated_at TEXT DEFAULT ''
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
    """)
    conn.commit()
    pwd = hashlib.sha256(b"ehr2025").hexdigest()
    db_execute(
        "INSERT OR IGNORE INTO users (username,hashed_password,role) VALUES (?,?,?)",
        ("admin", pwd, "admin")
    )

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
    noise = [r"^journée\s+\d",r"^j\d+$",r"^coupe de",r"^match amical$",r"^forfait g",
             r"^retrait ",r"impératif",r"report du",r"avancé au"]
    t = text.lower().strip()
    return any(re.search(p,t) for p in noise) or len(t)<4

def _read_xls(path):
    wb = xlrd.open_workbook(path); sh = wb.sheet_by_name("Planning")
    teams = {c: {"name":_s(sh.cell_value(TEAM_ROW,c)),"coach":_s(sh.cell_value(COACH_ROW,c))}
             for c in range(FIRST_TEAM_COL, sh.ncols) if _s(sh.cell_value(TEAM_ROW,c))}
    rows = [[_s(sh.cell_value(r,c)) for c in range(sh.ncols)] for r in range(HEADER_ROWS, sh.nrows)]
    return teams, rows

def _read_xlsx(path):
    wb = openpyxl.load_workbook(path, data_only=True); sh = wb["Planning"]
    teams = {c: {"name":_s(sh.cell(row=TEAM_ROW+1,column=c+1).value),"coach":_s(sh.cell(row=COACH_ROW+1,column=c+1).value)}
             for c in range(FIRST_TEAM_COL, sh.max_column+1) if _s(sh.cell(row=TEAM_ROW+1,column=c+1).value)}
    rows = [[_s(sh.cell(row=r,column=c+1).value) for c in range(sh.max_column)]
            for r in range(HEADER_ROWS+1, sh.max_row+1)]
    return teams, rows

def parse_excel(path):
    if path.endswith(".xls") and HAVE_XLRD: teams,rows = _read_xls(path)
    elif HAVE_OPENPYXL: teams,rows = _read_xlsx(path)
    else: raise RuntimeError("xlrd ou openpyxl requis")
    matches, current_date = [], ""
    for row in rows:
        dv = row[DATE_COL] if len(row)>DATE_COL else ""
        if dv and re.search(r"\d{2}/\d{2}/\d{2}", dv):
            current_date = dv.replace("\n"," ").strip()
        if not current_date: continue
        for col, team in teams.items():
            if col>=len(row): continue
            val = row[col]
            if not val or val in ("0.0"," ") or _noise(val): continue
            matches.append({
                "date_str": current_date, "date_iso": _iso(current_date),
                "team_name": team["name"], "coach": team["coach"],
                "match_text": val, "opponent": _opponent(val),
                "home": _home_val(val), "time_str": _time(val),
                "match_type": _mtype(val),
                "excel_import_id": _key(current_date, team["name"], val),
            })
    return matches

def do_import(path, filename):
    now = datetime.now().isoformat()
    try: parsed = parse_excel(path)
    except Exception as e:
        return {"status":"error","message":str(e),"created":0,"updated":0,"skipped":0,"filename":filename}
    created=updated=skipped=0
    for m in parsed:
        existing = db_fetchone("SELECT id,manually_edited FROM matches WHERE excel_import_id=?", (m["excel_import_id"],))
        if existing:
            if existing["manually_edited"]: skipped+=1; continue
            db_execute("UPDATE matches SET match_text=?,opponent=?,home=?,time_str=?,match_type=?,updated_at=? WHERE id=?",
                       (m["match_text"],m["opponent"],m["home"],m["time_str"],m["match_type"],now,existing["id"]))
            updated+=1
        else:
            db_execute("""INSERT INTO matches (date_str,date_iso,team_name,coach,match_text,opponent,home,
                          time_str,match_type,note,manually_edited,excel_import_id,created_at,updated_at)
                          VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,?)""",
                       (m["date_str"],m["date_iso"],m["team_name"],m["coach"],m["match_text"],
                        m["opponent"],m["home"],m["time_str"],m["match_type"],"",m["excel_import_id"],now,now))
            created+=1
    db_execute("INSERT INTO import_logs (filename,imported_at,rows_created,rows_updated,rows_skipped,status,message) VALUES (?,?,?,?,?,?,?)",
               (filename,now,created,updated,skipped,"ok",""))
    return {"status":"ok","filename":filename,"created":created,"updated":updated,"skipped":skipped,"message":""}

# ── App FastAPI ───────────────────────────────────────────────────────────────

app = FastAPI(title="EHR Planning")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
def startup():
    try: db_init()
    except Exception as e: print(f"[WARN] db_init: {e}")

# ── Auth ──────────────────────────────────────────────────────────────────────
_sessions: dict = {}

def _hash(p): return hashlib.sha256(p.encode()).hexdigest()

def _auth(token: str) -> dict:
    if not token or token not in _sessions:
        raise HTTPException(401, "Non authentifié")
    u = db_fetchone("SELECT id,username,role,team_filter FROM users WHERE username=?", (_sessions[token],))
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

# ── Login ─────────────────────────────────────────────────────────────────────

@app.post("/api/login")
def login(username: str=Form(...), password: str=Form(...)):
    u = db_fetchone("SELECT username,hashed_password,role FROM users WHERE username=?", (username,))
    if not u or u["hashed_password"] != _hash(password):
        raise HTTPException(401, "Identifiants invalides")
    token = secrets.token_hex(32)
    _sessions[token] = username
    return {"token": token, "role": u["role"], "username": username}

@app.post("/api/logout")
def logout(token: str=Form("")):
    _sessions.pop(token, None); return {"ok": True}

@app.get("/api/me")
def me(token: str=""):
    try: u = _auth(token); return {"username": u["username"], "role": u["role"]}
    except: return {"username": None, "role": None}

# ── Matchs ────────────────────────────────────────────────────────────────────

@app.get("/api/matches")
def list_matches(team: str="", month: str="", match_type: str="", search: str=""):
    sql = "SELECT * FROM matches WHERE 1=1"; p = []
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
):
    _auth(token)
    hv = 1 if home=="true" else (0 if home=="false" else None)
    now = datetime.now().isoformat()
    new_id = db_execute(
        """INSERT INTO matches (date_str,date_iso,team_name,coach,match_text,opponent,home,
           time_str,journee,match_type,note,manually_edited,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,?)""",
        (date_str,_pdate(date_str),team_name,coach,match_text,opponent,hv,time_str,journee,match_type,note,now,now)
    )
    return get_match(new_id)

@app.put("/api/matches/{match_id}")
def update_match(
    match_id: int, date_str: str=Form(""), team_name: str=Form(""),
    match_text: str=Form(""), coach: str=Form(""), opponent: str=Form(""),
    home: Optional[str]=Form(None), time_str: str=Form(""), journee: str=Form(""),
    match_type: str=Form(""), note: str=Form(""), token: str=Form(""),
):
    _auth(token)
    now = datetime.now().isoformat()
    hv = 1 if home=="true" else (0 if home=="false" else None)
    sets, p = [], []
    if date_str:   sets+=["date_str=?","date_iso=?"]; p+=[date_str,_pdate(date_str)]
    if team_name:  sets.append("team_name=?"); p.append(team_name)
    if match_text: sets.append("match_text=?"); p.append(match_text)
    if coach:      sets.append("coach=?"); p.append(coach)
    if opponent:   sets.append("opponent=?"); p.append(opponent)
    if home is not None: sets.append("home=?"); p.append(hv)
    if time_str:   sets.append("time_str=?"); p.append(time_str)
    if journee:    sets.append("journee=?"); p.append(journee)
    if match_type: sets.append("match_type=?"); p.append(match_type)
    sets+=["note=?","manually_edited=1","updated_at=?"]; p+=[note,now,match_id]
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

@app.get("/api/stats")
def stats():
    total  = (db_fetchone("SELECT COUNT(*) AS n FROM matches") or {}).get("n",0)
    teams  = (db_fetchone("SELECT COUNT(DISTINCT team_name) AS n FROM matches") or {}).get("n",0)
    dates  = (db_fetchone("SELECT COUNT(DISTINCT date_iso) AS n FROM matches") or {}).get("n",0)
    edited = (db_fetchone("SELECT COUNT(*) AS n FROM matches WHERE manually_edited=1") or {}).get("n",0)
    by_type = {r["match_type"]:r["n"] for r in db_fetchall("SELECT match_type, COUNT(*) AS n FROM matches GROUP BY match_type")}
    return {"total_matches":total,"total_teams":teams,"total_dates":dates,"manually_edited":edited,"by_type":by_type}

# ── Import Excel ──────────────────────────────────────────────────────────────

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

@app.get("/api/import/logs")
def import_logs(token: str=""):
    _auth(token)
    return db_fetchall("SELECT * FROM import_logs ORDER BY imported_at DESC LIMIT 20")

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
