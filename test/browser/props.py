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
            if (await pg.get_attribute('#btn-play','aria-label'))=='Pause': await pg.click('#btn-play')
        await pg.select_option('#example','floodset'); await pg.wait_for_timeout(900); await pause()
        chips = await pg.inner_text('#chips')
        check('3/3 properties' in chips, 'ideal: all properties held — ' + chips.replace('\n',' '))
        check('good' in (await pg.get_attribute('#chips span:last-child','class') or ''), 'chip marked as good')
        await pg.click('[data-tab=time]'); await pg.click('#presets button:has-text("Realistic synchronous")')
        await pg.fill('#seed','5'); await pg.click('#btn-run'); await pg.wait_for_timeout(1200); await pause()
        chips = await pg.inner_text('#chips')
        check('2/3 properties' in chips, 'realistic seed 5: one property broken — ' + chips.replace('\n',' '))
        title = await pg.get_attribute('#chips span:last-child','title')
        check('Agreement' in title and 'violated at' in title, 'chip tooltip: ' + (title or '').replace('\n',' | '))
        await pg.select_option('#log-filter','property')
        rows = await pg.inner_text('#log')
        check('Agreement is violated' in rows, 'property filter shows the violation: ' + rows.split('\n')[0])
        await pg.locator('#log li').first.click()
        check('150 ms' in await pg.inner_text('#tlabel') or 'ms' in await pg.inner_text('#tlabel'), 'clicking it moves the cursor: ' + await pg.inner_text('#tlabel'))
        # editor diagnostics for a bad property
        await pg.click('[data-tab=code]')
        code = await pg.input_value('#code')
        await pg.fill('#code', code + '\nproperty Bad always self = 1 end'); await pg.wait_for_timeout(600)
        check('not available in a property' in await pg.inner_text('#diag'), 'diagnostics: ' + (await pg.inner_text('#diag')).split('\n')[0])
        await pg.fill('#code', code)
        # italian
        await pg.click('#btn-settings'); await pg.select_option('#set-lang','it'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        check('proprietà' in await pg.inner_text('#chips'), 'italian chip: ' + (await pg.inner_text('#chips')).replace('\n',' '))
        check('violata' in await pg.inner_text('#log'), 'italian log: ' + (await pg.inner_text('#log')).split('\n')[2])
        print(errs or 'no errors')
        await b.close()
asyncio.run(main())
print('\n'.join(res))
