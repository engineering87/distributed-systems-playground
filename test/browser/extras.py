import asyncio, re
from playwright.async_api import async_playwright
from common import URL, launcher
res=[]
def check(c,m): res.append(('OK  ' if c else 'FAIL')+' '+m)
async def main():
    async with async_playwright() as p:
        b = await launcher(p).launch()
        ctx = await b.new_context(viewport={'width':1440,'height':900}, accept_downloads=True)
        pg = await ctx.new_page(); errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type=='error' and 'Failed to load' not in m.text else None)
        await pg.goto(URL); await pg.wait_for_timeout(900)
        check(not await pg.is_visible('#tour'), 'tour not shown under automation')
        async def pause():
            if (await pg.get_attribute('#btn-play','aria-label')) in ('Pause','Pausa'): await pg.click('#btn-play')
        await pause()
        # settings: theme
        await pg.click('#btn-settings'); await pg.select_option('#set-theme','dark')
        check(await pg.evaluate("document.documentElement.getAttribute('data-theme')") == 'dark', 'dark theme applied')
        bg = await pg.evaluate("getComputedStyle(document.body).backgroundColor"); check(bg == 'rgb(15, 22, 29)', 'dark background ' + bg)
        await pg.select_option('#set-palette','cvd')
        check(await pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--red').trim()") == '#ff8a3d', 'cvd palette in dark')
        await pg.select_option('#set-theme','light')
        check(await pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--red').trim()") == '#d55e00', 'cvd palette in light')
        await pg.select_option('#set-palette','standard'); await pg.select_option('#set-theme','system')
        # language
        await pg.select_option('#set-lang','it'); await pg.wait_for_timeout(200)
        check(await pg.inner_text('#btn-run') == 'Esegui', 'italian run button')
        check('Scorciatoie' in await pg.inner_text('#btn-open-shortcuts'), 'italian settings dialog')
        await pg.keyboard.press('Escape')
        await pg.click('[data-tab=time]')
        check('Modello assunto' in await pg.inner_text('.side'), 'italian timing tab')
        check('Distribuzioni:' in await pg.inner_text('.side'), 'italian block hint')
        await pg.click('#btn-run'); await pg.wait_for_timeout(800); await pause()
        st = await pg.inner_text('#status'); check('eventi elaborati' in st, 'italian status: ' + st)
        chips = await pg.inner_text('#chips'); check('messaggi' in chips, 'italian chips: ' + chips.replace('\n',' '))
        await pg.screenshot(path='it1.png')
        await pg.click('#btn-settings'); await pg.select_option('#set-lang','en'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        check(await pg.inner_text('#btn-run') == 'Run' and 'Assumed model' in await pg.inner_text('.side'), 'back to english')
        check('messages' in await pg.inner_text('#chips'), 'english chips after switch: ' + (await pg.inner_text('#chips')).replace('\n',' '))
        await pg.reload(); await pg.wait_for_timeout(800); await pause()
        check(await pg.inner_text('#btn-run') == 'Run', 'language persisted as english')
        # shortcuts
        await pg.keyboard.press('?'); check(await pg.is_visible('#dlg-shortcuts'), 'shortcuts dialog with ?'); await pg.keyboard.press('Escape')
        await pg.click('#btn-shortcuts'); check(await pg.is_visible('#dlg-shortcuts'), 'shortcuts button'); await pg.keyboard.press('Escape')
        # tour from settings
        await pg.click('#btn-settings'); await pg.click('#btn-open-tour'); await pg.wait_for_timeout(300)
        check(await pg.is_visible('#tour .tour-card'), 'tour visible')
        titles=[]
        for i in range(8):
            titles.append(await pg.inner_text('#tour-title'))
            box = await pg.locator('#tour .tour-card').bounding_box()
            if not (box['x'] >= 0 and box['y'] >= 0 and box['x']+box['width'] <= 1440 and box['y']+box['height'] <= 900): check(False, 'tour card off screen at ' + titles[-1])
            await pg.click('#tour-next'); await pg.wait_for_timeout(250)
        check(len(set(titles)) == 8 and not await pg.is_visible('#tour'), 'tour 8 steps then closes: ' + ', '.join(titles))
        check(await pg.evaluate("localStorage.getItem('ds-playground:toured')") == '1', 'tour flag stored')
        # gallery
        await pg.click('#btn-gallery'); cards = await pg.locator('#gallery-grid .card').count()
        check(cards == 9, f'gallery cards {cards}')
        await pg.click('#gallery-filter button:has-text("Broadcast")')
        check(await pg.locator('#gallery-grid .card').count() == 4, 'gallery filter broadcast')
        await pg.click('#gallery-grid .card:has-text("Gossip")'); await pg.wait_for_timeout(900); await pause()
        check('Village' in await pg.input_value('#top'), 'gallery loads example')
        # presentation
        await pg.keyboard.press('p'); await pg.wait_for_timeout(300)
        check(await pg.evaluate("document.body.classList.contains('present')") and not await pg.is_visible('.side'), 'presentation on')
        t0 = await pg.inner_text('#tlabel'); await pg.keyboard.press('Home'); await pg.keyboard.press('PageDown'); t1 = await pg.inner_text('#tlabel')
        check(t1 != t0 and not t1.startswith('t = 0 µs'), 'clicker PageDown steps: ' + t1)
        await pg.screenshot(path='present.png')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        left = not await pg.evaluate("document.body.classList.contains('present')")
        if not left:
            # some browsers consume Esc to leave full screen; the exit button always works
            await pg.click('#btn-present-exit'); await pg.wait_for_timeout(300)
        check(not await pg.evaluate("document.body.classList.contains('present')") and await pg.is_visible('.side'),
              'presentation off' + ('' if left else ' (with the exit button: Esc was consumed by the browser)'))
        # leaving full screen on its own must leave presentation mode too
        await pg.keyboard.press('p'); await pg.wait_for_timeout(300)
        await pg.evaluate("document.fullscreenElement ? document.exitFullscreen() : document.dispatchEvent(new Event('fullscreenchange'))")
        await pg.wait_for_timeout(200)
        check(not await pg.evaluate("document.body.classList.contains('present')"), 'leaving full screen leaves presentation mode')
        # exports
        await pg.keyboard.press('End')
        await pg.click('#btn-export'); await pg.wait_for_timeout(300)
        for bid, ext in [('#btn-img-diagram-svg','svg'),('#btn-img-diagram-png','png'),('#btn-img-graph-svg','svg')]:
            async with pg.expect_download() as dl:
                await pg.click(bid)
            d = await dl.value; path = f'export_{bid[9:]}.{ext}'; await d.save_as(path)
            data = open(path,'rb').read()
            ok = data[:4] == b'\x89PNG' if ext=='png' else data.startswith(b'<svg')
            check(ok and len(data) > 1000, f'export {bid} {len(data)} bytes, name {d.suggested_filename}')
        await pg.keyboard.press('Escape')
        # packets over nodes: node still selectable
        print(errs or 'no errors')
        await b.close()
try:
    asyncio.run(main())
finally:
    print('\n'.join(res))
