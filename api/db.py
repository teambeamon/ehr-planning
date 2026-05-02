"""
db.py — Couche base de données via Turso (libSQL).
Turso est un SQLite cloud : même syntaxe SQL, accessible en HTTP depuis Vercel serverless.
Les variables d'env TURSO_URL et TURSO_TOKEN sont injectées par Vercel.
"""
import os
import libsql_client

TURSO_URL   = os.environ.get("TURSO_URL", "")
TURSO_TOKEN = os.environ.get("TURSO_TOKEN", "")

def get_client():
    """Retourne un client Turso synchrone."""
    if not TURSO_URL:
        raise RuntimeError("TURSO_URL manquant — configure les variables d'environnement Vercel")
    return libsql_client.create_client_sync(
        url=TURSO_URL,
        auth_token=TURSO_TOKEN or None,
    )

def execute(sql: str, params: list = None):
    """Exécute une requête et retourne les rows."""
    with get_client() as client:
        if params:
            result = client.execute(libsql_client.Statement(sql, params))
        else:
            result = client.execute(sql)
        return result

def executemany(statements: list):
    """Exécute plusieurs statements en un seul batch (atomique)."""
    with get_client() as client:
        return client.batch(statements)

def init_db():
    """Crée les tables si elles n'existent pas (idempotent)."""
    stmts = [
        """CREATE TABLE IF NOT EXISTS matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date_str TEXT NOT NULL,
            date_iso TEXT NOT NULL,
            team_name TEXT NOT NULL,
            coach TEXT DEFAULT '',
            match_text TEXT NOT NULL,
            opponent TEXT DEFAULT '',
            home INTEGER,
            time_str TEXT DEFAULT '',
            journee TEXT DEFAULT '',
            match_type TEXT DEFAULT 'champ',
            note TEXT DEFAULT '',
            manually_edited INTEGER DEFAULT 0,
            excel_import_id TEXT,
            created_at TEXT,
            updated_at TEXT
        )""",
        """CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            hashed_password TEXT NOT NULL,
            role TEXT DEFAULT 'viewer',
            team_filter TEXT DEFAULT ''
        )""",
        """CREATE TABLE IF NOT EXISTS import_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT,
            imported_at TEXT,
            rows_created INTEGER DEFAULT 0,
            rows_updated INTEGER DEFAULT 0,
            rows_skipped INTEGER DEFAULT 0,
            status TEXT DEFAULT 'ok',
            message TEXT DEFAULT ''
        )""",
    ]
    with get_client() as client:
        for stmt in stmts:
            client.execute(stmt)
        # Admin par défaut
        import hashlib
        pwd = hashlib.sha256(b"ehr2025").hexdigest()
        client.execute(libsql_client.Statement(
            "INSERT OR IGNORE INTO users (username, hashed_password, role) VALUES (?, ?, ?)",
            ["admin", pwd, "admin"]
        ))

def row_to_dict(columns, row):
    return dict(zip(columns, row))

def rows_to_dicts(result):
    cols = result.columns
    return [row_to_dict(cols, r) for r in result.rows]
