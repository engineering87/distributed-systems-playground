import asyncio
from playwright.async_api import async_playwright
from common import URL, launcher
res=[]
def check(c,m): res.append(('OK  ' if c else 'FAIL')+' '+m)
async def main():
    async with async_playwright() as p:
        b = await launcher(p).launch()
        pg = await (await b.new_context(viewport={'width':1440,'height':900})).new_page()
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(900)
        async def pause():
            if (await pg.get_attribute('#btn-play','aria-label')) in ('Pause','Pausa'): await pg.click('#btn-play')
        await pause()
        await pg.click('[data-tab=scen]')
        # one-way link failure
        await pg.select_option('#fault-type','link')
        check(await pg.is_visible('#fault-oneway'), 'one-way checkbox shown for link failures')
        for k,v in [('#fault-a','1'),('#fault-b','2'),('#fault-from','0ms'),('#fault-to','')]: await pg.fill(k,v)
        await pg.check('#fault-oneway'); await pg.click('#btn-add-fault')
        check('one-way link p1 → p2' in await pg.inner_text('#faults'), 'one-way fault listed: ' + (await pg.inner_text('#faults')).split('\n')[0])
        # pause
        await pg.select_option('#fault-type','pause')
        check(await pg.is_visible('#fault-node2') and await pg.is_visible('#fault-to2'), 'pause fields shown')
        for k,v in [('#fault-node2','5'),('#fault-from','30ms'),('#fault-to2','120ms')]: await pg.fill(k,v)
        await pg.click('#btn-add-fault')
        check('p5 paused from 30ms until 120ms' in await pg.inner_text('#faults'), 'pause listed')
        # omission
        await pg.select_option('#fault-type','omission')
        for k,v in [('#fault-node2','3'),('#fault-prob','0.5'),('#fault-from','0ms'),('#fault-to','')]: await pg.fill(k,v)
        await pg.select_option('#fault-direction','send'); await pg.click('#btn-add-fault')
        check('p3 omits 50% of its sends' in await pg.inner_text('#faults'), 'omission listed: ' + (await pg.inner_text('#faults')).split('\n')[2])
        await pg.click('#btn-run'); await pg.wait_for_timeout(1000); await pause()
        check('events processed' in await pg.inner_text('#status'), 'run with the new faults: ' + (await pg.inner_text('#status'))[:50])
        await pg.select_option('#log-filter','drop')
        log = await pg.inner_text('#log')
        check('not sent (omission)' in log, 'omission in the log: ' + [l for l in log.split('\n') if 'omission' in l][:1].__str__())
        await pg.select_option('#log-filter','fault')
        log2 = await pg.inner_text('#log')
        check('p5 pauses' in log2 and 'p5 resumes' in log2, 'pause start and end in the log')
        # visuals at a moment inside the pause
        await pg.evaluate("(()=>{const s=document.querySelector('#scrub'); s.value=3000; s.dispatchEvent(new Event('input'));})()")
        await pg.wait_for_timeout(200)
        cls = await pg.evaluate("[...document.querySelectorAll('#g-nodes .nd')].map(n=>n.getAttribute('class')).join(' ')")
        await pg.click('#g-nodes [data-node=\"5\"]'); await pg.click('[data-tab=state]')
        inspector = await pg.inner_text('#inspector')
        check('paused until' in inspector or 'paused' in cls, 'paused process shown: ' + inspector.split('\n')[0][:60])
        await pg.screenshot(path='faults.png')
        # inject a pause at the cursor
        await pg.click('#g-nodes [data-node="2"]')
        await pg.click('#props button:has-text("Pause here")'); await pg.wait_for_timeout(900); await pause()
        check('p2 paused from' in await pg.inner_text('#faults'), 'pause injected at the cursor: ' + [l for l in (await pg.inner_text('#faults')).split('\n') if 'p2' in l][:1].__str__())
        print(errs or 'no errors')
        await b.close()
try:
    asyncio.run(main())
finally:
    print('\n'.join(res))
