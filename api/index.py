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
_HTML_INDEX = "<!DOCTYPE html>\n<html lang=\"fr\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n<title>EHR \u2014 Planning Matchs 2025-2026</title>\n<link href=\"https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800&family=Barlow:wght@300;400;500;600&display=swap\" rel=\"stylesheet\">\n<style>\n  :root {\n    --yellow: #F5C800; --black: #0D0D0D; --dark: #1A1A1A;\n    --mid: #2A2A2A; --border: #333; --text: #E8E8E8; --muted: #888;\n  }\n  * { margin:0; padding:0; box-sizing:border-box; }\n  body { font-family:'Barlow',sans-serif; background:var(--black); color:var(--text); min-height:100vh; }\n\n  header {\n    background:var(--dark); border-bottom:3px solid var(--yellow);\n    padding:0 24px; display:flex; align-items:center; justify-content:space-between;\n    height:64px; position:sticky; top:0; z-index:100;\n  }\n  .logo { display:flex; align-items:center; gap:12px; }\n  .logo-badge {\n    width:42px; height:42px; background:var(--yellow); border-radius:8px;\n    display:flex; align-items:center; justify-content:center;\n    font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:18px;\n    color:var(--black); letter-spacing:-1px;\n  }\n  .logo-text h1 { font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:22px; color:var(--yellow); letter-spacing:1px; line-height:1; }\n  .logo-text p { font-size:11px; color:var(--muted); letter-spacing:2px; text-transform:uppercase; }\n  .header-right { display:flex; gap:12px; align-items:center; }\n  .header-stat strong { display:block; font-size:20px; font-family:'Barlow Condensed',sans-serif; font-weight:700; color:var(--yellow); line-height:1; }\n  .header-stat { font-size:12px; color:var(--muted); text-align:right; }\n  .btn-admin { background:var(--yellow); color:var(--black); border:none; padding:8px 16px; border-radius:6px; font-weight:700; font-family:'Barlow Condensed',sans-serif; font-size:14px; cursor:pointer; letter-spacing:1px; text-decoration:none; }\n  .btn-admin:hover { background:var(--yellow-dark, #d4ac00); }\n\n  .toolbar {\n    background:var(--dark); border-bottom:1px solid var(--border);\n    padding:12px 24px; display:flex; gap:12px; flex-wrap:wrap; align-items:center;\n  }\n  .toolbar-label { font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:1px; white-space:nowrap; }\n  select, input[type=\"text\"] {\n    background:var(--mid); border:1px solid var(--border); color:var(--text);\n    padding:7px 12px; border-radius:6px; font-size:13px; font-family:'Barlow',sans-serif; outline:none;\n  }\n  select:focus, input[type=\"text\"]:focus { border-color:var(--yellow); }\n  .divider { width:1px; height:28px; background:var(--border); }\n  .search-wrap { flex:1; min-width:180px; max-width:320px; position:relative; }\n  .search-wrap input { width:100%; padding-left:32px; }\n  .search-icon { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:var(--muted); font-size:14px; }\n\n  main { padding:20px 24px; max-width:1600px; margin:0 auto; }\n\n  .stats-bar { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; margin-bottom:16px; }\n  .stat-card { background:var(--dark); border:1px solid var(--border); border-radius:8px; padding:12px 16px; }\n  .stat-card .val { font-family:'Barlow Condensed',sans-serif; font-size:28px; font-weight:700; color:var(--yellow); line-height:1; }\n  .stat-card .lbl { font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:1px; }\n\n  .legend { display:flex; gap:16px; flex-wrap:wrap; margin-bottom:16px; padding:10px 14px; background:var(--dark); border:1px solid var(--border); border-radius:8px; font-size:12px; }\n  .legend-item { display:flex; align-items:center; gap:6px; color:var(--muted); }\n  .legend-dot { width:10px; height:10px; border-radius:2px; flex-shrink:0; }\n\n  .date-block { margin-bottom:12px; border:1px solid var(--border); border-radius:10px; overflow:hidden; }\n  .date-header { background:var(--mid); padding:10px 16px; display:flex; align-items:center; gap:14px; cursor:pointer; user-select:none; }\n  .date-header:hover { background:#333; }\n  .date-header .day-name { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:15px; color:var(--yellow); text-transform:uppercase; letter-spacing:1px; min-width:80px; }\n  .date-header .date-full { font-size:14px; }\n  .match-count { margin-left:auto; background:var(--yellow); color:var(--black); font-size:11px; font-weight:700; padding:2px 8px; border-radius:20px; font-family:'Barlow Condensed',sans-serif; }\n  .chevron { color:var(--muted); transition:transform .2s; font-size:12px; }\n  .date-header.collapsed .chevron { transform:rotate(-90deg); }\n\n  .matches-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:1px; background:var(--border); }\n  .matches-grid.collapsed { display:none; }\n\n  .match-card { background:var(--dark); padding:12px 14px; border-left:3px solid transparent; transition:background .15s; }\n  .match-card:hover { background:var(--mid); }\n  .match-card.home { border-left-color:#4CAF50; }\n  .match-card.away { border-left-color:#FF8C00; }\n  .match-card.coupe { border-left-color:#4A9EFF; }\n  .match-card.amical { border-left-color:#C8A800; }\n  .match-card.exempt, .match-card.report { border-left-color:#555; opacity:.7; }\n  .match-card.edited { position:relative; }\n  .match-card.edited::after { content:\"\u270e\"; position:absolute; top:6px; right:8px; font-size:10px; color:var(--muted); }\n\n  .match-team { font-size:11px; color:var(--yellow); text-transform:uppercase; letter-spacing:.5px; font-weight:600; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }\n  .match-vs { font-size:14px; font-weight:500; color:var(--text); line-height:1.3; }\n  .match-vs .ehr { color:var(--yellow); font-weight:700; }\n  .match-time { font-size:12px; color:var(--muted); margin-top:2px; }\n  .journee-badge { display:inline-block; font-size:10px; padding:1px 6px; border-radius:3px; margin-top:4px; font-weight:600; }\n  .journee-badge.j-champ { background:#1A3A1A; color:#6BCB77; }\n  .journee-badge.j-coupe { background:#1A2A3A; color:#6BC5FF; }\n  .journee-badge.j-amical { background:#2A2A1A; color:#C8A800; }\n  .match-note { font-size:11px; color:var(--muted); font-style:italic; margin-top:4px; }\n\n  .no-results { text-align:center; padding:60px 20px; color:var(--muted); }\n  .loading { text-align:center; padding:60px; color:var(--muted); font-size:14px; }\n\n  ::-webkit-scrollbar { width:6px; height:6px; }\n  ::-webkit-scrollbar-track { background:var(--dark); }\n  ::-webkit-scrollbar-thumb { background:#444; border-radius:3px; }\n\n  @media(max-width:640px) {\n    header { padding:0 14px; }\n    .header-right .header-stat { display:none; }\n    .toolbar { padding:10px 14px; }\n    main { padding:14px; }\n    .matches-grid { grid-template-columns:1fr; }\n  }\n</style>\n</head>\n<body>\n\n<header>\n  <div class=\"logo\">\n    <div class=\"logo-badge\">EHR</div>\n    <div class=\"logo-text\">\n      <h1>Planning Matchs</h1>\n      <p>Saison 2025\u20132026</p>\n    </div>\n  </div>\n  <div class=\"header-right\">\n    <div class=\"header-stat\"><strong id=\"h-matches\">\u2014</strong>matchs</div>\n    <div class=\"header-stat\"><strong id=\"h-teams\">\u2014</strong>\u00e9quipes</div>\n    <a href=\"/admin\" class=\"btn-admin\">\u2699 Admin</a>\n  </div>\n</header>\n\n<div class=\"toolbar\">\n  <div style=\"display:flex;gap:8px;align-items:center\">\n    <span class=\"toolbar-label\">\u00c9quipe</span>\n    <select id=\"filter-team\" onchange=\"applyFilters()\"><option value=\"\">Toutes</option></select>\n  </div>\n  <div style=\"display:flex;gap:8px;align-items:center\">\n    <span class=\"toolbar-label\">Mois</span>\n    <select id=\"filter-month\" onchange=\"applyFilters()\"><option value=\"\">Tous</option></select>\n  </div>\n  <div style=\"display:flex;gap:8px;align-items:center\">\n    <span class=\"toolbar-label\">Type</span>\n    <select id=\"filter-type\" onchange=\"applyFilters()\">\n      <option value=\"\">Tous</option>\n      <option value=\"champ\">Championnat</option>\n      <option value=\"coupe\">Coupe</option>\n      <option value=\"amical\">Amical</option>\n      <option value=\"exempt\">Exempt</option>\n    </select>\n  </div>\n  <div class=\"divider\"></div>\n  <div class=\"search-wrap\">\n    <span class=\"search-icon\">\ud83d\udd0d</span>\n    <input type=\"text\" id=\"search-input\" placeholder=\"Rechercher\u2026\" oninput=\"applyFilters()\">\n  </div>\n  <div style=\"display:flex;gap:8px;align-items:center;margin-left:auto\">\n    <a href=\"/api/export/ical\" style=\"font-size:12px;color:var(--muted);text-decoration:none\">\ud83d\udcc5 Export iCal (tout)</a>\n  </div>\n</div>\n\n<main>\n  <div class=\"stats-bar\">\n    <div class=\"stat-card\"><div class=\"val\" id=\"s-total\">\u2014</div><div class=\"lbl\">Matchs affich\u00e9s</div></div>\n    <div class=\"stat-card\"><div class=\"val\" id=\"s-home\">\u2014</div><div class=\"lbl\">Domiciles</div></div>\n    <div class=\"stat-card\"><div class=\"val\" id=\"s-away\">\u2014</div><div class=\"lbl\">D\u00e9placements</div></div>\n    <div class=\"stat-card\"><div class=\"val\" id=\"s-coupe\">\u2014</div><div class=\"lbl\">Coupes</div></div>\n    <div class=\"stat-card\"><div class=\"val\" id=\"s-exempt\">\u2014</div><div class=\"lbl\">Exempts</div></div>\n  </div>\n  <div class=\"legend\">\n    <div class=\"legend-item\"><div class=\"legend-dot\" style=\"background:#4CAF50\"></div>Domicile EHR</div>\n    <div class=\"legend-item\"><div class=\"legend-dot\" style=\"background:#FF8C00\"></div>D\u00e9placement</div>\n    <div class=\"legend-item\"><div class=\"legend-dot\" style=\"background:#4A9EFF\"></div>Coupe / CDF</div>\n    <div class=\"legend-item\"><div class=\"legend-dot\" style=\"background:#C8A800\"></div>Amical</div>\n    <div class=\"legend-item\"><div class=\"legend-dot\" style=\"background:#555\"></div>Exempt / Report</div>\n  </div>\n  <div id=\"planning-list\"><div class=\"loading\">Chargement\u2026</div></div>\n</main>\n\n<script>\nconst API = '';  // m\u00eame origine; changer si backend s\u00e9par\u00e9 ex: 'http://localhost:8000'\nlet ALL_MATCHES = [];\nlet ALL_TEAMS = [];\n\nasync function loadData() {\n  try {\n    const [matchRes, statsRes, teamRes] = await Promise.all([\n      fetch(API + '/api/matches'),\n      fetch(API + '/api/stats'),\n      fetch(API + '/api/teams'),\n    ]);\n    ALL_MATCHES = await matchRes.json();\n    const stats = await statsRes.json();\n    ALL_TEAMS = await teamRes.json();\n\n    document.getElementById('h-matches').textContent = stats.total_matches;\n    document.getElementById('h-teams').textContent = stats.total_teams;\n\n    // Populate team filter\n    const selTeam = document.getElementById('filter-team');\n    ALL_TEAMS.forEach(t => {\n      const o = document.createElement('option');\n      o.value = t.name; o.textContent = t.name;\n      selTeam.appendChild(o);\n    });\n\n    // Populate month filter\n    const months = [...new Set(ALL_MATCHES.map(m => m.date_iso.slice(0,7)))].sort();\n    const selMonth = document.getElementById('filter-month');\n    const monthNames = ['Janvier','F\u00e9vrier','Mars','Avril','Mai','Juin','Juillet','Ao\u00fbt','Septembre','Octobre','Novembre','D\u00e9cembre'];\n    months.forEach(k => {\n      const [y, mo] = k.split('-');\n      const o = document.createElement('option');\n      o.value = k; o.textContent = monthNames[parseInt(mo)-1] + ' ' + y;\n      selMonth.appendChild(o);\n    });\n\n    applyFilters();\n  } catch(e) {\n    document.getElementById('planning-list').innerHTML = `<div class=\"no-results\"><p>\u26a0 Impossible de contacter l'API.<br>V\u00e9rifiez que le backend est d\u00e9marr\u00e9.</p></div>`;\n  }\n}\n\nfunction applyFilters() {\n  const team = document.getElementById('filter-team').value;\n  const month = document.getElementById('filter-month').value;\n  const type = document.getElementById('filter-type').value;\n  const search = document.getElementById('search-input').value.toLowerCase();\n\n  let filtered = ALL_MATCHES.filter(m => {\n    if (team && m.team_name !== team) return false;\n    if (month && !m.date_iso.startsWith(month)) return false;\n    if (type && m.match_type !== type) return false;\n    if (search && !(m.match_text + m.team_name + m.opponent + m.coach).toLowerCase().includes(search)) return false;\n    return true;\n  });\n\n  // Stats\n  document.getElementById('s-total').textContent = filtered.length;\n  document.getElementById('s-home').textContent = filtered.filter(m => m.home === true).length;\n  document.getElementById('s-away').textContent = filtered.filter(m => m.home === false).length;\n  document.getElementById('s-coupe').textContent = filtered.filter(m => m.match_type === 'coupe').length;\n  document.getElementById('s-exempt').textContent = filtered.filter(m => m.match_type === 'exempt').length;\n\n  renderList(filtered);\n}\n\nfunction renderList(matches) {\n  const el = document.getElementById('planning-list');\n  if (!matches.length) {\n    el.innerHTML = '<div class=\"no-results\"><p>Aucun match trouv\u00e9</p></div>';\n    return;\n  }\n\n  const byDate = {};\n  matches.forEach(m => {\n    if (!byDate[m.date_iso]) byDate[m.date_iso] = [];\n    byDate[m.date_iso].push(m);\n  });\n\n  const typeClass = { champ: m => m.home === true ? 'home' : m.home === false ? 'away' : '', coupe:'coupe', amical:'amical', exempt:'exempt', report:'report' };\n\n  el.innerHTML = Object.keys(byDate).sort().map(iso => {\n    const ms = byDate[iso];\n    const sample = ms[0];\n    const parts = sample.date_str.split(' ');\n    const dateNum = parts[0];\n    const dayName = parts.slice(1).join(' ');\n\n    const cards = ms.map(m => {\n      const tc = typeof typeClass[m.match_type] === 'function' ? typeClass[m.match_type](m) : (typeClass[m.match_type] || '');\n      const mainLine = m.match_text.split('\\n')[0].replace(/EHR/g, '<span class=\"ehr\">EHR</span>');\n      let badge = '';\n      if (m.journee) {\n        const bc = /coupe|cdf|moselle/i.test(m.journee) ? 'j-coupe' : /amical/i.test(m.journee) ? 'j-amical' : 'j-champ';\n        badge = `<span class=\"journee-badge ${bc}\">${m.journee}</span>`;\n      }\n      return `<div class=\"match-card ${tc} ${m.manually_edited?'edited':''}\">\n        <div class=\"match-team\">${m.team_name}</div>\n        <div class=\"match-vs\">${mainLine}</div>\n        ${m.time_str ? `<div class=\"match-time\">\u23f1 ${m.time_str}</div>` : ''}\n        ${badge}\n        ${m.note ? `<div class=\"match-note\">${m.note}</div>` : ''}\n      </div>`;\n    }).join('');\n\n    return `<div class=\"date-block\">\n      <div class=\"date-header\" onclick=\"this.classList.toggle('collapsed');this.nextElementSibling.classList.toggle('collapsed')\">\n        <span class=\"day-name\">${dayName}</span>\n        <span class=\"date-full\">${dateNum}</span>\n        <span class=\"match-count\">${ms.length} match${ms.length>1?'s':''}</span>\n        <span class=\"chevron\">\u25be</span>\n      </div>\n      <div class=\"matches-grid\">${cards}</div>\n    </div>`;\n  }).join('');\n}\n\nloadData();\n</script>\n</body>\n</html>\n"
_HTML_ADMIN  = "<!DOCTYPE html>\n<html lang=\"fr\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n<title>EHR Admin \u2014 Planning</title>\n<link href=\"https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800&family=Barlow:wght@300;400;500;600&display=swap\" rel=\"stylesheet\">\n<style>\n  :root {\n    --yellow:#F5C800; --black:#0D0D0D; --dark:#1A1A1A; --mid:#2A2A2A;\n    --border:#333; --text:#E8E8E8; --muted:#888; --danger:#E05252; --success:#4CAF50;\n  }\n  *{margin:0;padding:0;box-sizing:border-box;}\n  body{font-family:'Barlow',sans-serif;background:var(--black);color:var(--text);min-height:100vh;}\n\n  /* \u2500\u2500 HEADER \u2500\u2500 */\n  header{background:var(--dark);border-bottom:3px solid var(--yellow);padding:0 24px;display:flex;align-items:center;justify-content:space-between;height:64px;position:sticky;top:0;z-index:100;}\n  .logo{display:flex;align-items:center;gap:12px;}\n  .logo-badge{width:42px;height:42px;background:var(--yellow);border-radius:8px;display:flex;align-items:center;justify-content:center;font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:18px;color:var(--black);}\n  .logo-text h1{font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:22px;color:var(--yellow);letter-spacing:1px;line-height:1;}\n  .logo-text p{font-size:11px;color:var(--muted);letter-spacing:2px;text-transform:uppercase;}\n  .header-right{display:flex;align-items:center;gap:12px;}\n  #user-info{font-size:13px;color:var(--muted);}\n  #user-info strong{color:var(--yellow);}\n\n  /* \u2500\u2500 BTNs \u2500\u2500 */\n  .btn{padding:8px 16px;border:none;border-radius:6px;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:14px;cursor:pointer;letter-spacing:.5px;transition:opacity .2s;}\n  .btn:hover{opacity:.85;}\n  .btn-primary{background:var(--yellow);color:var(--black);}\n  .btn-danger{background:var(--danger);color:#fff;}\n  .btn-ghost{background:transparent;color:var(--muted);border:1px solid var(--border);}\n  .btn-ghost:hover{color:var(--text);border-color:var(--text);}\n  .btn-sm{padding:5px 10px;font-size:12px;}\n\n  /* \u2500\u2500 LOGIN SCREEN \u2500\u2500 */\n  #login-screen{display:flex;align-items:center;justify-content:center;min-height:100vh;}\n  .login-card{background:var(--dark);border:1px solid var(--border);border-radius:12px;padding:40px;width:360px;}\n  .login-card h2{font-family:'Barlow Condensed',sans-serif;font-size:24px;color:var(--yellow);margin-bottom:24px;font-weight:800;}\n  .form-group{margin-bottom:16px;}\n  .form-group label{display:block;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;}\n  .form-group input, .form-group select, .form-group textarea{width:100%;background:var(--mid);border:1px solid var(--border);color:var(--text);padding:10px 12px;border-radius:6px;font-size:14px;font-family:'Barlow',sans-serif;outline:none;resize:vertical;}\n  .form-group input:focus, .form-group select:focus, .form-group textarea:focus{border-color:var(--yellow);}\n  .login-error{color:var(--danger);font-size:13px;margin-bottom:12px;display:none;}\n\n  /* \u2500\u2500 TABS \u2500\u2500 */\n  #app-screen{display:none;}\n  .tabs{background:var(--dark);border-bottom:1px solid var(--border);display:flex;padding:0 24px;}\n  .tab{padding:14px 20px;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:14px;cursor:pointer;color:var(--muted);border-bottom:3px solid transparent;letter-spacing:.5px;text-transform:uppercase;transition:all .2s;}\n  .tab.active{color:var(--yellow);border-bottom-color:var(--yellow);}\n  .tab:hover{color:var(--text);}\n\n  .tab-content{display:none;padding:24px;max-width:1400px;margin:0 auto;}\n  .tab-content.active{display:block;}\n\n  /* \u2500\u2500 TABLE \u2500\u2500 */\n  .toolbar-row{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:16px;}\n  .toolbar-row select, .toolbar-row input[type=\"text\"]{background:var(--mid);border:1px solid var(--border);color:var(--text);padding:7px 12px;border-radius:6px;font-size:13px;font-family:'Barlow',sans-serif;outline:none;}\n  .toolbar-row select:focus, .toolbar-row input[type=\"text\"]:focus{border-color:var(--yellow);}\n\n  .table-wrap{overflow-x:auto;border-radius:8px;border:1px solid var(--border);}\n  table{width:100%;border-collapse:collapse;font-size:13px;}\n  thead th{background:var(--mid);padding:10px 12px;text-align:left;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);white-space:nowrap;}\n  tbody tr{border-top:1px solid #222;}\n  tbody tr:hover{background:var(--mid);}\n  tbody td{padding:9px 12px;vertical-align:middle;}\n  .type-badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;}\n  .type-champ{background:#1A3A1A;color:#6BCB77;}\n  .type-coupe{background:#1A2A3A;color:#6BC5FF;}\n  .type-amical{background:#2A2A1A;color:#C8A800;}\n  .type-exempt{background:#222;color:#666;}\n  .type-report{background:#3A1A1A;color:#E05252;}\n  .home-dot{display:inline-block;width:8px;height:8px;border-radius:50%;}\n  .edited-tag{font-size:10px;color:var(--muted);font-style:italic;}\n  .actions{display:flex;gap:6px;}\n  .pagination{display:flex;gap:8px;align-items:center;margin-top:16px;font-size:13px;color:var(--muted);}\n  .page-btn{background:var(--mid);border:1px solid var(--border);color:var(--text);padding:4px 10px;border-radius:4px;cursor:pointer;}\n  .page-btn:disabled{opacity:.3;cursor:default;}\n\n  /* \u2500\u2500 MODAL \u2500\u2500 */\n  .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:200;display:flex;align-items:center;justify-content:center;display:none;}\n  .modal-overlay.open{display:flex;}\n  .modal{background:var(--dark);border:1px solid var(--border);border-radius:12px;padding:32px;width:560px;max-width:95vw;max-height:90vh;overflow-y:auto;}\n  .modal h3{font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:800;color:var(--yellow);margin-bottom:20px;}\n  .modal-footer{display:flex;gap:10px;justify-content:flex-end;margin-top:20px;border-top:1px solid var(--border);padding-top:16px;}\n  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}\n\n  /* \u2500\u2500 IMPORT \u2500\u2500 */\n  .import-zone{border:2px dashed var(--border);border-radius:10px;padding:40px;text-align:center;cursor:pointer;transition:border-color .2s;}\n  .import-zone:hover, .import-zone.drag{border-color:var(--yellow);}\n  .import-zone p{color:var(--muted);font-size:14px;margin-top:8px;}\n  .import-result{margin-top:16px;padding:16px;border-radius:8px;font-size:14px;line-height:1.6;}\n  .import-result.ok{background:#1A3A1A;border:1px solid #4CAF50;color:#6BCB77;}\n  .import-result.error{background:#3A1A1A;border:1px solid var(--danger);color:#F08080;}\n  .log-table{margin-top:16px;}\n  .log-table table{font-size:12px;}\n\n  /* \u2500\u2500 USERS \u2500\u2500 */\n  .user-list{display:flex;flex-direction:column;gap:8px;margin-top:16px;}\n  .user-row{background:var(--mid);border-radius:8px;padding:12px 16px;display:flex;align-items:center;gap:12px;}\n  .user-role{font-size:11px;padding:2px 8px;border-radius:4px;font-weight:700;}\n  .role-admin{background:#3A1A3A;color:#CF8EE0;}\n  .role-editor{background:#1A2A3A;color:#6BC5FF;}\n  .role-viewer{background:#222;color:#888;}\n\n  /* \u2500\u2500 TOAST \u2500\u2500 */\n  #toast{position:fixed;bottom:24px;right:24px;background:#333;color:var(--text);padding:12px 20px;border-radius:8px;font-size:13px;z-index:999;transform:translateY(80px);transition:transform .3s;pointer-events:none;}\n  #toast.show{transform:translateY(0);}\n  #toast.success{background:#1A3A1A;color:#6BCB77;}\n  #toast.error{background:#3A1A1A;color:#F08080;}\n\n  .section-title{font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:800;color:var(--yellow);margin-bottom:16px;letter-spacing:1px;}\n  .stat-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:20px;}\n  .stat-mini{background:var(--mid);border-radius:8px;padding:10px 14px;}\n  .stat-mini .v{font-family:'Barlow Condensed',sans-serif;font-size:24px;font-weight:700;color:var(--yellow);}\n  .stat-mini .l{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;}\n</style>\n</head>\n<body>\n\n<header>\n  <div class=\"logo\">\n    <div class=\"logo-badge\">EHR</div>\n    <div class=\"logo-text\">\n      <h1>Administration</h1>\n      <p>Planning 2025\u20132026</p>\n    </div>\n  </div>\n  <div class=\"header-right\">\n    <div id=\"user-info\"></div>\n    <button class=\"btn btn-ghost btn-sm\" onclick=\"logout()\">D\u00e9connexion</button>\n    <a href=\"/\" class=\"btn btn-ghost btn-sm\">\u2190 Planning</a>\n  </div>\n</header>\n\n<!-- \u2500\u2500 LOGIN \u2500\u2500 -->\n<div id=\"login-screen\">\n  <div class=\"login-card\">\n    <h2>\ud83d\udd10 Connexion Admin</h2>\n    <div class=\"login-error\" id=\"login-error\">Identifiants invalides</div>\n    <div class=\"form-group\">\n      <label>Nom d'utilisateur</label>\n      <input type=\"text\" id=\"login-user\" value=\"admin\" autocomplete=\"username\">\n    </div>\n    <div class=\"form-group\">\n      <label>Mot de passe</label>\n      <input type=\"password\" id=\"login-pwd\" value=\"ehr2025\" autocomplete=\"current-password\" onkeydown=\"if(event.key==='Enter')doLogin()\">\n    </div>\n    <button class=\"btn btn-primary\" style=\"width:100%\" onclick=\"doLogin()\">Se connecter</button>\n  </div>\n</div>\n\n<!-- \u2500\u2500 APP \u2500\u2500 -->\n<div id=\"app-screen\">\n  <div class=\"tabs\">\n    <div class=\"tab active\" onclick=\"showTab('matches')\">\ud83d\udccb Matchs</div>\n    <div class=\"tab\" onclick=\"showTab('import')\">\ud83d\udce5 Import Excel</div>\n    <div class=\"tab\" onclick=\"showTab('users')\" id=\"tab-users\">\ud83d\udc65 Utilisateurs</div>\n  </div>\n\n  <!-- TAB MATCHS -->\n  <div class=\"tab-content active\" id=\"tab-matches\">\n    <div class=\"toolbar-row\">\n      <select id=\"ft-team\" onchange=\"loadMatches()\"><option value=\"\">Toutes les \u00e9quipes</option></select>\n      <select id=\"ft-month\" onchange=\"loadMatches()\"><option value=\"\">Tous les mois</option></select>\n      <select id=\"ft-type\" onchange=\"loadMatches()\">\n        <option value=\"\">Tous types</option>\n        <option value=\"champ\">Championnat</option>\n        <option value=\"coupe\">Coupe</option>\n        <option value=\"amical\">Amical</option>\n        <option value=\"exempt\">Exempt</option>\n        <option value=\"report\">Report</option>\n      </select>\n      <input type=\"text\" id=\"ft-search\" placeholder=\"Rechercher\u2026\" oninput=\"loadMatches()\" style=\"flex:1;min-width:150px\">\n      <button class=\"btn btn-primary\" onclick=\"openModal()\">+ Ajouter un match</button>\n    </div>\n\n    <div class=\"stat-row\" id=\"match-stats\"></div>\n\n    <div class=\"table-wrap\">\n      <table>\n        <thead>\n          <tr>\n            <th>Date</th>\n            <th>\u00c9quipe</th>\n            <th>Match</th>\n            <th>Heure</th>\n            <th>Type</th>\n            <th>Lieu</th>\n            <th>Journ\u00e9e</th>\n            <th>Note</th>\n            <th>Actions</th>\n          </tr>\n        </thead>\n        <tbody id=\"match-tbody\"></tbody>\n      </table>\n    </div>\n    <div class=\"pagination\">\n      <button class=\"page-btn\" id=\"btn-prev\" onclick=\"changePage(-1)\">\u25c0</button>\n      <span id=\"page-info\"></span>\n      <button class=\"page-btn\" id=\"btn-next\" onclick=\"changePage(1)\">\u25b6</button>\n      <span style=\"margin-left:8px\" id=\"total-info\"></span>\n    </div>\n  </div>\n\n  <!-- TAB IMPORT -->\n  <div class=\"tab-content\" id=\"tab-import\">\n    <div class=\"section-title\">Importer un fichier Excel</div>\n    <div class=\"import-zone\" id=\"import-zone\" onclick=\"document.getElementById('file-input').click()\"\n      ondragover=\"event.preventDefault();this.classList.add('drag')\"\n      ondragleave=\"this.classList.remove('drag')\"\n      ondrop=\"handleDrop(event)\">\n      <div style=\"font-size:48px\">\ud83d\udcc2</div>\n      <p>Cliquer ou glisser-d\u00e9poser votre fichier <strong>.xls</strong> ou <strong>.xlsx</strong></p>\n      <p style=\"font-size:12px;margin-top:8px;\">Les matchs \u00e9dit\u00e9s manuellement ne seront pas \u00e9cras\u00e9s</p>\n      <input type=\"file\" id=\"file-input\" accept=\".xls,.xlsx\" style=\"display:none\" onchange=\"handleFileSelect(this)\">\n    </div>\n    <div id=\"import-result\"></div>\n\n    <div class=\"log-table\" id=\"log-table\">\n      <div class=\"section-title\" style=\"margin-top:32px\">Historique des imports</div>\n      <div class=\"table-wrap\">\n        <table>\n          <thead><tr><th>Fichier</th><th>Date</th><th>Cr\u00e9\u00e9s</th><th>Mis \u00e0 jour</th><th>Ignor\u00e9s</th><th>Statut</th></tr></thead>\n          <tbody id=\"log-tbody\"></tbody>\n        </table>\n      </div>\n    </div>\n  </div>\n\n  <!-- TAB USERS -->\n  <div class=\"tab-content\" id=\"tab-users-content\">\n    <div class=\"section-title\">Gestion des utilisateurs</div>\n    <div style=\"display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap\">\n      <div class=\"form-group\" style=\"margin:0;flex:1;min-width:150px\"><input type=\"text\" id=\"nu-user\" placeholder=\"Nom d'utilisateur\"></div>\n      <div class=\"form-group\" style=\"margin:0;flex:1;min-width:150px\"><input type=\"password\" id=\"nu-pwd\" placeholder=\"Mot de passe\"></div>\n      <select id=\"nu-role\" style=\"background:var(--mid);border:1px solid var(--border);color:var(--text);padding:7px 12px;border-radius:6px;font-size:13px;\">\n        <option value=\"viewer\">Lecture seule</option>\n        <option value=\"editor\">\u00c9diteur</option>\n        <option value=\"admin\">Admin</option>\n      </select>\n      <input type=\"text\" id=\"nu-team\" placeholder=\"\u00c9quipe (vide=toutes)\" style=\"background:var(--mid);border:1px solid var(--border);color:var(--text);padding:7px 12px;border-radius:6px;font-size:13px;\">\n      <button class=\"btn btn-primary\" onclick=\"createUser()\">Cr\u00e9er</button>\n    </div>\n    <div class=\"user-list\" id=\"user-list\"></div>\n  </div>\n</div>\n\n<!-- \u2500\u2500 MODAL MATCH \u2500\u2500 -->\n<div class=\"modal-overlay\" id=\"modal\">\n  <div class=\"modal\">\n    <h3 id=\"modal-title\">Ajouter un match</h3>\n    <input type=\"hidden\" id=\"m-id\">\n    <div class=\"grid-2\">\n      <div class=\"form-group\">\n        <label>Date (ex: 13/09/2025 Samedi)</label>\n        <input type=\"text\" id=\"m-date\" placeholder=\"jj/mm/aaaa Jour\">\n      </div>\n      <div class=\"form-group\">\n        <label>Heure (ex: 18h00)</label>\n        <input type=\"text\" id=\"m-time\" placeholder=\"18h00\">\n      </div>\n    </div>\n    <div class=\"form-group\">\n      <label>\u00c9quipe</label>\n      <select id=\"m-team\"></select>\n    </div>\n    <div class=\"form-group\">\n      <label>Texte du match</label>\n      <input type=\"text\" id=\"m-text\" placeholder=\"EHR - Adversaire ou Adversaire - EHR\">\n    </div>\n    <div class=\"grid-2\">\n      <div class=\"form-group\">\n        <label>Adversaire</label>\n        <input type=\"text\" id=\"m-opponent\" placeholder=\"Nom du club\">\n      </div>\n      <div class=\"form-group\">\n        <label>Journ\u00e9e / Tour</label>\n        <input type=\"text\" id=\"m-journee\" placeholder=\"Journ\u00e9e 5\">\n      </div>\n    </div>\n    <div class=\"grid-2\">\n      <div class=\"form-group\">\n        <label>Type de match</label>\n        <select id=\"m-type\">\n          <option value=\"champ\">Championnat</option>\n          <option value=\"coupe\">Coupe</option>\n          <option value=\"amical\">Amical</option>\n          <option value=\"exempt\">Exempt</option>\n          <option value=\"report\">Report\u00e9</option>\n        </select>\n      </div>\n      <div class=\"form-group\">\n        <label>Lieu</label>\n        <select id=\"m-home\">\n          <option value=\"\">Non d\u00e9fini</option>\n          <option value=\"true\">Domicile</option>\n          <option value=\"false\">Ext\u00e9rieur</option>\n        </select>\n      </div>\n    </div>\n    <div class=\"form-group\">\n      <label>Note / commentaire</label>\n      <textarea id=\"m-note\" rows=\"2\" placeholder=\"Informations compl\u00e9mentaires\u2026\"></textarea>\n    </div>\n    <div class=\"modal-footer\">\n      <button class=\"btn btn-ghost\" onclick=\"closeModal()\">Annuler</button>\n      <button class=\"btn btn-primary\" onclick=\"saveMatch()\">Enregistrer</button>\n    </div>\n  </div>\n</div>\n\n<div id=\"toast\"></div>\n\n<script>\nconst API = '';\nlet TOKEN = localStorage.getItem('ehr_token') || '';\nlet USER_ROLE = '';\nlet currentPage = 1;\nconst PAGE_SIZE = 50;\nlet allMatches = [];\nlet allTeams = [];\n\n// \u2500\u2500 AUTH \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\nasync function doLogin() {\n  const u = document.getElementById('login-user').value;\n  const p = document.getElementById('login-pwd').value;\n  const fd = new FormData();\n  fd.append('username', u); fd.append('password', p);\n  try {\n    const res = await fetch(API + '/api/login', { method:'POST', body:fd });\n    if (!res.ok) { document.getElementById('login-error').style.display='block'; return; }\n    const data = await res.json();\n    TOKEN = data.token;\n    USER_ROLE = data.role;\n    localStorage.setItem('ehr_token', TOKEN);\n    document.getElementById('login-error').style.display = 'none';\n    initApp(data);\n  } catch(e) {\n    document.getElementById('login-error').style.display = 'block';\n  }\n}\n\nasync function checkExistingSession() {\n  if (!TOKEN) return;\n  try {\n    const res = await fetch(API + '/api/me?token=' + TOKEN);\n    const data = await res.json();\n    if (data.username) { USER_ROLE = data.role; initApp(data); }\n    else { TOKEN = ''; localStorage.removeItem('ehr_token'); }\n  } catch(e) { TOKEN = ''; }\n}\n\nfunction logout() {\n  const fd = new FormData(); fd.append('token', TOKEN);\n  fetch(API + '/api/logout', { method:'POST', body:fd });\n  TOKEN = ''; localStorage.removeItem('ehr_token');\n  document.getElementById('app-screen').style.display = 'none';\n  document.getElementById('login-screen').style.display = 'flex';\n}\n\nfunction initApp(data) {\n  document.getElementById('login-screen').style.display = 'none';\n  document.getElementById('app-screen').style.display = 'block';\n  document.getElementById('user-info').innerHTML = `Connect\u00e9 : <strong>${data.username}</strong> (${data.role})`;\n  // Masquer onglet users si non admin\n  if (data.role !== 'admin') document.getElementById('tab-users').style.display = 'none';\n  loadTeams();\n  loadMatches();\n  loadLogs();\n  if (data.role === 'admin') loadUsers();\n}\n\n// \u2500\u2500 TABS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\nfunction showTab(name) {\n  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));\n  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));\n  event.target.classList.add('active');\n  document.getElementById('tab-' + (name === 'users' ? 'users-content' : name)).classList.add('active');\n  if (name === 'import') loadLogs();\n}\n\n// \u2500\u2500 DONN\u00c9ES \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\nasync function loadTeams() {\n  const res = await fetch(API + '/api/teams');\n  allTeams = await res.json();\n  const selFt = document.getElementById('ft-team');\n  const selMt = document.getElementById('m-team');\n  allTeams.forEach(t => {\n    [selFt, selMt].forEach(sel => {\n      const o = document.createElement('option');\n      o.value = t.name; o.textContent = t.name;\n      sel.appendChild(o);\n    });\n  });\n  // Months filter\n  const res2 = await fetch(API + '/api/matches');\n  const all = await res2.json();\n  const months = [...new Set(all.map(m => m.date_iso.slice(0,7)))].sort();\n  const monthNames = ['Janvier','F\u00e9vrier','Mars','Avril','Mai','Juin','Juillet','Ao\u00fbt','Septembre','Octobre','Novembre','D\u00e9cembre'];\n  const selM = document.getElementById('ft-month');\n  months.forEach(k => {\n    const [y, mo] = k.split('-');\n    const o = document.createElement('option');\n    o.value = k; o.textContent = monthNames[parseInt(mo)-1] + ' ' + y;\n    selM.appendChild(o);\n  });\n}\n\nasync function loadMatches() {\n  const team = document.getElementById('ft-team').value;\n  const month = document.getElementById('ft-month').value;\n  const type = document.getElementById('ft-type').value;\n  const search = document.getElementById('ft-search').value;\n  let url = API + '/api/matches?';\n  if (team) url += 'team=' + encodeURIComponent(team) + '&';\n  if (month) url += 'month=' + encodeURIComponent(month) + '&';\n  if (type) url += 'match_type=' + encodeURIComponent(type) + '&';\n  if (search) url += 'search=' + encodeURIComponent(search) + '&';\n  const res = await fetch(url);\n  allMatches = await res.json();\n  currentPage = 1;\n  renderMatchTable();\n  renderStats();\n}\n\nfunction renderStats() {\n  const ms = allMatches;\n  document.getElementById('match-stats').innerHTML = `\n    <div class=\"stat-mini\"><div class=\"v\">${ms.length}</div><div class=\"l\">Total affich\u00e9</div></div>\n    <div class=\"stat-mini\"><div class=\"v\">${ms.filter(m=>m.home===true).length}</div><div class=\"l\">Domiciles</div></div>\n    <div class=\"stat-mini\"><div class=\"v\">${ms.filter(m=>m.home===false).length}</div><div class=\"l\">D\u00e9placements</div></div>\n    <div class=\"stat-mini\"><div class=\"v\">${ms.filter(m=>m.match_type==='coupe').length}</div><div class=\"l\">Coupes</div></div>\n    <div class=\"stat-mini\"><div class=\"v\">${ms.filter(m=>m.manually_edited).length}</div><div class=\"l\">\u00c9dit\u00e9s manuellement</div></div>\n  `;\n}\n\nfunction renderMatchTable() {\n  const start = (currentPage - 1) * PAGE_SIZE;\n  const page = allMatches.slice(start, start + PAGE_SIZE);\n  const totalPages = Math.ceil(allMatches.length / PAGE_SIZE);\n\n  document.getElementById('page-info').textContent = `Page ${currentPage} / ${totalPages || 1}`;\n  document.getElementById('total-info').textContent = `${allMatches.length} match${allMatches.length>1?'s':''}`;\n  document.getElementById('btn-prev').disabled = currentPage <= 1;\n  document.getElementById('btn-next').disabled = currentPage >= totalPages;\n\n  const typeClass = { champ:'type-champ', coupe:'type-coupe', amical:'type-amical', exempt:'type-exempt', report:'type-report' };\n  const typeLabel = { champ:'Champ.', coupe:'Coupe', amical:'Amical', exempt:'Exempt', report:'Report' };\n  const canEdit = USER_ROLE === 'admin' || USER_ROLE === 'editor';\n\n  document.getElementById('match-tbody').innerHTML = page.map(m => `\n    <tr>\n      <td style=\"white-space:nowrap;font-size:12px\">${m.date_str.split(' ')[0]}<br><span style=\"color:var(--muted)\">${m.date_str.split(' ').slice(1).join(' ')}</span></td>\n      <td style=\"font-size:12px;color:var(--yellow)\">${m.team_name}</td>\n      <td>\n        ${m.match_text.split('\\n')[0]}\n        ${m.manually_edited ? '<span class=\"edited-tag\"> \u270e modifi\u00e9</span>' : ''}\n      </td>\n      <td style=\"color:var(--muted)\">${m.time_str || '\u2014'}</td>\n      <td><span class=\"type-badge ${typeClass[m.match_type]||''}\">${typeLabel[m.match_type]||m.match_type}</span></td>\n      <td>${m.home===true ? '<span class=\"home-dot\" style=\"background:#4CAF50\"></span> Dom.' : m.home===false ? '<span class=\"home-dot\" style=\"background:#FF8C00\"></span> Ext.' : '\u2014'}</td>\n      <td style=\"font-size:12px;color:var(--muted)\">${m.journee||'\u2014'}</td>\n      <td style=\"font-size:11px;color:var(--muted);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\">${m.note||''}</td>\n      <td>\n        <div class=\"actions\">\n          ${canEdit ? `<button class=\"btn btn-ghost btn-sm\" onclick=\"openModal(${m.id})\">\u270f</button>\n          <button class=\"btn btn-danger btn-sm\" onclick=\"deleteMatch(${m.id})\">\u2715</button>` : ''}\n        </div>\n      </td>\n    </tr>\n  `).join('') || '<tr><td colspan=\"9\" style=\"text-align:center;padding:20px;color:var(--muted)\">Aucun match trouv\u00e9</td></tr>';\n}\n\nfunction changePage(dir) {\n  currentPage += dir;\n  renderMatchTable();\n}\n\n// \u2500\u2500 MODAL MATCH \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\nasync function openModal(id = null) {\n  document.getElementById('modal-title').textContent = id ? 'Modifier le match' : 'Ajouter un match';\n  document.getElementById('m-id').value = id || '';\n  if (id) {\n    const res = await fetch(API + '/api/matches/' + id);\n    const m = await res.json();\n    document.getElementById('m-date').value = m.date_str;\n    document.getElementById('m-time').value = m.time_str || '';\n    document.getElementById('m-team').value = m.team_name;\n    document.getElementById('m-text').value = m.match_text.split('\\n')[0];\n    document.getElementById('m-opponent').value = m.opponent || '';\n    document.getElementById('m-journee').value = m.journee || '';\n    document.getElementById('m-type').value = m.match_type;\n    document.getElementById('m-home').value = m.home === true ? 'true' : m.home === false ? 'false' : '';\n    document.getElementById('m-note').value = m.note || '';\n  } else {\n    ['m-date','m-time','m-text','m-opponent','m-journee','m-note'].forEach(id => document.getElementById(id).value = '');\n    document.getElementById('m-type').value = 'champ';\n    document.getElementById('m-home').value = '';\n  }\n  document.getElementById('modal').classList.add('open');\n}\n\nfunction closeModal() { document.getElementById('modal').classList.remove('open'); }\n\nasync function saveMatch() {\n  const id = document.getElementById('m-id').value;\n  const fd = new FormData();\n  fd.append('token', TOKEN);\n  fd.append('date_str', document.getElementById('m-date').value);\n  fd.append('team_name', document.getElementById('m-team').value);\n  fd.append('match_text', document.getElementById('m-text').value);\n  fd.append('time_str', document.getElementById('m-time').value);\n  fd.append('opponent', document.getElementById('m-opponent').value);\n  fd.append('journee', document.getElementById('m-journee').value);\n  fd.append('match_type', document.getElementById('m-type').value);\n  const homeVal = document.getElementById('m-home').value;\n  if (homeVal === 'true') fd.append('home', 'true');\n  else if (homeVal === 'false') fd.append('home', 'false');\n  fd.append('note', document.getElementById('m-note').value);\n\n  const url = id ? API + '/api/matches/' + id : API + '/api/matches';\n  const method = id ? 'PUT' : 'POST';\n  const res = await fetch(url, { method, body: fd });\n  if (res.ok) {\n    closeModal();\n    loadMatches();\n    showToast(id ? 'Match modifi\u00e9 \u2713' : 'Match ajout\u00e9 \u2713', 'success');\n  } else {\n    showToast('Erreur lors de la sauvegarde', 'error');\n  }\n}\n\nasync function deleteMatch(id) {\n  if (!confirm('Supprimer ce match ?')) return;\n  const res = await fetch(API + '/api/matches/' + id + '?token=' + TOKEN, { method:'DELETE' });\n  if (res.ok) { loadMatches(); showToast('Match supprim\u00e9', 'success'); }\n  else showToast('Erreur suppression', 'error');\n}\n\n// \u2500\u2500 IMPORT \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\nfunction handleDrop(e) {\n  e.preventDefault();\n  document.getElementById('import-zone').classList.remove('drag');\n  const file = e.dataTransfer.files[0];\n  if (file) uploadFile(file);\n}\n\nfunction handleFileSelect(input) {\n  if (input.files[0]) uploadFile(input.files[0]);\n}\n\nasync function uploadFile(file) {\n  const result = document.getElementById('import-result');\n  result.innerHTML = '<p style=\"color:var(--muted)\">Import en cours\u2026</p>';\n  const fd = new FormData();\n  fd.append('token', TOKEN);\n  fd.append('file', file);\n  try {\n    const res = await fetch(API + '/api/import', { method:'POST', body:fd });\n    const data = await res.json();\n    if (data.status === 'ok') {\n      result.className = 'import-result ok';\n      result.innerHTML = `<strong>\u2713 Import r\u00e9ussi</strong> \u2014 ${data.filename}<br>\n        \ud83d\udce5 ${data.created} cr\u00e9\u00e9s &nbsp;|&nbsp; \ud83d\udd04 ${data.updated} mis \u00e0 jour &nbsp;|&nbsp; \u23ed ${data.skipped} ignor\u00e9s (\u00e9dit\u00e9s manuellement)`;\n      loadMatches();\n    } else {\n      result.className = 'import-result error';\n      result.innerHTML = `<strong>\u2717 Erreur</strong> : ${data.message}`;\n    }\n    loadLogs();\n  } catch(e) {\n    result.className = 'import-result error';\n    result.innerHTML = '\u2717 Impossible de joindre le serveur';\n  }\n}\n\nasync function loadLogs() {\n  if (!TOKEN) return;\n  try {\n    const res = await fetch(API + '/api/import/logs?token=' + TOKEN);\n    const logs = await res.json();\n    document.getElementById('log-tbody').innerHTML = logs.slice(0,20).map(l => `\n      <tr>\n        <td>${l.filename}</td>\n        <td style=\"white-space:nowrap;color:var(--muted)\">${l.imported_at.split('T')[0]}</td>\n        <td style=\"color:#6BCB77\">${l.rows_created}</td>\n        <td style=\"color:#6BC5FF\">${l.rows_updated}</td>\n        <td style=\"color:var(--muted)\">${l.rows_skipped}</td>\n        <td><span style=\"color:${l.status==='ok'?'#6BCB77':'#E05252'}\">${l.status}</span></td>\n      </tr>\n    `).join('') || '<tr><td colspan=\"6\" style=\"text-align:center;color:var(--muted);padding:16px\">Aucun import effectu\u00e9</td></tr>';\n  } catch(e) {}\n}\n\n// \u2500\u2500 USERS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\nasync function loadUsers() {\n  if (USER_ROLE !== 'admin') return;\n  const res = await fetch(API + '/api/users?token=' + TOKEN);\n  const users = await res.json();\n  document.getElementById('user-list').innerHTML = users.map(u => `\n    <div class=\"user-row\">\n      <strong style=\"flex:1\">${u.username}</strong>\n      <span class=\"user-role role-${u.role}\">${u.role}</span>\n      ${u.team_filter ? `<span style=\"font-size:12px;color:var(--muted)\">${u.team_filter}</span>` : ''}\n      ${u.username !== 'admin' ? `<button class=\"btn btn-danger btn-sm\" onclick=\"deleteUser(${u.id})\">Supprimer</button>` : ''}\n    </div>\n  `).join('');\n}\n\nasync function createUser() {\n  const fd = new FormData();\n  fd.append('token', TOKEN);\n  fd.append('username', document.getElementById('nu-user').value);\n  fd.append('password', document.getElementById('nu-pwd').value);\n  fd.append('role', document.getElementById('nu-role').value);\n  fd.append('team_filter', document.getElementById('nu-team').value);\n  const res = await fetch(API + '/api/users', { method:'POST', body:fd });\n  if (res.ok) { loadUsers(); showToast('Utilisateur cr\u00e9\u00e9 \u2713', 'success'); ['nu-user','nu-pwd','nu-team'].forEach(id => document.getElementById(id).value = ''); }\n  else { const d = await res.json(); showToast(d.detail || 'Erreur', 'error'); }\n}\n\nasync function deleteUser(id) {\n  if (!confirm('Supprimer cet utilisateur ?')) return;\n  const res = await fetch(API + '/api/users/' + id + '?token=' + TOKEN, { method:'DELETE' });\n  if (res.ok) { loadUsers(); showToast('Utilisateur supprim\u00e9', 'success'); }\n}\n\n// \u2500\u2500 TOAST \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\nfunction showToast(msg, type = '') {\n  const t = document.getElementById('toast');\n  t.textContent = msg;\n  t.className = 'show ' + type;\n  setTimeout(() => t.className = '', 3000);\n}\n\n// \u2500\u2500 BOOT \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\ncheckExistingSession();\n</script>\n</body>\n</html>\n"

def _html(name: str) -> str:
    if name == "index.html": return _HTML_INDEX
    if name == "admin.html": return _HTML_ADMIN
    raise FileNotFoundError(name)

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
