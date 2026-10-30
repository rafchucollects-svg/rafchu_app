import {readFileSync,readdirSync,statSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const config=JSON.parse(readFileSync('firebase.pilot.json','utf8'));
assert.deepEqual(Object.keys(config),['hosting'],'Candidate config must contain only static Hosting');
assert.equal(config.hosting.public,'dist-pilot');
assert.equal(config.hosting.site,'rafchu-tcg-app');
assert(!config.hosting.rewrites,'Test hosting must not route to a Function or live page');
const csp=config.hosting.headers.flatMap(x=>x.headers).find(x=>x.key==='Content-Security-Policy')?.value;
assert(csp?.includes("connect-src 'none'"),'Test candidate must have no backend connection');
assert(csp?.includes("form-action 'none'"));
const branch=execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim();
assert(branch.startsWith('codex/weekend-pilot-'),'Use the dedicated candidate branch');
assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=normal'],{encoding:'utf8'}).trim(),'','Commit the reviewed source before verifying the release');
const release=JSON.parse(readFileSync('dist-pilot/release.json','utf8'));
assert.equal(release.mode,'persistent-test-only');assert.equal(release.backend,'none');
assert.equal(release.commit,execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),'Rebuild after committing final changes');
const walk=(dir,prefix='')=>readdirSync(dir).flatMap(name=>{const p=prefix+name;return statSync(dir+'/'+name).isDirectory()?walk(dir+'/'+name,p+'/'):[p];});
const files=walk('dist-pilot').filter(p=>p!=='file-manifest.json');
assert(files.includes('index.html')&&files.includes('recovery.html'));
assert(files.every(p=>['index.html','recovery.html','release.json','rafchu-logo.png'].includes(p)||p.startsWith('assets/')),'Unexpected public file in test candidate');
for(const file of files.filter(p=>p.endsWith('.js'))){
  const code=readFileSync('dist-pilot/'+file,'utf8');
  assert(!/cloudfunctions\.net|firestore\.googleapis|identitytoolkit\.googleapis|firebaseapp\.com\/__\/auth|AIzaSy/.test(code),'Live backend code found in '+file);
}
const manifest={release,files:files.sort().map(path=>{const b=readFileSync('dist-pilot/'+path);return {path,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')};})};
writeFileSync('dist-pilot/file-manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({mode:release.mode,commit:release.commit,files:manifest.files.length,backend:release.backend,productionWrites:'blocked by absent backend code and connect-src none'},null,2));
