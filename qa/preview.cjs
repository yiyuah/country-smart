/* 僅供本機預覽；正式交付可直接雙擊 index.html，不需要此工具。 */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.mp4':'video/mp4','.md':'text/plain; charset=utf-8'};
http.createServer((req,res)=>{let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400);return res.end()}
const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(path.relative(root,file).startsWith('..')){res.writeHead(403);return res.end()}
fs.stat(file,(err,st)=>{if(err||!st.isFile()){res.writeHead(404);return res.end('Not found')}const headers={'Content-Type':types[path.extname(file)]||'application/octet-stream','Accept-Ranges':'bytes'};
const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);if(range){const start=Number(range[1]),end=Math.min(range[2]?Number(range[2]):st.size-1,st.size-1);if(start>end){res.writeHead(416);return res.end()}res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${st.size}`,'Content-Length':end-start+1});fs.createReadStream(file,{start,end}).pipe(res)}else{res.writeHead(200,{...headers,'Content-Length':st.size});fs.createReadStream(file).pipe(res)}})
}).listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173'));
