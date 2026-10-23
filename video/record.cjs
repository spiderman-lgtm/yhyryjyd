// Records the DealRadar site scenes at 1920x1080 with a visible, smoothly moving cursor.
// Usage: BASE=https://dealradar.embarko.app PRODUCT_URL=<amazon link> node record.cjs [scene ...]
// Scenes: s1_home s2_product s3_alert s5_automation   (s4_extension needs a store page + the unpacked extension, see EXT_DIR)
// NOTE: written while the site was unreachable from this container; selectors are by visible text and need one test run.
const {chromium}=require('/opt/node-tools/node_modules/playwright');
const fs=require('fs'),path=require('path');
const BASE=process.env.BASE||'https://dealradar.embarko.app';
const PRODUCT_URL=process.env.PRODUCT_URL||'';
const EXT_DIR=process.env.EXT_DIR||'';         // unpacked DealRadar extension folder (for s4_extension)
const STORE_URL=process.env.STORE_URL||PRODUCT_URL;
const OUT=path.join(__dirname,'scenes'); fs.mkdirSync(OUT,{recursive:true});
const CURSOR=`(()=>{const c=document.createElement('div');c.id='__cur';c.style.cssText='position:fixed;z-index:2147483647;width:22px;height:22px;pointer-events:none;left:0;top:0;transform:translate(-3px,-2px);filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))';
c.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 2l16 10-7 1.5L17 21l-3 1-4-7.5L4 20z" fill="#fff" stroke="#000" stroke-width="1.5"/></svg>';document.body.appendChild(c);
window.__mv=(x,y)=>{c.style.left=x+'px';c.style.top=y+'px'};})()`;
const ease=t=>t<.5?2*t*t:-1+(4-2*t)*t;
async function glide(p,x,y,ms=700){const s=p.__cur||{x:960,y:540};const n=Math.max(8,Math.round(ms/16));
  for(let i=1;i<=n;i++){const k=ease(i/n);const cx=s.x+(x-s.x)*k,cy=s.y+(y-s.y)*k;await p.mouse.move(cx,cy);await p.evaluate(([a,b])=>window.__mv&&window.__mv(a,b),[cx,cy]);await p.waitForTimeout(16)}
  p.__cur={x,y}}
async function clickText(p,text,ms=800){const l=p.getByText(text,{exact:false}).first();await l.waitFor({timeout:15000});const b=await l.boundingBox();
  await glide(p,b.x+b.width/2,b.y+b.height/2,ms);await p.waitForTimeout(250);await l.click();}
async function smoothScroll(p,dy,ms=1500){const n=Math.round(ms/16);for(let i=0;i<n;i++){await p.mouse.wheel(0,dy/n);await p.waitForTimeout(16)}}
async function type(p,sel,text){const l=p.locator(sel).first();await l.click();for(const ch of text){await p.keyboard.type(ch);await p.waitForTimeout(18)}}
const scenes={
 async s1_home(p){await p.goto(BASE,{waitUntil:'networkidle'});await p.waitForTimeout(1200);await glide(p,700,420,1200);await glide(p,1100,470,1200);
   await smoothScroll(p,700,2200);await p.waitForTimeout(1500);await smoothScroll(p,700,2200);await p.waitForTimeout(1800);await smoothScroll(p,-1400,1800);await p.waitForTimeout(1500);},
 async s2_product(p){await p.goto(BASE,{waitUntil:'networkidle'});await p.waitForTimeout(800);const box=p.locator('input[type="text"],input[type="url"],input[type="search"]').first();
   const b=await box.boundingBox();await glide(p,b.x+40,b.y+b.height/2,900);await box.click();await p.keyboard.type(PRODUCT_URL,{delay:12});await p.waitForTimeout(400);
   await clickText(p,'Check price');await p.waitForLoadState('networkidle');await p.waitForTimeout(2500);await smoothScroll(p,600,2000);await p.waitForTimeout(2000);await smoothScroll(p,600,2000);await p.waitForTimeout(2500);},
 async s3_alert(p){await p.goto(BASE,{waitUntil:'networkidle'});const box=p.locator('input[type="text"],input[type="url"],input[type="search"]').first();await box.fill(PRODUCT_URL);await clickText(p,'Check price');
   await p.waitForLoadState('networkidle');await p.waitForTimeout(1500);const alertHdr=p.getByText('Price Drop Alert').first();await alertHdr.scrollIntoViewIfNeeded();await p.waitForTimeout(800);
   await clickText(p,'Telegram',700);await p.waitForTimeout(600);await clickText(p,'Track price',700);await p.waitForTimeout(3500);},
 async s5_automation(p){await p.goto(BASE+'/automation',{waitUntil:'networkidle'});await p.waitForTimeout(1200);await glide(p,600,500,1000);await smoothScroll(p,400,1500);await p.waitForTimeout(1200);
   await clickText(p,'Connect',900);await p.waitForTimeout(3500);await p.keyboard.press('Escape');await p.waitForTimeout(1200);},
 async s4_extension(p){await p.goto(STORE_URL,{waitUntil:'domcontentloaded'});await p.waitForTimeout(5000);/* extension panel opens by itself */await glide(p,1500,400,1200);await p.waitForTimeout(2500);
   await smoothScroll(p,300,1500);await p.waitForTimeout(2000);try{await clickText(p,'Buy now',800);await p.waitForTimeout(800)}catch{}try{await clickText(p,'Set alert',900);await p.waitForTimeout(3000)}catch{}},
};
(async()=>{
  const want=process.argv.slice(2).length?process.argv.slice(2):Object.keys(scenes).filter(s=>s!=='s4_extension');
  for(const name of want){
    const dir=path.join(OUT,'raw_'+name);fs.rmSync(dir,{recursive:true,force:true});
    const opts={viewport:{width:1920,height:1080},recordVideo:{dir,size:{width:1920,height:1080}},deviceScaleFactor:1};
    let ctx,b;
    if(name==='s4_extension'&&EXT_DIR){ctx=await chromium.launchPersistentContext('',{...opts,headless:true,args:[`--disable-extensions-except=${EXT_DIR}`,`--load-extension=${EXT_DIR}`,'--headless=new']});}
    else{b=await chromium.launch();ctx=await b.newContext(opts);}
    if(fs.existsSync(path.join(__dirname,'state.json'))&&!b){/* persistent ctx: cookies not needed */}
    const p=await ctx.newPage();p.on('load',()=>p.evaluate(CURSOR).catch(()=>{}));
    try{await scenes[name](p);}catch(e){console.error(name,'failed:',e.message);}
    await ctx.close();if(b)await b.close();
    const f=fs.readdirSync(dir)[0];fs.renameSync(path.join(dir,f),path.join(OUT,name+'.webm'));fs.rmSync(dir,{recursive:true,force:true});
    console.log('recorded',name);
  }
})();
