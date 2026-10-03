import json, os, secrets, sqlite3, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from http.cookies import SimpleCookie
import db, grading

sessions = {}

def rows(query, args=()):
    with db.connect() as cx: return [dict(x) for x in cx.execute(query,args).fetchall()]

def dashboard(user):
    if user['role']=='student':
        s=rows('SELECT s.*,sl.name slot FROM students s JOIN slots sl ON sl.id=s.slot_id WHERE user_id=?',(user['id'],))[0]
        data=[]
        for c in rows('SELECT c.* FROM courses c JOIN enrollments e ON e.course_id=c.id WHERE e.student_id=?',(s['id'],)):
            comps=[]
            for a in rows('SELECT a.*,m.score FROM assessments a LEFT JOIN marks m ON m.assessment_id=a.id AND m.student_id=? WHERE a.course_id=? ORDER BY a.id',(s['id'],c['id'])):
                scores=[x['score'] for x in rows('SELECT m.score FROM marks m JOIN assessments aa ON aa.id=m.assessment_id JOIN students ss ON ss.id=m.student_id WHERE aa.course_id=? AND aa.name=? AND ss.slot_id=?',(c['id'],a['name'],s['slot_id']))]
                avg=grading.calculate_mean(scores); sd=grading.calculate_standard_deviation(scores); z=grading.calculate_z_score(a['score'],avg,sd) if a['score'] is not None else None
                comps.append(dict(name=a['name'],mark=a['score'],mean=round(avg,1) if avg is not None else None,sd=round(sd,2),max_score=a['max_score'],weight=a['weight'],z=round(z,2) if z is not None and abs(z)<1e6 else None,trajectory=grading.get_grade_trajectory(z)))
            data.append(dict(id=c['id'],code=c['code'],name=c['name'],components=comps))
        return {'user':user,'profile':s,'courses':data}
    teacher=rows('SELECT t.id FROM teachers t WHERE user_id=?',(user['id'],))[0]
    return {'user':user,'teacher_id':teacher['id'],'courses':rows('SELECT * FROM courses WHERE teacher_id=?',(teacher['id'],)),'slots':rows('SELECT * FROM slots'),'pending':rows("SELECT sub.*,u.name student,s.reg_no,a.name assessment,c.code FROM submissions sub JOIN students s ON s.id=sub.student_id JOIN users u ON u.id=s.user_id JOIN assessments a ON a.id=sub.assessment_id JOIN courses c ON c.id=a.course_id WHERE sub.status='pending'")}

