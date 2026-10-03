import hashlib, hmac, os, secrets, sqlite3
from pathlib import Path

DB_PATH = Path(__file__).with_name('gradecurve.db')

def connect():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    return db

def hash_password(password, salt=None):
    salt = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 260000)
    return salt.hex() + '$' + digest.hex()

def verify_password(password, stored):
    try:
        salt, digest = stored.split('$', 1)
        return hmac.compare_digest(hash_password(password, bytes.fromhex(salt)).split('$',1)[1], digest)
    except (ValueError, TypeError):
        return False

def initialize():
    with connect() as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('student','teacher')), password_hash TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS students(id INTEGER PRIMARY KEY, user_id INTEGER UNIQUE REFERENCES users(id), reg_no TEXT UNIQUE NOT NULL, slot_id INTEGER REFERENCES slots(id), attendance REAL NOT NULL DEFAULT 90);
        CREATE TABLE IF NOT EXISTS teachers(id INTEGER PRIMARY KEY, user_id INTEGER UNIQUE REFERENCES users(id));
        CREATE TABLE IF NOT EXISTS courses(id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, teacher_id INTEGER REFERENCES teachers(id));
        CREATE TABLE IF NOT EXISTS slots(id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL, teacher_id INTEGER REFERENCES teachers(id));
        CREATE TABLE IF NOT EXISTS enrollments(student_id INTEGER REFERENCES students(id), course_id INTEGER REFERENCES courses(id), PRIMARY KEY(student_id,course_id));
        CREATE TABLE IF NOT EXISTS assessments(id INTEGER PRIMARY KEY, course_id INTEGER REFERENCES courses(id), name TEXT NOT NULL, max_score REAL NOT NULL, weight REAL NOT NULL, UNIQUE(course_id,name));
        CREATE TABLE IF NOT EXISTS marks(id INTEGER PRIMARY KEY, student_id INTEGER REFERENCES students(id), assessment_id INTEGER REFERENCES assessments(id), score REAL NOT NULL, source TEXT NOT NULL DEFAULT 'official', UNIQUE(student_id,assessment_id));
        CREATE TABLE IF NOT EXISTS submissions(id INTEGER PRIMARY KEY, student_id INTEGER REFERENCES students(id), assessment_id INTEGER REFERENCES assessments(id), score REAL NOT NULL, peers TEXT NOT NULL, status TEXT NOT NULL, reason TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, reviewer_id INTEGER REFERENCES teachers(id), UNIQUE(student_id,assessment_id,status));
        CREATE TABLE IF NOT EXISTS study_matches(id INTEGER PRIMARY KEY, student_id INTEGER REFERENCES students(id), peer_id INTEGER REFERENCES students(id), course_id INTEGER REFERENCES courses(id), status TEXT DEFAULT 'requested', UNIQUE(student_id,peer_id,course_id));
        CREATE TABLE IF NOT EXISTS alerts(id INTEGER PRIMARY KEY, student_id INTEGER REFERENCES students(id), teacher_id INTEGER REFERENCES teachers(id), message TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
        ''')
        if db.execute('SELECT COUNT(*) FROM users').fetchone()[0]: return
        demo_password = os.environ.get('DEMO_PASSWORD')
        if not demo_password:
            raise RuntimeError('Set DEMO_PASSWORD in the environment before initializing demo accounts.')
        password = hash_password(demo_password)
        teacher_users = []
        for username, name in [('dr.sharma@gradecurve.demo','Dr. Sharma'),('ananya@gradecurve.demo','Prof. Ananya')]:
            cursor = db.execute('INSERT INTO users(username,name,role,password_hash) VALUES(?,?,?,?)',(username,name,'teacher',password)); teacher_users.append(db.execute('INSERT INTO teachers(user_id) VALUES(?)',(cursor.lastrowid,)).lastrowid)
        for code,name,t in [('CSE1004','Network Essentials',teacher_users[0]),('CSE1007','DBMS',teacher_users[1])]: db.execute('INSERT INTO courses(code,name,teacher_id) VALUES(?,?,?)',(code,name,t))
        for i,slot in enumerate(['L31+L32','A1','B2']): db.execute('INSERT INTO slots(name,teacher_id) VALUES(?,?)',(slot,teacher_users[i%2]))
        courses = db.execute('SELECT id FROM courses ORDER BY id').fetchall()
        assessments = {}
        for c in courses:
            for name,max_score,weight in [('CAT-1',50,.15),('CAT-2',50,.15),('DA1',20,.10),('FAT',100,.60)]:
                assessments[(c['id'],name)] = db.execute('INSERT INTO assessments(course_id,name,max_score,weight) VALUES(?,?,?,?)',(c['id'],name,max_score,weight)).lastrowid
        for i in range(45):
            reg=f'24BCE{i+1:04d}'; name=['Sarvesh','Priya','Aarav','Ananya','Kabir','Isha','Rohan','Mira','Dev','Zoya'][i%10]+f' {chr(65+i%26)}'
            username=reg if i else reg
            cur=db.execute('INSERT INTO users(username,name,role,password_hash) VALUES(?,?,?,?)',(username,name,'student',password))
            slot_id=db.execute('SELECT id FROM slots ORDER BY id LIMIT 1 OFFSET ?',(i//15,)).fetchone()[0]
            student_id=db.execute('INSERT INTO students(user_id,reg_no,slot_id,attendance) VALUES(?,?,?,?)',(cur.lastrowid,reg,slot_id,62 if i in [4,16,36] else 78+(i*7)%23)).lastrowid
            for c in courses:
                db.execute('INSERT INTO enrollments VALUES(?,?)',(student_id,c['id']))
                for j,assess in enumerate(['CAT-1','CAT-2','DA1']):
                    maximum=[50,50,20][j]; score=round(maximum*(.36+((i*11+c['id']*7+j*13)%59)/100),1)
                    db.execute('INSERT INTO marks(student_id,assessment_id,score) VALUES(?,?,?)',(student_id,assessments[(c['id'],assess)],score))
                if i%8!=0:
                    score=round(35+((i*17+c['id']*9)%65),1)
                    db.execute('INSERT INTO marks(student_id,assessment_id,score) VALUES(?,?,?)',(student_id,assessments[(c['id'],'FAT')],score))
        # Demo fallback submissions awaiting review
        for i in (2,8,22):
            sid=db.execute('SELECT id FROM students WHERE reg_no=?',(f'24BCE{i+1:04d}',)).fetchone()[0]
            aid=assessments[(courses[0]['id'],'FAT')]
            db.execute("INSERT OR IGNORE INTO submissions(student_id,assessment_id,score,peers,status,reason) VALUES(?,?,?,?,?,?)",(sid,aid,71+i,'[64,68,73,77]','pending','Student reported fallback mark'))
