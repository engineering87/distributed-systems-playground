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
        await pg.select_option('#example','floodset'); await pg.wait_for_timeout(900); await pause()
        await pg.click('[data-tab=scen]')
        await pg.fill('#batch-seeds','1..10'); await pg.fill('#batch-window','0..2s')
        await pg.click('#btn-profile')
        for _ in range(200):
            if 'condition(s) in' in await pg.inner_text('#batch-progress'): break
            await pg.wait_for_timeout(250)
        prog = await pg.inner_text('#batch-progress')
        check('condition(s) in' in prog, 'profile finished: ' + prog)
        rows = await pg.locator('#batch-results table.profile tr').count()
        check(rows == 11, f'one row per condition plus the header: {rows}')
        text = await pg.inner_text('#batch-results')
        check('no faults' in text and 'partitions 1.5/s' in text, 'conditions listed')
        check('10/10' in text, 'a condition where everything held')
        headline = await pg.inner_text('#batch-results .profile-headline')
        check('Holds under' in headline and 'Breaks under' in headline, 'headline summarizes the profile: ' + headline[:110])
        marks = await pg.evaluate("[...document.querySelectorAll('#batch-results tr')].map(r => r.className).filter(Boolean)")
        check(len(set(marks)) >= 2, f'conditions carry different verdicts: {sorted(set(marks))}')
        fits = await pg.evaluate("(() => { const b = document.querySelector('#batch-results'); return [b.clientWidth, b.scrollWidth]; })()")
        check(fits[1] <= fits[0] + 1, f'the summary fits the panel, the table scrolls inside it: {fits}')
        bars = await pg.locator('#batch-results .bar i').count()
        check(bars == 10, f'every row shows its reach as a bar: {bars}')
        bad = await pg.locator('#batch-results td.bad').count()
        check(bad >= 1, f'a condition where something broke: {bad} cell(s)')
        opens = await pg.locator('#batch-results button:has-text("open seed")').count()
        check(opens >= 1, f'failing conditions offer to open a seed: {opens}')
        await pg.locator('#batch-results button:has-text("open seed")').first.click()
        await pg.wait_for_timeout(1200); await pause()
        check('properties' in await pg.inner_text('#chips'), 'the chosen seed runs: ' + (await pg.inner_text('#chips')).replace('\n',' ')[:80])
        print(errs or 'no errors')
        await b.close()
try:
    asyncio.run(main())
finally:
    print('\n'.join(res))
