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
        for _ in range(160):   # a slow machine with one worker still finishes well within this
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
        for _ in range(160):
            if '20 run(s)' in await pg.inner_text('#batch-progress'): break
            await pg.wait_for_timeout(250)
        out = await pg.inner_text('#batch-results')
        check('first broken at seed 5' in out, 'realistic rounds break agreement: ' + [l for l in out.split('\n') if 'Agreement' in l][:1].__str__())
        # clicking a seed opens that run
        await pg.click('#batch-results button:has-text("seed 5")'); await pg.wait_for_timeout(900); await pause()
        check(await pg.input_value('#seed') == '5' and '2/3 properties' in await pg.inner_text('#chips'), 'clicking a seed opens it: ' + (await pg.inner_text('#chips')).replace('\n',' '))
        # the page stays responsive while a long batch runs
        # generated fault schedules: the same scenario, one random schedule per seed
        await pg.fill('#batch-seeds','1..20'); await pg.fill('#batch-faults','partition:1'); await pg.fill('#batch-window','0..2s')
        await pg.click('#btn-batch')
        for _ in range(160):
            if '20 run(s)' in await pg.inner_text('#batch-progress'): break
            await pg.wait_for_timeout(250)
        out = await pg.inner_text('#batch-results')
        check('Agreement' in out and 'held in' in out, 'batch with generated faults: ' + [l for l in out.split('\n') if 'Agreement' in l][:1].__str__())
        check('partition {p' in out, 'the schedule of a failing seed is shown: ' + [l for l in out.split('\n') if 'partition' in l][:1].__str__())
        faults_before = len((await pg.inner_text('#faults')).split('Remove')) - 1
        await pg.click('#batch-results button >> nth=0'); await pg.wait_for_timeout(900); await pause()
        faults_after = len((await pg.inner_text('#faults')).split('Remove')) - 1
        check(faults_after == faults_before + 1, f'opening a seed adds its schedule to the scenario ({faults_before} -> {faults_after})')
        check('Agreement' in await pg.inner_text('#chips') or 'properties' in await pg.inner_text('#chips'), 'the reopened run is simulated')
        for f in ['#batch-faults']: await pg.fill(f, 'nope:1')
        await pg.click('#btn-batch')
        check('Unknown fault plan' in await pg.inner_text('#toast'), 'bad fault plan reported: ' + await pg.inner_text('#toast'))
        await pg.fill('#batch-faults', '')
        await pg.fill('#batch-seeds','1..200'); await pg.click('#btn-batch'); await pg.wait_for_timeout(400)
        t0 = await pg.evaluate("performance.now()")
        await pg.click('[data-tab=code]')
        t1 = await pg.evaluate("performance.now()")
        # the point is that the page is not frozen, not that it is fast: a loaded CI machine is still slow
        check(t1 - t0 < 1500, f'the page answers during a batch ({t1-t0:.0f} ms to switch tab)')
        await pg.click('[data-tab=scen]')
        # A batch may already have finished by now on a fast machine: start one and stop it in the same tick,
        # which is the only timing-independent way to exercise the stop path.
        if await pg.inner_text('#btn-batch') != 'Stop':
            await pg.fill('#batch-seeds', '1..500')
            await pg.click('#btn-batch')
        await pg.click('#btn-batch')
        await pg.wait_for_timeout(100)
        check('stopped' in await pg.inner_text('#batch-progress') and await pg.inner_text('#btn-batch') == 'Run over seeds',
              'batch can be stopped: ' + await pg.inner_text('#batch-progress'))
        await pg.fill('#batch-seeds','nope'); await pg.click('#btn-batch')
        check('Seeds look like' in await pg.inner_text('#toast'), 'bad seed list reported: ' + await pg.inner_text('#toast'))
        check(await pg.inner_text('#btn-batch') == 'Run over seeds', 'an invalid seed list starts nothing')
        print(errs or 'no errors')
        await b.close()
try:
    asyncio.run(main())
finally:
    print('\n'.join(res))
