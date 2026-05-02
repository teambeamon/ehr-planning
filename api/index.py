"""
api/index.py — Point d'entrée FastAPI pour Vercel (serverless).
Vercel cherche une variable `app` dans ce fichier.
"""
import hashlib, os, tempfile, secrets
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, HTMLResponse
import libsql_client

# Chemin vers public/ (relatif à api/)
PUBLIC_DIR = __import__("pathlib").Path(__file__).parent.parent / "public"
def _html(name): return (PUBLIC_DIR / name).read_text(encoding="utf-8")

from db import init_db, get_client, rows_to_dicts
from importer import import_to_turso

app = FastAPI(title="EHR Planning API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Init DB au démarrage (idempotent — crée les tables si absentes)
try:
    init_db()
except Exception as e:
    print(f"[WARN] init_db: {e}")

# ── AUTH (tokens en mémoire — suffisant pour serverless à faible trafic) ──────
_sessions: dict = {}

def hash_pwd(p: str) -> str:
    return hashlib.sha256(p.encode()).hexdigest()

def get_user(token: str) -> dict:
    if not token or token not in _sessions:
        raise HTTPException(401, "Non authentifié")
    username = _sessions[token]
    with get_client() as c:
        r = c.execute(libsql_client.Statement(
            "SELECT id, username, role, team_filter FROM users WHERE username=?", [username]
        ))
        rows = list(r.rows)
    if not rows:
        raise HTTPException(401, "Utilisateur introuvable")
    return dict(zip(r.columns, rows[0]))

# ── PAGES HTML ───────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
def serve_index():
    return HTMLResponse(_html("index.html"))

@app.get("/admin", response_class=HTMLResponse)
def serve_admin():
    return HTMLResponse(_html("admin.html"))

# ── LOGIN ─────────────────────────────────────────────────────────────────────

@app.post("/api/login")
def login(username: str = Form(...), password: str = Form(...)):
    with get_client() as c:
        r = c.execute(libsql_client.Statement(
            "SELECT username, hashed_password, role FROM users WHERE username=?", [username]
        ))
        rows = list(r.rows)
    if not rows or rows[0][1] != hash_pwd(password):
        raise HTTPException(401, "Identifiants invalides")
    token = secrets.token_hex(32)
    _sessions[token] = username
    return {"token": token, "role": rows[0][2], "username": username}

@app.post("/api/logout")
def logout(token: str = Form("")):
    _sessions.pop(token, None)
    return {"ok": True}

@app.get("/api/me")
def me(token: str = ""):
    try:
        user = get_user(token)
        return {"username": user["username"], "role": user["role"]}
    except Exception:
        return {"username": None, "role": None}

# ── MATCHS ────────────────────────────────────────────────────────────────────

@app.get("/api/matches")
def list_matches(team: str = "", month: str = "", match_type: str = "", search: str = ""):
    sql = "SELECT * FROM matches WHERE 1=1"
    params = []
    if team:       sql += " AND team_name=?";  params.append(team)
    if month:      sql += " AND date_iso LIKE ?"; params.append(month + "%")
    if match_type: sql += " AND match_type=?"; params.append(match_type)
    sql += " ORDER BY date_iso, team_name"
    with get_client() as c:
        r = c.execute(libsql_client.Statement(sql, params) if params else sql)
        results = rows_to_dicts(r)
    if search:
        s = search.lower()
        results = [m for m in results if s in (
            str(m.get("match_text","")) + str(m.get("team_name","")) +
            str(m.get("opponent","")) + str(m.get("coach",""))
        ).lower()]
    # Convertit home (0/1/None) en bool pour le frontend
    for m in results:
        m["home"] = True if m["home"] == 1 else (False if m["home"] == 0 else None)
        m["manually_edited"] = bool(m.get("manually_edited", 0))
    return results

@app.get("/api/matches/{match_id}")
def get_match(match_id: int):
    with get_client() as c:
        r = c.execute(libsql_client.Statement("SELECT * FROM matches WHERE id=?", [match_id]))
        rows = list(r.rows)
    if not rows:
        raise HTTPException(404, "Match introuvable")
    m = dict(zip(r.columns, rows[0]))
    m["home"] = True if m["home"] == 1 else (False if m["home"] == 0 else None)
    return m

@app.post("/api/matches")
def create_match(
    date_str: str = Form(...), team_name: str = Form(...), match_text: str = Form(...),
    coach: str = Form(""), opponent: str = Form(""), home: Optional[str] = Form(None),
    time_str: str = Form(""), journee: str = Form(""), match_type: str = Form("champ"),
    note: str = Form(""), token: str = Form(""),
):
    get_user(token)
    home_val = 1 if home == "true" else (0 if home == "false" else None)
    date_iso = _parse_date(date_str)
    now = datetime.now().isoformat()
    with get_client() as c:
        c.execute(libsql_client.Statement(
            """INSERT INTO matches (date_str,date_iso,team_name,coach,match_text,opponent,home,
               time_str,journee,match_type,note,manually_edited,created_at,updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,?)""",
            [date_str,date_iso,team_name,coach,match_text,opponent,home_val,
             time_str,journee,match_type,note,now,now]
        ))
        r2 = c.execute("SELECT last_insert_rowid() as id")
        new_id = list(r2.rows)[0][0]
    return get_match(new_id)

@app.put("/api/matches/{match_id}")
def update_match(
    match_id: int, date_str: str = Form(""), team_name: str = Form(""),
    match_text: str = Form(""), coach: str = Form(""), opponent: str = Form(""),
    home: Optional[str] = Form(None), time_str: str = Form(""), journee: str = Form(""),
    match_type: str = Form(""), note: str = Form(""), token: str = Form(""),
):
    get_user(token)
    now = datetime.now().isoformat()
    home_val = 1 if home == "true" else (0 if home == "false" else None)
    sets, params = [], []
    if date_str:   sets += ["date_str=?","date_iso=?"]; params += [date_str, _parse_date(date_str)]
    if team_name:  sets.append("team_name=?"); params.append(team_name)
    if match_text: sets.append("match_text=?"); params.append(match_text)
    if coach:      sets.append("coach=?"); params.append(coach)
    if opponent:   sets.append("opponent=?"); params.append(opponent)
    if home is not None: sets.append("home=?"); params.append(home_val)
    if time_str:   sets.append("time_str=?"); params.append(time_str)
    if journee:    sets.append("journee=?"); params.append(journee)
    if match_type: sets.append("match_type=?"); params.append(match_type)
    sets += ["note=?","manually_edited=1","updated_at=?"]; params += [note, now, match_id]
    with get_client() as c:
        c.execute(libsql_client.Statement(
            f"UPDATE matches SET {', '.join(sets)} WHERE id=?", params
        ))
    return get_match(match_id)

@app.delete("/api/matches/{match_id}")
def delete_match(match_id: int, token: str = ""):
    get_user(token)
    with get_client() as c:
        c.execute(libsql_client.Statement("DELETE FROM matches WHERE id=?", [match_id]))
    return {"ok": True}

# ── ÉQUIPES ───────────────────────────────────────────────────────────────────

@app.get("/api/teams")
def list_teams():
    with get_client() as c:
        r = c.execute("SELECT DISTINCT team_name, coach FROM matches ORDER BY team_name")
        return [{"name": row[0], "coach": row[1]} for row in r.rows]

# ── STATS ─────────────────────────────────────────────────────────────────────

@app.get("/api/stats")
def stats():
    with get_client() as c:
        total = list(c.execute("SELECT COUNT(*) FROM matches").rows)[0][0]
        teams = list(c.execute("SELECT COUNT(DISTINCT team_name) FROM matches").rows)[0][0]
        dates = list(c.execute("SELECT COUNT(DISTINCT date_iso) FROM matches").rows)[0][0]
        edited = list(c.execute("SELECT COUNT(*) FROM matches WHERE manually_edited=1").rows)[0][0]
        by_type_r = c.execute("SELECT match_type, COUNT(*) FROM matches GROUP BY match_type")
        by_type = {row[0]: row[1] for row in by_type_r.rows}
    return {"total_matches": total, "total_teams": teams, "total_dates": dates,
            "manually_edited": edited, "by_type": by_type}

# ── IMPORT EXCEL ──────────────────────────────────────────────────────────────

@app.post("/api/import")
async def import_excel(file: UploadFile = File(...), token: str = Form("")):
    get_user(token)
    suffix = Path(file.filename).suffix.lower()
    if suffix not in (".xls", ".xlsx"):
        raise HTTPException(400, "Fichier .xls ou .xlsx requis")
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    try:
        result = import_to_turso(tmp_path, file.filename)
    finally:
        os.unlink(tmp_path)
    return result

@app.get("/api/import/logs")
def import_logs(token: str = ""):
    get_user(token)
    with get_client() as c:
        r = c.execute("SELECT * FROM import_logs ORDER BY imported_at DESC LIMIT 20")
        return rows_to_dicts(r)

# ── EXPORT iCAL ───────────────────────────────────────────────────────────────

@app.get("/api/export/ical")
def export_ical(team: str = ""):
    from icalendar import Calendar, Event as IEvent
    import pytz
    sql = "SELECT * FROM matches WHERE match_type NOT IN ('exempt','report')"
    params = []
    if team: sql += " AND team_name=?"; params.append(team)
    with get_client() as c:
        r = c.execute(libsql_client.Statement(sql, params) if params else sql)
        matches = rows_to_dicts(r)
    cal = Calendar()
    cal.add("prodid", "-//EHR Planning//FR"); cal.add("version", "2.0")
    tz = pytz.timezone("Europe/Paris")
    for m in matches:
        try:
            y, mo, d = m["date_iso"].split("-")
            ev = IEvent()
            ev.add("summary", f"{m['team_name']}: {m['match_text'].split(chr(10))[0][:60]}")
            ev.add("dtstart", datetime(int(y), int(mo), int(d), tzinfo=tz).date())
            ev.add("description", m["match_text"])
            cal.add_component(ev)
        except Exception:
            pass
    return Response(content=cal.to_ical(), media_type="text/calendar",
                    headers={"Content-Disposition": 'attachment; filename="ehr.ics"'})

# ── UTILISATEURS ─────────────────────────────────────────────────────────────

@app.get("/api/users")
def list_users(token: str = ""):
    user = get_user(token)
    if user["role"] != "admin": raise HTTPException(403)
    with get_client() as c:
        r = c.execute("SELECT id, username, role, team_filter FROM users")
        return rows_to_dicts(r)

@app.post("/api/users")
def create_user(
    username: str = Form(...), password: str = Form(...),
    role: str = Form("viewer"), team_filter: str = Form(""),
    token: str = Form(""),
):
    user = get_user(token)
    if user["role"] != "admin": raise HTTPException(403)
    with get_client() as c:
        existing = list(c.execute(libsql_client.Statement(
            "SELECT id FROM users WHERE username=?", [username]
        )).rows)
        if existing: raise HTTPException(400, "Nom déjà utilisé")
        c.execute(libsql_client.Statement(
            "INSERT INTO users (username,hashed_password,role,team_filter) VALUES (?,?,?,?)",
            [username, hash_pwd(password), role, team_filter]
        ))
    return {"ok": True, "username": username, "role": role}

@app.delete("/api/users/{user_id}")
def delete_user(user_id: int, token: str = ""):
    user = get_user(token)
    if user["role"] != "admin": raise HTTPException(403)
    with get_client() as c:
        c.execute(libsql_client.Statement("DELETE FROM users WHERE id=?", [user_id]))
    return {"ok": True}

# ── UTILS ─────────────────────────────────────────────────────────────────────

def _parse_date(s: str) -> str:
    import re
    m = re.search(r"(\d{2})/(\d{2})/(\d{2,4})", s)
    if not m: return "9999-99-99"
    d, mo, y = m.groups()
    if len(y) == 2: y = "20" + y
    return f"{y}-{mo}-{d}"
