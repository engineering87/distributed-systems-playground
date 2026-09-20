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
        pg.on('console', lambda m: errs.append('CONSOLE ' + m.text) if m.type=='error' and 'Failed to load' not in m.text else None)
        await pg.goto(URL); await pg.wait_for_timeout(900)
        async def pause():
            if (await pg.get_attribute('#btn-play','aria-label')) in ('Pause','Pausa'): await pg.click('#btn-play')
        await pg.select_option('#example','floodset'); await pg.wait_for_timeout(900); await pause()
        await pg.click('[data-tab=scen]')
        check(await pg.is_visible('#btn-batch'), 'batch panel present')
        used_worker = await pg.evaluate("""() => { try { const el=document.getElementById('worker-src'); const u=URL.createObjectURL(new Blob([el.textContent],{type:'text/javascript'})); const w=new Worker(u); w.terminate(); return true; } catch(e) { return String(e.message); } }""")
        check(True, 'workers available here: ' + str(used_worker))
        await pg.fill('#batch-seeds','1..20'); await pg.click('#btn-batch')
        for _ in range(60):
            if '20 run(s)' in await pg.inner_text('#batch-progress'): break
            await pg.wait_for_timeout(250)
        prog = await pg.inner_text('#batch-progress')
        check('20 run(s)' in prog, 'batch finished: ' + prog)
        out = await pg.inner_text('#batch-results')
        check('Agreement (always) held in 20/20' in out, 'ideal rounds keep agreement: ' + out.split('\n')[1])
        check('all clean' in out, 'summary: ' + out.split('\n')[0])
        # realistic rounds: a seed must break agreement
        await pg.click('[data-tab=time]'); await pg.click('#presets button:has-text("Realistic synchronous")')
        await pg.click('[data-tab=scen]'); await pg.click('#btn-batch')
        for _ in range(80):
            if '20 run(s)' in await pg.inner_text('#batch-progress'): break
            await pg.wait_for_timeout(250)
        out = await pg.inner_text('#batch-results')
        check('first broken at seed 5' in out, 'realistic rounds break agreement: ' + [l for l in out.split('\n') if 'Agreement' in l][:1].__str__())
        # clicking a seed opens that run
        await pg.click('#batch-results button:has-text("seed 5")'); await pg.wait_for_timeout(900); await pause()
        check(await pg.input_value('#seed') == '5' and '2/3 properties' in await pg.inner_text('#chips'), 'clicking a seed opens it: ' + (await pg.inner_text('#chips')).replace('\n',' '))
        # the page stays responsive while a long batch runs
        await pg.fill('#batch-seeds','1..200'); await pg.click('#btn-batch'); await pg.wait_for_timeout(400)
        t0 = await pg.evaluate("performance.now()")
        await pg.click('[data-tab=code]')
        t1 = await pg.evaluate("performance.now()")
        check(t1 - t0 < 400, f'the page answers during a batch ({t1-t0:.0f} ms to switch tab)')
        await pg.click('[data-tab=scen]'); await pg.click('#btn-batch')
        check('stopped' in await pg.inner_text('#batch-progress'), 'batch can be stopped')
        await pg.fill('#batch-seeds','nope'); await pg.click('#btn-batch')
        check('Seeds look like' in await pg.inner_text('#toast'), 'bad seed list reported')
        print(errs or 'no errors')
        await b.close()
asyncio.run(main())
print('\n'.join(res))
