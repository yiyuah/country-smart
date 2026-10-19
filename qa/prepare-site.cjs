// Copy only website assets; local QA records and downloadable archives stay out of hosting.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),target=path.join(root,'site','dist');
fs.mkdirSync(target,{recursive:true});
for(const name of ['index.html','styles.css','data.js','icons.js','app.js'])fs.copyFileSync(path.join(root,name),path.join(target,name));
fs.mkdirSync(path.join(target,'assets'),{recursive:true});
for(const name of ['服務情境1.jpg','服務情境2.jpg','服務情境3.jpg','服務情境4.jpg','家電操作.mp4','stores.json'])fs.copyFileSync(path.join(root,'assets',name),path.join(target,'assets',name));
console.log('Hosting files ready: '+target);
