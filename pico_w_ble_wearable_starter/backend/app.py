from datetime import datetime, timezone
from pathlib import Path
import json, sqlite3
from typing import Optional
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

DB = Path(__file__).with_name('wearable_demo.sqlite3')
DEMO_TOKEN = 'dev-only-change-me'  # local demo only; replace with real auth before deployment
app = FastAPI(title='PicoHealth Demo API', version='0.1.0', description='Development-only API; do not store real patient data.')

def db():
    c=sqlite3.connect(DB); c.row_factory=sqlite3.Row; return c

def now(): return datetime.now(timezone.utc).isoformat()

def init():
    with db() as c:
        c.executescript('''
        CREATE TABLE IF NOT EXISTS patients(id INTEGER PRIMARY KEY, display_name TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS measurements(id INTEGER PRIMARY KEY, patient_id INTEGER NOT NULL, device_id TEXT NOT NULL, recorded_at TEXT NOT NULL, uptime_ms INTEGER, sensor_flags INTEGER NOT NULL, temperature_c REAL, red_raw INTEGER, ir_raw INTEGER, accel_json TEXT, gyro_json TEXT, optical_samples INTEGER);
        CREATE TABLE IF NOT EXISTS alerts(id INTEGER PRIMARY KEY, patient_id INTEGER NOT NULL, created_at TEXT NOT NULL, severity TEXT NOT NULL, code TEXT NOT NULL, message TEXT NOT NULL, acknowledged INTEGER NOT NULL DEFAULT 0);
        ''')
        if not c.execute('SELECT COUNT(*) FROM patients').fetchone()[0]:
            c.execute('INSERT INTO patients(display_name,created_at) VALUES(?,?)',('Demo Patient',now()))
init()

class Measurement(BaseModel):
    patient_id:int=1
    device_id:str=Field(default='PicoHealth-DEV',max_length=80)
    uptime_ms:Optional[int]=None
    sensor_flags:int=0
    temperature_c:Optional[float]=None
    red_raw:Optional[int]=None
    ir_raw:Optional[int]=None
    accel_g:Optional[list[float]]=None
    gyro_dps:Optional[list[float]]=None
    optical_samples:int=0
class Alert(BaseModel):
    patient_id:int=1
    severity:str=Field(default='warning',max_length=20)
    code:str=Field(max_length=80)
    message:str=Field(max_length=500)

def auth(value):
    if value != 'Bearer '+DEMO_TOKEN: raise HTTPException(401,'Invalid demo token')

@app.get('/')
def root(): return {'service':'PicoHealth Demo API','warning':'development only'}
@app.get('/health')
def health(): return {'ok':True}
@app.get('/patients')
def patients(authorization:Optional[str]=Header(default=None)):
    auth(authorization)
    with db() as c: return [dict(r) for r in c.execute('SELECT * FROM patients ORDER BY id').fetchall()]
@app.post('/measurements')
def save_measurement(m:Measurement,authorization:Optional[str]=Header(default=None)):
    auth(authorization)
    with db() as c:
        if not c.execute('SELECT id FROM patients WHERE id=?',(m.patient_id,)).fetchone(): raise HTTPException(404,'Patient not found')
        cur=c.execute('''INSERT INTO measurements(patient_id,device_id,recorded_at,uptime_ms,sensor_flags,temperature_c,red_raw,ir_raw,accel_json,gyro_json,optical_samples) VALUES(?,?,?,?,?,?,?,?,?,?,?)''',
          (m.patient_id,m.device_id,now(),m.uptime_ms,m.sensor_flags,m.temperature_c,m.red_raw,m.ir_raw,json.dumps(m.accel_g),json.dumps(m.gyro_dps),m.optical_samples))
        return {'id':cur.lastrowid,'saved':True}
@app.get('/patients/{patient_id}/measurements')
def measurements(patient_id:int,limit:int=100,authorization:Optional[str]=Header(default=None)):
    auth(authorization); limit=max(1,min(limit,1000))
    with db() as c:
        rows=c.execute('SELECT * FROM measurements WHERE patient_id=? ORDER BY id DESC LIMIT ?',(patient_id,limit)).fetchall()
        out=[]
        for row in rows:
            x=dict(row); x['accel_g']=json.loads(x.pop('accel_json') or 'null'); x['gyro_dps']=json.loads(x.pop('gyro_json') or 'null'); out.append(x)
        return out
@app.post('/alerts')
def add_alert(a:Alert,authorization:Optional[str]=Header(default=None)):
    auth(authorization)
    with db() as c:
        cur=c.execute('INSERT INTO alerts(patient_id,created_at,severity,code,message) VALUES(?,?,?,?,?)',(a.patient_id,now(),a.severity,a.code,a.message))
        return {'id':cur.lastrowid,'created':True}
@app.get('/alerts')
def alerts(patient_id:int=1,authorization:Optional[str]=Header(default=None)):
    auth(authorization)
    with db() as c: return [dict(r) for r in c.execute('SELECT * FROM alerts WHERE patient_id=? ORDER BY id DESC LIMIT 200',(patient_id,)).fetchall()]
@app.post('/alerts/{alert_id}/acknowledge')
def acknowledge(alert_id:int,authorization:Optional[str]=Header(default=None)):
    auth(authorization)
    with db() as c:
        cur=c.execute('UPDATE alerts SET acknowledged=1 WHERE id=?',(alert_id,))
        if not cur.rowcount: raise HTTPException(404,'Alert not found')
    return {'acknowledged':True}
@app.get('/portal',response_class=HTMLResponse)
def portal():
    with db() as c:
        ps=c.execute('SELECT * FROM patients ORDER BY id').fetchall(); html=''
        for p in ps:
            m=c.execute('SELECT * FROM measurements WHERE patient_id=? ORDER BY id DESC LIMIT 1',(p['id'],)).fetchone()
            aa=c.execute('SELECT * FROM alerts WHERE patient_id=? AND acknowledged=0 ORDER BY id DESC LIMIT 10',(p['id'],)).fetchall()
            temp='Unavailable' if not m or m['temperature_c'] is None else f"{m['temperature_c']:.2f} °C"
            optical='Unavailable' if not m or m['red_raw'] is None else f"red={m['red_raw']} / IR={m['ir_raw']} (raw)"
            alerts_html=''.join(f"<li><b>{a['severity']}</b>: {a['message']} — {a['created_at']}</li>" for a in aa) or '<li>No open demo alerts</li>'
            html+=f"<section><h2>{p['display_name']} (ID {p['id']})</h2><p>Latest: {m['recorded_at'] if m else 'No measurements'}</p><p>Temperature: {temp}</p><p>Optical: {optical}</p><h3>Unacknowledged alerts</h3><ul>{alerts_html}</ul></section>"
    return HTMLResponse(f'''<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>PicoHealth Doctor Portal Demo</title><style>body{{font:16px system-ui;max-width:900px;margin:2rem auto;padding:0 1rem;background:#f4f6fa;color:#172033}}section{{background:white;border:1px solid #ddd;border-radius:12px;padding:1rem;margin:1rem 0}}.warn{{background:#fff0cf;padding:1rem;border-radius:8px}}</style></head><body><h1>PicoHealth — Doctor Portal Demo</h1><p class="warn"><b>Development only:</b> no clinician login or role authorization. Never expose publicly or enter real patient data.</p>{html}<p><a href="/docs">API docs</a></p></body></html>''')
