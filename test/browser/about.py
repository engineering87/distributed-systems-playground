import asyncio
from playwright.async_api import async_playwright
from common import URL, launcher, OUT
async def main():
    async with async_playwright() as p:
        b = await launcher(p).launch()
        pg = await (await b.new_context(viewport={'width':1440,'height':950})).new_page()
        await pg.goto(URL); await pg.wait_for_timeout(900)
        if (await pg.get_attribute('#btn-play','aria-label')) in ('Pause','Pausa'): await pg.click('#btn-play')
        await pg.click('#btn-about'); await pg.wait_for_timeout(300)
        text = await pg.inner_text('#dlg-about')
        res = []
        def check(c, m): res.append(('OK  ' if c else 'FAIL') + ' ' + m)
        links = await pg.evaluate("[...document.querySelectorAll('#dlg-about a')].map(a => [a.textContent.trim(), a.getAttribute('href'), a.getAttribute('rel')])")
        check(any('Version' in l for l in text.split('\n')), 'the dialog shows the version: ' + [l for l in text.split('\n') if 'Version' in l].__str__())
        check('Francesco Del Re' in text, 'the author is named')
        check(len(links) == 3 and all(l[1].startswith('https://') and 'noopener' in (l[2] or '') for l in links),
              f'three external links, opened safely: {[l[0] for l in links]}')
        box = await pg.locator('#dlg-about').bounding_box()
        await pg.screenshot(path=str(OUT / 'about.png'), clip=box)
        # italian
        await pg.keyboard.press('Escape'); await pg.click('#btn-settings'); await pg.select_option('#set-lang','it'); await pg.keyboard.press('Escape')
        await pg.wait_for_timeout(300); await pg.click('#btn-about'); await pg.wait_for_timeout(300)
        it = await pg.inner_text('#dlg-about')
        check('Autore' in it and 'Versione' in it, 'the dialog is translated: ' + [l for l in it.split('\n') if 'Versione' in l].__str__())
        print('\n'.join(res))
        await b.close()
try:
    asyncio.run(main())
finally:
    pass