class Handler(BaseHTTPRequestHandler):
    def send_json(self,obj,status=200):
        data=json.dumps(obj).encode(); self.send_response(status); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)
    def body(self):
        try: return json.loads(self.rfile.read(int(self.headers.get('Content-Length',0))) or b'{}')
        except Exception: return {}
    def user(self):
        cookie=SimpleCookie(self.headers.get('Cookie','')); token=cookie.get('gc_session'); return sessions.get(token.value) if token else None
    def do_GET(self):
        path=urllib.parse.urlparse(self.path).path
        if path=='/api/me':
            u=self.user(); return self.send_json({'user':u})
        if path=='/api/dashboard':
            u=self.user()
            if not u:return self.send_json({'error':'Authentication required'},401)
            if u['role']!='teacher' and path.startswith('/api/teacher'):return self.send_json({'error':'Forbidden'},403)
            return self.send_json(dashboard(u))
        if path=='/api/all-assessments':
            u=self.user()
            if not u or u['role']!='student':return self.send_json({'error':'Forbidden'},403)
            return self.send_json(rows('SELECT a.id,a.name,a.max_score,a.course_id,c.code FROM assessments a JOIN courses c ON c.id=a.course_id ORDER BY a.course_id,a.id'))
        if path=='/api/assessments':
            u=self.user()
            if not u or u['role']!='teacher':return self.send_json({'error':'Forbidden'},403)
            return self.send_json(rows('SELECT id,course_id,name,max_score,weight FROM assessments ORDER BY course_id,id'))
        if path=='/api/peers':
            u=self.user()
            if not u or u['role']!='student':return self.send_json({'error':'Forbidden'},403)
            sid=rows('SELECT id,slot_id FROM students WHERE user_id=?',(u['id'],))[0]
            return self.send_json(rows('SELECT s.id,s.reg_no,u.name,c.id course_id,c.code,c.name course,AVG(m.score/a.max_score) performance FROM students s JOIN users u ON u.id=s.user_id JOIN enrollments e ON e.student_id=s.id JOIN courses c ON c.id=e.course_id JOIN assessments a ON a.course_id=c.id JOIN marks m ON m.assessment_id=a.id AND m.student_id=s.id WHERE s.slot_id=? AND s.id<>? GROUP BY s.id,c.id HAVING performance>=.72 ORDER BY performance DESC LIMIT 12',(sid['slot_id'],sid['id'])))
        if path=='/api/risks':
            u=self.user()
            if not u or u['role']!='teacher':return self.send_json({'error':'Forbidden'},403)
            students=rows('SELECT s.id,s.reg_no,u.name,s.attendance,sl.name slot FROM students s JOIN users u ON u.id=s.user_id JOIN slots sl ON sl.id=s.slot_id')
            observations=rows('SELECT m.student_id,ss.slot_id,a.course_id,a.name assessment,m.score FROM marks m JOIN assessments a ON a.id=m.assessment_id JOIN students ss ON ss.id=m.student_id')
            groups={}
            for item in observations:groups.setdefault((item['slot_id'],item['course_id'],item['assessment']),[]).append(item)
            zs={}
            for group in groups.values():
                scores=[x['score'] for x in group]; avg=grading.calculate_mean(scores); sd=grading.calculate_standard_deviation(scores)
                for item in group: zs.setdefault(item['student_id'],[]).append(grading.calculate_z_score(item['score'],avg,sd))
            result=[]
            for student in students:
                vals=zs.get(student['id'],[]); cumulative=grading.calculate_cumulative_z_score(vals)
                reasons=[]
                if cumulative is not None and cumulative < -1:reasons.append('Below relative average')
                if student['attendance'] < 75:reasons.append('Attendance below threshold')
                if len([v for v in vals if v < -0.75]) >= 2:reasons.append('Multiple weak components')
                if reasons:result.append({**student,'z':round(cumulative,2) if cumulative is not None else None,'reason':', '.join(dict.fromkeys(reasons))})
            return self.send_json(result)
        if path=='/api/roster':
            u=self.user()
            if not u or u['role']!='teacher':return self.send_json({'error':'Forbidden'},403)
            return self.send_json(rows('SELECT s.id,s.reg_no,u.name,s.attendance,sl.name slot FROM students s JOIN users u ON u.id=s.user_id JOIN slots sl ON sl.id=s.slot_id ORDER BY s.reg_no'))
        if path=='/api/marks':
            u=self.user()
            if not u or u['role']!='teacher':return self.send_json({'error':'Forbidden'},403)
            q=urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query); cid=int(q.get('course',['1'])[0]); aid=int(q.get('assessment',['1'])[0]); slot=q.get('slot',['L31+L32'])[0]
            return self.send_json(rows('SELECT s.id,s.reg_no,u.name,m.score FROM students s JOIN users u ON u.id=s.user_id JOIN slots sl ON sl.id=s.slot_id JOIN enrollments e ON e.student_id=s.id LEFT JOIN marks m ON m.student_id=s.id AND m.assessment_id=? WHERE e.course_id=? AND sl.name=? ORDER BY s.reg_no',(aid,cid,slot)))
        if path=='/':
            content=open('index.html',encoding='utf8').read().encode(); self.send_response(200); self.send_header('Content-Type','text/html; charset=utf-8'); self.send_header('Content-Length',str(len(content))); self.end_headers(); return self.wfile.write(content)
        self.send_error(404)
    def do_POST(self):
        path=urllib.parse.urlparse(self.path).path; b=self.body(); u=self.user()
        if path=='/api/login':
            with db.connect() as cx: r=cx.execute('SELECT * FROM users WHERE username=? AND role=?',(str(b.get('username','')).strip(),b.get('role'))).fetchone()
            if not r or not db.verify_password(str(b.get('password','')),r['password_hash']): return self.send_json({'error':'Check your credentials and selected role.'},401)
            user={'id':r['id'],'username':r['username'],'name':r['name'],'role':r['role']}; token=secrets.token_urlsafe(32); sessions[token]=user
            self.send_json({'user':user}); return
        if not u:return self.send_json({'error':'Authentication required'},401)
        if path=='/api/logout':
            ck=SimpleCookie(self.headers.get('Cookie','')); tok=ck.get('gc_session'); sessions.pop(tok.value,None) if tok else None; self.send_json({'ok':True}); return
        if path=='/api/submit-mark' and u['role']=='student':
            try:
                score=float(b['score']); peers=[float(x) for x in b.get('peers',[]) if x!='']
                with db.connect() as cx:
                    s=cx.execute('SELECT id FROM students WHERE user_id=?',(u['id'],)).fetchone(); aid=int(b['assessment_id']); a=cx.execute('SELECT max_score FROM assessments WHERE id=?',(aid,)).fetchone()
                    if not a or not 0<=score<=a['max_score']: return self.send_json({'error':'Mark is outside the assessment range.'},400)
                    outlier=grading.detect_outlier(score,peers); cx.execute('INSERT INTO submissions(student_id,assessment_id,score,peers,status,reason) VALUES(?,?,?,?,?,?)',(s['id'],aid,score,json.dumps(peers),'pending','Pending teacher approval: statistical outlier' if outlier else 'Pending teacher approval: fallback mark'))
                return self.send_json({'ok':True,'message':'Mark sent to the teacher verification queue.'})
            except (ValueError,KeyError,sqlite3.IntegrityError): return self.send_json({'error':'Please check the mark and try again.'},400)
        if u['role']!='teacher':return self.send_json({'error':'Forbidden'},403)
        tid=rows('SELECT id FROM teachers WHERE user_id=?',(u['id'],))[0]['id']
        if path=='/api/batch':
            try:
                with db.connect() as cx:
                    for item in b.get('marks',[]):
                        score=float(item['score']); aid=int(b['assessment_id']); sid=int(item['student_id']); maxv=cx.execute('SELECT max_score FROM assessments WHERE id=?',(aid,)).fetchone()
                        if not maxv or score<0 or score>maxv['max_score']:raise ValueError()
                        cx.execute("INSERT INTO marks(student_id,assessment_id,score) VALUES(?,?,?) ON CONFLICT(student_id,assessment_id) DO UPDATE SET score=excluded.score",(sid,aid,score))
                return self.send_json({'ok':True,'message':'Batch marks saved.'})
            except (ValueError,KeyError): return self.send_json({'error':'One or more marks are invalid.'},400)
        if path=='/api/review':
            sub=int(b.get('submission_id',0)); action=b.get('action')
            if action not in ('approve','reject'):return self.send_json({'error':'Invalid action'},400)
            with db.connect() as cx:
                record=cx.execute('SELECT * FROM submissions WHERE id=? AND status=?',(sub,'pending')).fetchone()
                if not record:return self.send_json({'error':'Submission no longer pending'},404)
                status='approved' if action=='approve' else 'rejected'; cx.execute('UPDATE submissions SET status=?,reviewer_id=? WHERE id=?',(status,tid,sub))
                if action=='approve':cx.execute('INSERT INTO marks(student_id,assessment_id,score,source) VALUES(?,?,? ,?) ON CONFLICT(student_id,assessment_id) DO UPDATE SET score=excluded.score,source=excluded.source',(record['student_id'],record['assessment_id'],record['score'],'approved fallback'))
            return self.send_json({'ok':True,'message':f'Submission {status}.'})
        if path=='/api/alert':
            with db.connect() as cx:cx.execute('INSERT INTO alerts(student_id,teacher_id,message) VALUES(?,?,?)',(int(b['student_id']),tid,str(b.get('message','Guidance check-in'))[:300]))
            return self.send_json({'ok':True,'message':'Guidance alert recorded.'})
        if path=='/api/match' and u['role']=='student':
            with db.connect() as cx:
                sid=cx.execute('SELECT id FROM students WHERE user_id=?',(u['id'],)).fetchone()[0]; peer=int(b['peer_id']); course=int(b['course_id']); cx.execute('INSERT OR IGNORE INTO study_matches(student_id,peer_id,course_id) VALUES(?,?,?)',(sid,peer,course))
            return self.send_json({'ok':True,'message':'Study match request sent.'})
        return self.send_json({'error':'Not found'},404)

# Response helper that adds login/logout cookies before headers is patched here.
_original = Handler.send_json
def _send_json(self,obj,status=200):
    data=json.dumps(obj).encode(); self.send_response(status); path=urllib.parse.urlparse(self.path).path
    if path=='/api/login' and status==200:
        token=next((k for k,v in sessions.items() if v==obj.get('user')),None)
        if token:self.send_header('Set-Cookie',f'gc_session={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200')
    elif path=='/api/logout':self.send_header('Set-Cookie','gc_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax')
    self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)
Handler.send_json=_send_json
if __name__=='__main__':
    db.initialize(); print('GradeCurve running on http://127.0.0.1:8000'); ThreadingHTTPServer(('127.0.0.1',8000),Handler).serve_forever()
