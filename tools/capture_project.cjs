const {chromium}=require('@playwright/test');
const fs=require('fs');
(async()=>{
 const out='docs/project-images'; fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 await page.goto('http://127.0.0.1:5188/login');
 await page.getByLabel('Mã tổ chức').fill('minh-khai-university');
 await page.getByLabel('Email tổ chức').fill('admin@caseflow.local');
 await page.getByLabel('Mật khẩu',{exact:true}).fill('Demo123!');
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 await page.waitForURL('**/overview');
 for(const route of ['overview','cases','cases/new','knowledge','services','users','incidents','system']){
  await page.goto('http://127.0.0.1:5188/'+route);
  await page.waitForLoadState('networkidle');
  await page.screenshot({path:out+'/'+route.replace('/','-')+'.png'});
  if(route==='cases'){
   await page.locator('.case-link').first().click(); await page.waitForLoadState('networkidle');
   await page.screenshot({path:out+'/case-detail.png'});
  }
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
