const {chromium}=require('/opt/node-tools/node_modules/playwright');
const path=require('path'),fs=require('fs');
(async()=>{
  for(const k of ['intro','outro']){
    const dir=path.join(__dirname,'raw_'+k); fs.rmSync(dir,{recursive:true,force:true});
    const b=await chromium.launch();
    const ctx=await b.newContext({viewport:{width:1920,height:1080},recordVideo:{dir,size:{width:1920,height:1080}}});
    const p=await ctx.newPage();
    await p.goto('file://'+path.join(__dirname,'card.html')+'?k='+k);
    await p.waitForTimeout(k==='intro'?6500:9500);
    await ctx.close(); await b.close();
    const f=fs.readdirSync(dir)[0];
    fs.renameSync(path.join(dir,f),path.join(__dirname,`card_${k}.webm`));
    fs.rmSync(dir,{recursive:true,force:true});
    console.log('recorded',k);
  }
})();
