// =============================================================
//  GPT Chintamani ECE Portal — Backend Server
//  Node.js + Express + SQLite (better-sqlite3)
//  Run:  npm install && node server.js
//  Then open: http://localhost:3000
// =============================================================

const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const Database = require('better-sqlite3');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');

const app  = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'ece-portal-secret-2025';

// ── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));   // allow base64 images
app.use(express.static(path.join(__dirname, 'public')));

// ── Database ────────────────────────────────────────────────
// On Railway: use /data for persistent storage
// On Render: use __dirname (resets on redeploy — use Railway for persistence)
const DB_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'ece_portal.db')
    : path.join(__dirname, 'ece_portal.db');
const db = new Database(DB_PATH);
console.log('[ECE] Database path:', DB_PATH);
db.pragma('journal_mode = WAL');   // better concurrent read performance
db.pragma('foreign_keys = ON');

// ── Schema Init ─────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    email        TEXT NOT NULL UNIQUE,
    password     TEXT NOT NULL,
    role         TEXT NOT NULL CHECK(role IN ('admin','teacher','student')),
    name         TEXT NOT NULL,
    phone_number TEXT,
    employee_id  TEXT,
    enrollment   TEXT UNIQUE,
    semester     INTEGER,
    batch        TEXT,
    parent       TEXT,
    address      TEXT,
    is_cr        INTEGER DEFAULT 0,
    subjects     TEXT DEFAULT '[]',
    created_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id           TEXT PRIMARY KEY,
    student_id   TEXT NOT NULL,
    student_name TEXT NOT NULL,
    subject      TEXT NOT NULL,
    date         TEXT NOT NULL,
    time         TEXT,
    status       TEXT NOT NULL,
    semester     INTEGER,
    batch        TEXT,
    teacher_name TEXT,
    created_at   TEXT DEFAULT (datetime('now')),
    UNIQUE(student_id, subject, date)
  );

  CREATE TABLE IF NOT EXISTS marks (
    id           TEXT PRIMARY KEY,
    student_id   TEXT NOT NULL,
    student_name TEXT NOT NULL,
    subject      TEXT NOT NULL,
    semester     INTEGER,
    internal     REAL DEFAULT 0,
    assessment   REAL DEFAULT 0,
    practical    REAL DEFAULT 0,
    percentage   REAL DEFAULT 0,
    created_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    sender_id   TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    sender_role TEXT NOT NULL,
    message     TEXT,
    semester    INTEGER,
    batch       TEXT,
    media_type  TEXT,
    media_data  TEXT,
    file_name   TEXT,
    file_size   TEXT,
    expires_at  TEXT,
    seen_by     TEXT DEFAULT '[]',
    timestamp   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notices (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL,
    priority   TEXT DEFAULT 'medium',
    date       TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    date        TEXT NOT NULL,
    type        TEXT NOT NULL,
    description TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS leave_requests (
    id           TEXT PRIMARY KEY,
    student_id   TEXT NOT NULL,
    student_name TEXT NOT NULL,
    type         TEXT,
    reason       TEXT NOT NULL,
    from_date    TEXT NOT NULL,
    to_date      TEXT NOT NULL,
    status       TEXT DEFAULT 'pending',
    created_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS timetable (
    id       TEXT PRIMARY KEY,
    semester INTEGER NOT NULL,
    batch    TEXT NOT NULL,
    day      TEXT NOT NULL,
    subject  TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time   TEXT NOT NULL,
    teacher  TEXT,
    room     TEXT,
    type     TEXT,
    color    INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS achievements (
    id          TEXT PRIMARY KEY,
    category    TEXT NOT NULL,
    title       TEXT NOT NULL,
    description TEXT,
    student     TEXT NOT NULL,
    semester    TEXT,
    date        TEXT,
    tags        TEXT DEFAULT '[]',
    added_by    TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS project_groups (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    subject     TEXT,
    deadline    TEXT,
    teacher_id  TEXT,
    leader_id   TEXT,
    member_ids  TEXT DEFAULT '[]',
    semester    INTEGER,
    batch       TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS project_posts (
    id          TEXT PRIMARY KEY,
    group_id    TEXT NOT NULL,
    sender_id   TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    sender_role TEXT NOT NULL,
    message     TEXT,
    status      TEXT DEFAULT 'inprogress',
    media_type  TEXT,
    media_data  TEXT,
    file_name   TEXT,
    file_size   TEXT,
    expires_at  TEXT,
    likes       TEXT DEFAULT '[]',
    timestamp   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id              TEXT PRIMARY KEY,
    type            TEXT NOT NULL,
    title           TEXT NOT NULL,
    body            TEXT,
    target_role     TEXT,
    target_user_id  TEXT,
    exclude_id      TEXT,
    target_batch    TEXT,
    target_semester INTEGER,
    read_by         TEXT DEFAULT '[]',
    created_at      TEXT DEFAULT (datetime('now'))
  );
`);

// ── Seed Default Data ────────────────────────────────────────
function seedData() {
  const adminExists = db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get();
  if (adminExists) return;

  console.log('[ECE] Seeding default data...');

  const hash = (p) => bcrypt.hashSync(p, 10);

  const insertUser = db.prepare(`INSERT OR IGNORE INTO users
    (id,email,password,role,name,phone_number,employee_id,enrollment,semester,batch,is_cr,subjects)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);

  insertUser.run('admin1','admin@gpchintamani.edu',       hash('admin123'),  'admin',   'Admin User',        null,         null,     null,          null, null,    0, '[]');
  insertUser.run('admin2','cr2109474@gmail.com',          hash('admin123'),  'admin',   'Admin CR',          null,         null,     null,          null, null,    0, '[]');
  insertUser.run('teacher1','teacher@gpchintamani.edu',   hash('teacher123'),'teacher', 'Prof. Ramesh Kumar','9876543210', 'EMP001', null,          null, null,    0, '["Digital Electronics","Microcontrollers"]');
  insertUser.run('student1','student@gpchintamani.edu',   hash('student123'),'student', 'Rahul Kumar',       '9876543211', null,     '2E24ECE001',  3,    '2024-2027', 1, '[]');
  insertUser.run('student2','priya.ece@gpchintamani.edu', hash('student123'),'student', 'Priya Sharma',      '9876543212', null,     '2E24ECE002',  3,    '2024-2027', 0, '[]');
  insertUser.run('student3','amit.ece@gpchintamani.edu',  hash('student123'),'student', 'Amit Patel',        '9876543213', null,     '2E23ECE015',  4,    '2023-2026', 0, '[]');

  const today = new Date().toISOString().split('T')[0];
  db.prepare(`INSERT OR IGNORE INTO attendance VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    'att1','student1','Rahul Kumar','Digital Electronics',today,'10:30 AM','present',3,'2024-2027','Prof. Ramesh Kumar', today);
  db.prepare(`INSERT OR IGNORE INTO attendance VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    'att2','student1','Rahul Kumar','Microcontrollers','2026-02-10','11:30 AM','absent',3,'2024-2027','Prof. Ramesh Kumar', today);

  db.prepare(`INSERT OR IGNORE INTO marks VALUES (?,?,?,?,?,?,?,?,?,?)`).run('mark1','student1','Rahul Kumar','Digital Electronics',3,18,22,19,78.67,today);
  db.prepare(`INSERT OR IGNORE INTO marks VALUES (?,?,?,?,?,?,?,?,?,?)`).run('mark2','student1','Rahul Kumar','Microcontrollers',3,16,25,21,82.67,today);

  db.prepare(`INSERT OR IGNORE INTO events VALUES (?,?,?,?,?,?)`).run('evt1','Technical Symposium','2026-03-15','program','Annual technical symposium',today);
  db.prepare(`INSERT OR IGNORE INTO events VALUES (?,?,?,?,?,?)`).run('evt2','Mid-Semester Exam','2026-04-01','exam','Mid-semester examination',today);

  db.prepare(`INSERT OR IGNORE INTO notices VALUES (?,?,?,?,?,?)`).run('not1','Semester Fee Payment','Please pay semester fees before March 1st.','high','2026-02-18',today);
  db.prepare(`INSERT OR IGNORE INTO notices VALUES (?,?,?,?,?,?)`).run('not2','Lab Schedule Update','Digital Electronics lab timings changed. New: Monday 2PM–5PM.','medium','2026-02-19',today);

  const tt = [
    ['tt1',3,'2024-2027','Mon','Digital Electronics','09:00','10:00','Prof. Ramesh Kumar','Lab 101','Lecture',0],
    ['tt2',3,'2024-2027','Mon','Microcontrollers','10:00','11:00','Prof. Ramesh Kumar','Lab 102','Lecture',1],
    ['tt3',3,'2024-2027','Mon','Applied Mathematics','11:30','12:30','Prof. Anita Singh','Room 204','Lecture',2],
    ['tt4',3,'2024-2027','Tue','Digital Electronics Lab','09:00','11:00','Prof. Ramesh Kumar','Lab 101','Lab',0],
    ['tt5',3,'2024-2027','Tue','Communication Systems','11:30','12:30','Prof. Vijay Patil','Room 301','Lecture',3],
    ['tt6',3,'2024-2027','Wed','Microcontrollers Lab','09:00','11:00','Prof. Ramesh Kumar','Lab 102','Lab',1],
    ['tt7',3,'2024-2027','Thu','Digital Electronics','09:00','10:00','Prof. Ramesh Kumar','Lab 101','Lecture',0],
    ['tt8',3,'2024-2027','Thu','Communication Systems','10:00','11:00','Prof. Vijay Patil','Room 301','Lecture',3],
    ['tt9',3,'2024-2027','Fri','Microcontrollers','09:00','10:00','Prof. Ramesh Kumar','Lab 102','Lecture',1],
    ['tt10',3,'2024-2027','Fri','Project Work','14:00','16:00','Prof. Ramesh Kumar','Lab 101','Lab',0],
  ];
  const insTT = db.prepare(`INSERT OR IGNORE INTO timetable VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  tt.forEach(r => insTT.run(...r));

  console.log('[ECE] Seed complete.');
}
seedData();

// ── Auth Middleware ──────────────────────────────────────────
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch(e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// ── Helpers ──────────────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ── ROUTES ───────────────────────────────────────────────────

// ---------- AUTH ----------
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  // Support plain passwords (legacy seed) AND bcrypt
  let valid = false;
  if (user.password.startsWith('$2')) {
    valid = bcrypt.compareSync(password, user.password);
  } else {
    valid = password === user.password;
  }
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  const payload = {
    id: user.id, email: user.email, role: user.role, name: user.name,
    semester: user.semester, batch: user.batch, isCR: !!user.is_cr,
    employeeId: user.employee_id, enrollmentNumber: user.enrollment,
    phoneNumber: user.phone_number, subjects: JSON.parse(user.subjects || '[]')
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: payload });
});

// ---------- USERS ----------
app.get('/api/users', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM users').all();
  res.json(rows.map(u => ({
    id: u.id, email: u.email, role: u.role, name: u.name,
    phoneNumber: u.phone_number, employeeId: u.employee_id,
    enrollmentNumber: u.enrollment, semester: u.semester, batch: u.batch,
    isCR: !!u.is_cr, subjects: JSON.parse(u.subjects || '[]'),
    parentContact: u.parent, address: u.address
  })));
});

app.post('/api/users', auth, adminOnly, (req, res) => {
  const u = req.body;
  const id = u.id || (u.role + uid());
  const hashed = u.password ? bcrypt.hashSync(u.password, 10) : '';
  db.prepare(`INSERT INTO users (id,email,password,role,name,phone_number,employee_id,enrollment,semester,batch,is_cr,subjects,parent,address)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, u.email, hashed, u.role, u.name,
    u.phoneNumber||null, u.employeeId||null, u.enrollmentNumber||null,
    u.semester||null, u.batch||null, u.isCR?1:0,
    JSON.stringify(u.subjects||[]), u.parentContact||null, u.address||null
  );
  res.json({ id, success: true });
});

app.put('/api/users/:id', auth, adminOnly, (req, res) => {
  const u = req.body;
  const sets = ['name=?','email=?','phone_number=?','employee_id=?','enrollment=?',
                'semester=?','batch=?','is_cr=?','subjects=?','parent=?','address=?'];
  const vals = [u.name, u.email, u.phoneNumber||null, u.employeeId||null,
                u.enrollmentNumber||null, u.semester||null, u.batch||null,
                u.isCR?1:0, JSON.stringify(u.subjects||[]),
                u.parentContact||null, u.address||null, req.params.id];
  if (u.password) { sets.push('password=?'); vals.splice(vals.length-1,0, bcrypt.hashSync(u.password,10)); }
  db.prepare(`UPDATE users SET ${sets.join(',')} WHERE id=?`).run(...vals);
  res.json({ success: true });
});

app.delete('/api/users/:id', auth, adminOnly, (req, res) => {
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ---------- ATTENDANCE ----------
app.get('/api/attendance', auth, (req, res) => {
  let rows;
  if (req.user.role === 'student') {
    rows = db.prepare('SELECT * FROM attendance WHERE student_id=? ORDER BY date DESC').all(req.user.id);
  } else if (req.query.batch && req.query.semester) {
    rows = db.prepare('SELECT * FROM attendance WHERE batch=? AND semester=? ORDER BY date DESC').all(req.query.batch, req.query.semester);
  } else {
    rows = db.prepare('SELECT * FROM attendance ORDER BY date DESC').all();
  }
  res.json(rows);
});

app.post('/api/attendance', auth, (req, res) => {
  const a = req.body;
  const id = a.id || 'att' + uid();
  db.prepare(`INSERT OR REPLACE INTO attendance (id,student_id,student_name,subject,date,time,status,semester,batch,teacher_name)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, a.studentId, a.studentName, a.subject, a.date, a.time, a.status, a.semester, a.batch, a.teacherName||null);
  res.json({ id, success: true });
});

app.delete('/api/attendance/:id', auth, adminOnly, (req, res) => {
  db.prepare('DELETE FROM attendance WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ---------- MARKS ----------
app.get('/api/marks', auth, (req, res) => {
  let rows;
  if (req.user.role === 'student') {
    rows = db.prepare('SELECT * FROM marks WHERE student_id=?').all(req.user.id);
  } else {
    rows = db.prepare('SELECT * FROM marks').all();
  }
  res.json(rows.map(m => ({...m, total: (m.internal||0)+(m.assessment||0)+(m.practical||0)})));
});

app.post('/api/marks', auth, (req, res) => {
  const m = req.body;
  const id = m.id || 'mark' + uid();
  db.prepare(`INSERT OR REPLACE INTO marks (id,student_id,student_name,subject,semester,internal,assessment,practical,percentage)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(id, m.studentId, m.studentName, m.subject, m.semester, m.internal||0, m.assessment||0, m.practical||0, m.percentage||0);
  res.json({ id, success: true });
});

app.put('/api/marks/:id', auth, (req, res) => {
  const m = req.body;
  db.prepare(`UPDATE marks SET internal=?,assessment=?,practical=?,percentage=? WHERE id=?`)
    .run(m.internal||0, m.assessment||0, m.practical||0, m.percentage||0, req.params.id);
  res.json({ success: true });
});

app.delete('/api/marks/:id', auth, adminOnly, (req, res) => {
  db.prepare('DELETE FROM marks WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ---------- MESSAGES ----------
app.get('/api/messages', auth, (req, res) => {
  const { batch, semester } = req.query;
  const rows = db.prepare('SELECT * FROM messages WHERE batch=? AND semester=? ORDER BY timestamp ASC')
    .all(batch, semester);
  res.json(rows.map(m => ({...m, seenBy: JSON.parse(m.seen_by||'[]')})));
});

app.post('/api/messages', auth, (req, res) => {
  const m = req.body;
  const id = 'msg' + uid();
  const expiresAt = m.mediaType ? new Date(Date.now() + 5*60*60*1000).toISOString() : null;
  db.prepare(`INSERT INTO messages (id,sender_id,sender_name,sender_role,message,semester,batch,media_type,media_data,file_name,file_size,expires_at,seen_by,timestamp)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, req.user.id, req.user.name, req.user.role,
    m.message||null, m.semester, m.batch,
    m.mediaType||null, m.mediaData||null, m.fileName||null, m.fileSize||null,
    expiresAt, JSON.stringify([req.user.id]),
    new Date().toISOString()
  );
  res.json({ id, success: true });
});

app.put('/api/messages/:id/seen', auth, (req, res) => {
  const msg = db.prepare('SELECT seen_by FROM messages WHERE id=?').get(req.params.id);
  if (!msg) return res.status(404).json({ error: 'Not found' });
  const seen = JSON.parse(msg.seen_by || '[]');
  if (!seen.includes(req.user.id)) seen.push(req.user.id);
  db.prepare('UPDATE messages SET seen_by=? WHERE id=?').run(JSON.stringify(seen), req.params.id);
  res.json({ success: true });
});

app.put('/api/messages/seen-batch', auth, (req, res) => {
  const { batch, semester } = req.body;
  const msgs = db.prepare('SELECT id, seen_by FROM messages WHERE batch=? AND semester=?').all(batch, semester);
  const upd = db.prepare('UPDATE messages SET seen_by=? WHERE id=?');
  msgs.forEach(m => {
    const seen = JSON.parse(m.seen_by || '[]');
    if (!seen.includes(req.user.id)) { seen.push(req.user.id); upd.run(JSON.stringify(seen), m.id); }
  });
  res.json({ success: true });
});

// ---------- NOTICES ----------
app.get('/api/notices', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM notices ORDER BY created_at DESC').all());
});

app.post('/api/notices', auth, adminOnly, (req, res) => {
  const n = req.body;
  const id = 'not' + uid();
  db.prepare('INSERT INTO notices (id,title,content,priority,date) VALUES (?,?,?,?,?)').run(id, n.title, n.content, n.priority||'medium', n.date||new Date().toISOString().split('T')[0]);
  res.json({ id, success: true });
});

app.delete('/api/notices/:id', auth, adminOnly, (req, res) => {
  db.prepare('DELETE FROM notices WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ---------- EVENTS ----------
app.get('/api/events', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM events ORDER BY date ASC').all());
});

app.post('/api/events', auth, adminOnly, (req, res) => {
  const e = req.body;
  const id = 'evt' + uid();
  db.prepare('INSERT INTO events (id,title,date,type,description) VALUES (?,?,?,?,?)').run(id, e.title, e.date, e.type, e.description||null);
  res.json({ id, success: true });
});

app.delete('/api/events/:id', auth, adminOnly, (req, res) => {
  db.prepare('DELETE FROM events WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ---------- LEAVE ----------
app.get('/api/leave', auth, (req, res) => {
  let rows;
  if (req.user.role === 'student') {
    rows = db.prepare('SELECT * FROM leave_requests WHERE student_id=? ORDER BY created_at DESC').all(req.user.id);
  } else {
    rows = db.prepare('SELECT * FROM leave_requests ORDER BY created_at DESC').all();
  }
  res.json(rows);
});

app.post('/api/leave', auth, (req, res) => {
  const l = req.body;
  const id = 'lv' + uid();
  db.prepare('INSERT INTO leave_requests (id,student_id,student_name,type,reason,from_date,to_date) VALUES (?,?,?,?,?,?,?)')
    .run(id, req.user.id, req.user.name, l.type||null, l.reason, l.fromDate, l.toDate);
  res.json({ id, success: true });
});

app.put('/api/leave/:id', auth, (req, res) => {
  db.prepare('UPDATE leave_requests SET status=? WHERE id=?').run(req.body.status, req.params.id);
  res.json({ success: true });
});

// ---------- TIMETABLE ----------
app.get('/api/timetable', auth, (req, res) => {
  const { batch, semester } = req.query;
  const rows = batch && semester
    ? db.prepare('SELECT * FROM timetable WHERE batch=? AND semester=? ORDER BY day, start_time').all(batch, semester)
    : db.prepare('SELECT * FROM timetable ORDER BY semester, day, start_time').all();
  res.json(rows.map(r => ({...r, startTime: r.start_time, endTime: r.end_time})));
});

app.post('/api/timetable', auth, (req, res) => {
  const t = req.body;
  const id = t.id || 'tt' + uid();
  db.prepare('INSERT OR REPLACE INTO timetable (id,semester,batch,day,subject,start_time,end_time,teacher,room,type,color) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, t.semester, t.batch, t.day, t.subject, t.start||t.startTime, t.end||t.endTime, t.teacher||null, t.room||null, t.type||'Lecture', t.color||0);
  res.json({ id, success: true });
});

app.delete('/api/timetable/:id', auth, (req, res) => {
  db.prepare('DELETE FROM timetable WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ---------- ACHIEVEMENTS ----------
app.get('/api/achievements', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM achievements ORDER BY created_at DESC').all()
    .map(a => ({...a, tags: JSON.parse(a.tags||'[]')})));
});

app.post('/api/achievements', auth, (req, res) => {
  const a = req.body;
  const id = 'ach' + uid();
  db.prepare('INSERT INTO achievements (id,category,title,description,student,semester,date,tags,added_by) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, a.category, a.title, a.description||null, a.student, a.semester||null, a.date||null, JSON.stringify(a.tags||[]), req.user.id);
  res.json({ id, success: true });
});

app.delete('/api/achievements/:id', auth, (req, res) => {
  db.prepare('DELETE FROM achievements WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ---------- PROJECT GROUPS ----------
app.get('/api/project-groups', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM project_groups ORDER BY created_at DESC').all()
    .map(g => ({...g, memberIds: JSON.parse(g.member_ids||'[]'), teacherId: g.teacher_id, leaderId: g.leader_id}));
  res.json(rows);
});

app.post('/api/project-groups', auth, (req, res) => {
  const g = req.body;
  const id = 'pg' + uid();
  db.prepare('INSERT INTO project_groups (id,name,description,subject,deadline,teacher_id,leader_id,member_ids,semester,batch) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(id, g.name, g.description||null, g.subject||null, g.deadline||null, g.teacherId||null, g.leaderId||req.user.id, JSON.stringify(g.memberIds||[req.user.id]), g.semester||null, g.batch||null);
  res.json({ id, success: true });
});

app.put('/api/project-groups/:id', auth, (req, res) => {
  const g = req.body;
  db.prepare('UPDATE project_groups SET name=?,description=?,subject=?,deadline=?,leader_id=?,member_ids=? WHERE id=?')
    .run(g.name, g.description||null, g.subject||null, g.deadline||null, g.leaderId||null, JSON.stringify(g.memberIds||[]), req.params.id);
  res.json({ success: true });
});

// ---------- PROJECT POSTS ----------
app.get('/api/project-posts', auth, (req, res) => {
  const { groupId } = req.query;
  const rows = groupId
    ? db.prepare('SELECT * FROM project_posts WHERE group_id=? ORDER BY timestamp ASC').all(groupId)
    : db.prepare('SELECT * FROM project_posts ORDER BY timestamp ASC').all();
  res.json(rows.map(p => ({...p, groupId: p.group_id, senderId: p.sender_id, senderName: p.sender_name, senderRole: p.sender_role, mediaType: p.media_type, mediaData: p.media_data, fileName: p.file_name, fileSize: p.file_size, expiresAt: p.expires_at, likes: JSON.parse(p.likes||'[]')})));
});

app.post('/api/project-posts', auth, (req, res) => {
  const p = req.body;
  const id = 'pp' + uid();
  const expiresAt = p.mediaType ? new Date(Date.now() + 5*60*60*1000).toISOString() : null;
  db.prepare('INSERT INTO project_posts (id,group_id,sender_id,sender_name,sender_role,message,status,media_type,media_data,file_name,file_size,expires_at,likes,timestamp) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, p.groupId, req.user.id, req.user.name, req.user.role, p.message||null, p.status||'inprogress', p.mediaType||null, p.mediaData||null, p.fileName||null, p.fileSize||null, expiresAt, '[]', new Date().toISOString());
  res.json({ id, success: true });
});

app.put('/api/project-posts/:id/like', auth, (req, res) => {
  const post = db.prepare('SELECT likes FROM project_posts WHERE id=?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  let likes = JSON.parse(post.likes || '[]');
  likes = likes.includes(req.user.id) ? likes.filter(l => l !== req.user.id) : [...likes, req.user.id];
  db.prepare('UPDATE project_posts SET likes=? WHERE id=?').run(JSON.stringify(likes), req.params.id);
  res.json({ likes, success: true });
});

// ---------- NOTIFICATIONS ----------
app.get('/api/notifications', auth, (req, res) => {
  const rows = db.prepare(`SELECT * FROM notifications 
    WHERE (target_user_id IS NULL OR target_user_id=?)
    AND (target_role IS NULL OR target_role=?)
    AND (exclude_id IS NULL OR exclude_id!=?)
    ORDER BY created_at DESC LIMIT 60`).all(req.user.id, req.user.role, req.user.id);
  res.json(rows.map(n => ({...n, readBy: JSON.parse(n.read_by||'[]'), isRead: JSON.parse(n.read_by||'[]').includes(req.user.id)})));
});

app.post('/api/notifications', auth, (req, res) => {
  const n = req.body;
  const id = 'notif' + uid();
  db.prepare('INSERT INTO notifications (id,type,title,body,target_role,target_user_id,exclude_id,target_batch,target_semester) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, n.type, n.title, n.body||null, n.targetRole||null, n.targetUserId||null, n.excludeId||null, n.targetBatch||null, n.targetSemester||null);
  res.json({ id, success: true });
});

app.put('/api/notifications/:id/read', auth, (req, res) => {
  const n = db.prepare('SELECT read_by FROM notifications WHERE id=?').get(req.params.id);
  if (!n) return res.status(404).json({ error: 'Not found' });
  const rb = JSON.parse(n.read_by || '[]');
  if (!rb.includes(req.user.id)) rb.push(req.user.id);
  db.prepare('UPDATE notifications SET read_by=? WHERE id=?').run(JSON.stringify(rb), req.params.id);
  res.json({ success: true });
});

app.put('/api/notifications/read-all', auth, (req, res) => {
  const rows = db.prepare('SELECT id, read_by FROM notifications').all();
  const upd = db.prepare('UPDATE notifications SET read_by=? WHERE id=?');
  rows.forEach(n => {
    const rb = JSON.parse(n.read_by || '[]');
    if (!rb.includes(req.user.id)) { rb.push(req.user.id); upd.run(JSON.stringify(rb), n.id); }
  });
  res.json({ success: true });
});

// ---------- HEALTH CHECK ----------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), version: '2.0' });
});

// ---------- SERVE FRONTEND ----------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, HOST, () => {
  console.log(`\n🎓 ECE Portal Backend running at:`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://YOUR_IP:${PORT}  ← use this on other phones\n`);
});
