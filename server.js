const http=require('http'), fs=require('fs'), path=require('path'), crypto=require('crypto'), url=require('url');
const {Pool}=require('pg');
const ROOT=__dirname, PUBLIC=path.join(ROOT,'public'), DBFILE=path.join(ROOT,'data.json');
const PORT=process.env.PORT||10000;
const seed={users:[],jobs:[],applications:[],messages:[],saved:[],sessions:[],audit:[]};
const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL.includes('localhost')?false:{rejectUnauthorized:false},max:5}):null;
async function load(){
 if(!pool){try{return JSON.parse(fs.readFileSync(DBFILE,'utf8'))}catch(e){fs.writeFileSync(DBFILE,JSON.stringify(seed,null,2));return JSON.parse(JSON.stringify(seed))}}
 await pool.query(`CREATE TABLE IF NOT EXISTS enginex_state (id integer PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
 const r=await pool.query('SELECT data FROM enginex_state WHERE id=1');
 if(r.rowCount)return r.rows[0].data;
 const d=JSON.parse(JSON.stringify(seed)); await pool.query('INSERT INTO enginex_state(id,data) VALUES(1,$1)',[d]); return d;
}
let db=null;
async function save(){
 if(pool){await pool.query('UPDATE enginex_state SET data=$1, updated_at=now() WHERE id=1',[db]);}
 else fs.writeFileSync(DBFILE,JSON.stringify(db,null,2));
}
const sha=s=>crypto.createHash('sha256').update('ENGINEX|'+s).digest('hex');
const id=p=>p+'_'+crypto.randomBytes(6).toString('hex'); const now=()=>Date.now();
async function seedAdmin(){
 const email=(process.env.ADMIN_EMAIL||'admin@enginex.com').trim().toLowerCase();
 const password=process.env.ADMIN_PASSWORD||'Admin@123';
 if(!db.users.find(u=>u.email===email)){db.users.push({id:id('u'),name:'ENGINEX Administrator',email,pass:sha(password),role:'admin',status:'active',created:now()});await save();}
}

function send(res,code,data,headers={}){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data))}
function readBody(req){return new Promise((resolve,reject)=>{let b='';req.on('data',c=>{b+=c;if(b.length>2e6)req.destroy()});req.on('end',()=>{try{resolve(b?JSON.parse(b):{})}catch(e){reject(e)}})})}
function auth(req){const token=(req.headers.authorization||'').replace(/^Bearer\s+/,'');return db.sessions.find(s=>s.token===token&&s.expires>now())?.userId}
function user(req){const uid=auth(req);return db.users.find(u=>u.id===uid)}
function safeUser(u){if(!u)return null;const {pass,...x}=u;return x}
function requireUser(req,res,roles){const u=user(req);if(!u){send(res,401,{error:'Authentication required'});return null}if(roles&&!roles.includes(u.role)){send(res,403,{error:'Administrator permission required'});return null}return u}
function log(u,action,entity,entityId){db.audit.unshift({id:id('log'),userId:u?.id||null,action,entity,entityId,t:now()});db.audit=db.audit.slice(0,3000)}
function validateJob(d){if(!d.title||d.title.trim().length<5) return 'Job title is required.';if(!d.description||d.description.trim().length<30)return 'Description must be at least 30 characters.';if(!d.discipline)return 'Engineering discipline is required.';if(!d.location)return 'Location is required.';return null}
function listing(j){return {...j,owner:db.users.find(u=>u.id===j.ownerId)?.name||'Employer',ownerId:undefined}}
function route(req,res){const p=url.parse(req.url,true), pathname=p.pathname, method=req.method;
 if(method==='GET'&&pathname==='/api/health')return send(res,200,{ok:true,version:'2.0'});
 if(pathname==='/api/register'&&method==='POST')return readBody(req).then(d=>{if(!d.email||!d.password||!d.name)return send(res,400,{error:'Name, email and password are required.'});const email=d.email.trim().toLowerCase();if(db.users.some(u=>u.email===email))return send(res,409,{error:'Email already registered.'});const u={id:id('u'),name:d.name.trim(),email,pass:sha(d.password),role:d.role==='employer'?'employer':'engineer',status:'active',company:d.company||'',discipline:d.discipline||'',city:d.city||'Riyadh',bio:d.bio||'',created:now()};db.users.push(u);log(u,'REGISTER','user',u.id);save();return send(res,201,{user:safeUser(u)})}).catch(()=>send(res,400,{error:'Invalid request'}));
 if(pathname==='/api/login'&&method==='POST')return readBody(req).then(d=>{const u=db.users.find(x=>x.email===String(d.email||'').trim().toLowerCase());if(!u||u.pass!==sha(d.password||''))return send(res,401,{error:'Invalid email or password.'});if(u.status!=='active')return send(res,403,{error:'Account is not active.'});const token=crypto.randomBytes(32).toString('hex');db.sessions=db.sessions.filter(s=>s.expires>now());db.sessions.push({token,userId:u.id,expires:now()+7*864e5});save();return send(res,200,{token,user:safeUser(u)})}).catch(()=>send(res,400,{error:'Invalid request'}));
 if(pathname==='/api/logout'&&method==='POST'){const t=(req.headers.authorization||'').replace(/^Bearer\s+/,'');db.sessions=db.sessions.filter(s=>s.token!==t);save();return send(res,200,{ok:true})}
 if(pathname==='/api/me'&&method==='GET'){const u=requireUser(req,res);if(!u)return;return send(res,200,{user:safeUser(u)})}
 if(pathname==='/api/jobs'&&method==='GET'){let a=db.jobs.filter(j=>j.status==='published'&&(!p.query.q||[j.title,j.description,j.discipline,j.location,j.skills.join(' ')].join(' ').toLowerCase().includes(p.query.q.toLowerCase())));if(p.query.discipline)a=a.filter(j=>j.discipline===p.query.discipline);if(p.query.city)a=a.filter(j=>j.location.toLowerCase().includes(p.query.city.toLowerCase()));if(p.query.type)a=a.filter(j=>j.type===p.query.type);if(p.query.level)a=a.filter(j=>j.level===p.query.level);if(p.query.remote==='true')a=a.filter(j=>j.remote);a.sort((x,y)=>y.created-x.created);return send(res,200,{jobs:a.map(listing),total:a.length})}
 if(pathname==='/api/jobs'&&method==='POST'){const u=requireUser(req,res,['employer','admin']);if(!u)return;return readBody(req).then(d=>{const err=validateJob(d);if(err)return send(res,400,{error:err});const j={id:id('job'),ownerId:u.id,title:d.title.trim(),description:d.description.trim(),discipline:d.discipline,location:d.location,type:d.type||'Full-time',level:d.level||'Mid',salaryMin:Number(d.salaryMin)||0,salaryMax:Number(d.salaryMax)||0,remote:!!d.remote,skills:Array.isArray(d.skills)?d.skills:[],status:u.role==='admin'?'published':'pending',created:now(),updated:now(),views:0,deadline:d.deadline||''};db.jobs.unshift(j);log(u,'CREATE','job',j.id);save();return send(res,201,{job:listing(j),message:j.status==='pending'?'Submitted for admin approval.':'Published.'})}).catch(()=>send(res,400,{error:'Invalid request'}))}
 if(pathname.startsWith('/api/jobs/')&&method==='GET'){const j=db.jobs.find(x=>x.id===pathname.split('/')[3]);if(!j)return send(res,404,{error:'Job not found'});j.views++;save();return send(res,200,{job:listing(j)})}
 if(pathname.startsWith('/api/jobs/')&&method==='DELETE'){const u=requireUser(req,res,['employer','admin']);if(!u)return;const jid=pathname.split('/')[3],j=db.jobs.find(x=>x.id===jid);if(!j)return send(res,404,{error:'Job not found'});if(u.role!=='admin'&&j.ownerId!==u.id)return send(res,403,{error:'Not your job'});j.status='closed';j.updated=now();log(u,'CLOSE','job',jid);save();return send(res,200,{ok:true})}
 if(pathname==='/api/applications'&&method==='POST'){const u=requireUser(req,res,['engineer']);if(!u)return;return readBody(req).then(d=>{const j=db.jobs.find(x=>x.id===d.jobId&&x.status==='published');if(!j)return send(res,404,{error:'Job unavailable'});if(db.applications.some(a=>a.jobId===j.id&&a.userId===u.id&&a.status!=='withdrawn'))return send(res,409,{error:'You already applied.'});const a={id:id('app'),jobId:j.id,userId:u.id,cover:d.cover||'',expectedSalary:Number(d.expectedSalary)||0,status:'submitted',created:now()};db.applications.push(a);log(u,'APPLY','application',a.id);save();return send(res,201,{application:a})}).catch(()=>send(res,400,{error:'Invalid request'}))}
 if(pathname==='/api/applications'&&method==='GET'){const u=requireUser(req,res);if(!u)return;let a=u.role==='admin'?db.applications:u.role==='employer'?db.applications.filter(x=>db.jobs.find(j=>j.id===x.jobId)?.ownerId===u.id):db.applications.filter(x=>x.userId===u.id);return send(res,200,{applications:a.map(x=>({...x,job:listing(db.jobs.find(j=>j.id===x.jobId)),candidate:safeUser(db.users.find(z=>z.id===x.userId))}))})}
 if(pathname.startsWith('/api/applications/')&&method==='PATCH'){const u=requireUser(req,res,['employer','admin']);if(!u)return;const a=db.applications.find(x=>x.id===pathname.split('/')[3]);if(!a)return send(res,404,{error:'Application not found'});const j=db.jobs.find(x=>x.id===a.jobId);if(u.role!=='admin'&&j.ownerId!==u.id)return send(res,403,{error:'Forbidden'});return readBody(req).then(d=>{if(!['shortlisted','rejected','hired','submitted'].includes(d.status))return send(res,400,{error:'Invalid status'});a.status=d.status;save();return send(res,200,{application:a})})}
 if(pathname==='/api/messages'&&method==='GET'){const u=requireUser(req,res);if(!u)return;return send(res,200,{messages:db.messages.filter(m=>m.from===u.id||m.to===u.id).sort((a,b)=>a.t-b.t)})}
 if(pathname==='/api/messages'&&method==='POST'){const u=requireUser(req,res);if(!u)return;return readBody(req).then(d=>{if(!d.to||!d.text)return send(res,400,{error:'Recipient and message required'});const m={id:id('msg'),from:u.id,to:d.to,text:d.text.trim(),t:now(),read:false};db.messages.push(m);save();return send(res,201,{message:m})})}
 if(pathname==='/api/profile'&&method==='PATCH'){const u=requireUser(req,res);if(!u)return;return readBody(req).then(d=>{Object.assign(u,{name:d.name?.trim()||u.name,company:d.company??u.company,discipline:d.discipline??u.discipline,city:d.city??u.city,bio:d.bio??u.bio,skills:Array.isArray(d.skills)?d.skills:u.skills||[]});save();return send(res,200,{user:safeUser(u)})})}
 if(pathname==='/api/admin/stats'&&method==='GET'){const u=requireUser(req,res,['admin']);if(!u)return;return send(res,200,{users:db.users.length,engineers:db.users.filter(x=>x.role==='engineer').length,employers:db.users.filter(x=>x.role==='employer').length,jobs:db.jobs.length,pendingJobs:db.jobs.filter(x=>x.status==='pending').length,applications:db.applications.length,openJobs:db.jobs.filter(x=>x.status==='published').length})}
 if(pathname==='/api/admin/jobs'&&method==='GET'){const u=requireUser(req,res,['admin']);if(!u)return;return send(res,200,{jobs:db.jobs.map(listing).sort((a,b)=>b.created-a.created)})}
 if(pathname.startsWith('/api/admin/jobs/')&&method==='PATCH'){const u=requireUser(req,res,['admin']);if(!u)return;const j=db.jobs.find(x=>x.id===pathname.split('/')[4]);if(!j)return send(res,404,{error:'Job not found'});return readBody(req).then(d=>{if(d.status)j.status=d.status;j.updated=now();log(u,'MODERATE','job',j.id);save();return send(res,200,{job:listing(j)})})}
 if(pathname==='/api/admin/users'&&method==='GET'){const u=requireUser(req,res,['admin']);if(!u)return;return send(res,200,{users:db.users.map(safeUser)})}
 if(pathname.startsWith('/api/admin/users/')&&method==='PATCH'){const u=requireUser(req,res,['admin']);if(!u)return;const x=db.users.find(z=>z.id===pathname.split('/')[4]);if(!x)return send(res,404,{error:'User not found'});return readBody(req).then(d=>{if(d.status)x.status=d.status;if(d.role&&['engineer','employer','admin'].includes(d.role))x.role=d.role;save();return send(res,200,{user:safeUser(x)})})}
 if(pathname==='/api/admin/audit'&&method==='GET'){const u=requireUser(req,res,['admin']);if(!u)return;return send(res,200,{audit:db.audit})}
 if(pathname==='/api/bootstrap'&&method==='GET')return send(res,200,{disciplines:['Electrical','Civil','Mechanical','Architecture','Structural','HSE','Environmental','Planning','Quantity Surveying','Project Management','Instrumentation & Control','Telecom & ELV'],cities:['Riyadh','Jeddah','Dammam','Khobar','Makkah','Madinah','NEOM','Tabuk','Jazan','Abha'],types:['Full-time','Part-time','Contract','Temporary','Internship'],levels:['Entry','Junior','Mid','Senior','Manager','Director']});
 return serveStatic(req,res,pathname);
}
function serveStatic(req,res,pathname){let f=pathname==='/'?'/index.html':pathname;f=path.normalize(f).replace(/^\.\.(?:[\\/]|$)/,'');const file=path.join(PUBLIC,f);if(!file.startsWith(PUBLIC)||!fs.existsSync(file)||fs.statSync(file).isDirectory())return send(res,404,{error:'Not found'});const ext=path.extname(file);const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml'};res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream'});fs.createReadStream(file).pipe(res)}
async function main(){
 db=await load();
 await seedAdmin();
 const server=http.createServer((req,res)=>{try{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');route(req,res)}catch(e){console.error(e);send(res,500,{error:'Server error'})}});
 server.listen(PORT,'0.0.0.0',()=>console.log(`ENGINEX Marketplace running on port ${PORT}`));
}
main().catch(e=>{console.error('Startup failed',e);process.exit(1)});
