const { chromium } = await import(process.env.PB_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true,executablePath:process.env.PB_CHROMIUM_PATH,args:['--no-sandbox']});
try {
 const page = await browser.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.PB_BROWSER_URL || 'http://127.0.0.1:5194', {waitUntil:'networkidle'});
 await page.evaluate(()=>{for(const e of document.querySelectorAll('*')) if(e.scrollHeight>e.clientHeight&&['auto','scroll'].includes(getComputedStyle(e).overflowY))e.scrollTop=e.scrollHeight;});
 if(await page.getByRole('checkbox').count()) {
   await page.getByRole('checkbox').check();
   await page.getByRole('button',{name:/accept|agree/i}).click();
 }
 await page.getByRole('button',{name:'Connect Wallet',exact:true}).click();
 await page.getByText('WalletConnect',{exact:true}).click();
 await page.waitForTimeout(4000);
 const qr=page.locator('svg').filter({has:page.locator('title', {hasText:'QR Code'})});
 if(await qr.count()!==1 || (await qr.locator('path').count())<1) throw new Error('Scannable QR SVG missing');
 const viewBox=await qr.getAttribute('viewBox');
 if(!/^0 0 [0-9]+ [0-9]+$/.test(viewBox||'')) throw new Error('Invalid QR viewBox');
 const body=await page.locator('body').innerText();
 console.log(JSON.stringify({errors,body:body.slice(-1400),svg:await page.locator('svg').count()}));
 await page.screenshot({path:'/tmp/pb-walletconnect-fixed.png'});
 if(errors.length||!body.includes('WalletConnect')||body.length<100) throw new Error('WalletConnect page regression');
} finally {await browser.close();}
