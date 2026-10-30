import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, renameSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
const commit = execFileSync('git', ['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const release = {version:'weekend-20261030-rc1',commit,mode:'persistent-test-only',backend:'none',storage:'browser-indexeddb',legacyUrl:'https://rafchu-tcg-app.web.app',builtAt:new Date().toISOString()};
export default defineConfig({
  plugins:[react(),{
    name:'pilot-dev-routing',apply:'serve',configureServer(server){server.middlewares.use((req,res,next)=>{
      const pathname=(req.url||'').split('?')[0];
      if(pathname==='/'||pathname==='/index.html')req.url='/pilot.html';
      if(pathname.startsWith('/src/')&&!pathname.startsWith('/src/pilot/')){res.statusCode=403;res.end('Only candidate modules are served here.');return;}
      if(pathname==='/rafchu-logo.png'){res.setHeader('Content-Type','image/png');res.end(readFileSync('public/rafchu-logo.png'));return;}
      next();
    });}
  },{
    name:'pilot-isolation-guard',
    apply:'build',
    generateBundle(_options,bundle){
      for(const output of Object.values(bundle)) {
        if(output.type !== 'chunk') continue;
        for(const id of Object.keys(output.modules)) {
          if(/(?:@firebase|firebase\/|AppWrapper|AppContext|functionEndpoint)/.test(id)) throw Error('Test candidate includes a live-capable module: '+id);
        }
        if(/cloudfunctions\.net|firestore\.googleapis\.com|AIzaSy/.test(output.code)) throw Error('Test candidate contains a production service identifier');
      }
    },
    closeBundle(){
      const dir=path.resolve('dist-pilot');mkdirSync(dir,{recursive:true});
      renameSync(path.join(dir,'pilot.html'),path.join(dir,'index.html'));
      copyFileSync('public/rafchu-logo.png',path.join(dir,'rafchu-logo.png'));
      writeFileSync(path.join(dir,'release.json'),JSON.stringify(release,null,2)+'\n');
    }
  }],
  publicDir:false,
  define:{__PILOT_RELEASE__:JSON.stringify(release)},
  server:{host:'127.0.0.1',port:5215,strictPort:true},
  preview:{host:'127.0.0.1',port:5216,strictPort:true},
  build:{outDir:'dist-pilot',emptyOutDir:true,sourcemap:false,rollupOptions:{input:{pilot:path.resolve('pilot.html'),recovery:path.resolve('recovery.html')}}},
  test:{environment:'node',include:['src/pilot/**/*.test.js']}
});
