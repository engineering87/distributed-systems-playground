import asyncio
from playwright.async_api import async_playwright
from common import URL
res=[]
def check(c,m): res.append(('OK  ' if c else 'FAIL')+' '+m)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width':390,'height':844}, has_touch=True, is_mobile=True, device_scale_factor=2)
        pg = await ctx.new_page(); errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(1200)
        await pg.tap('#btn-play')
        check(not await pg.is_visible('.topo-legend'), 'legend hidden on phone')
        await pg.tap('#g-nodes [data-node="6"]')
        check('p6' in await pg.inner_text('#props'), 'tap selects node')
        await pg.evaluate("(()=>{const s=document.querySelector('#scrub'); s.value=1500; s.dispatchEvent(new Event('input'));})()")
        pk = pg.locator('#g-msgs .pk:visible')
        if await pk.count():
            await pk.first.tap(force=True)
            check('Go to send' in await pg.inner_text('#props'), 'tap selects packet')
        # vertical swipe starting on the topology background should scroll the page
        box = await pg.locator('#topo').bounding_box()
        y0 = await pg.evaluate('scrollY')
        cdp = await ctx.new_cdp_session(pg)
        x, y = box['x'] + 12, box['y'] + box['height'] - 20
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
        for k in range(1, 8):
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x, 'y': y - 25 * k}]})
            await pg.wait_for_timeout(16)
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        await pg.wait_for_timeout(500)
        y1 = await pg.evaluate('scrollY')
        check(y1 > y0 + 50, f'swipe on topology scrolls the page ({y0} -> {y1})')
        await pg.evaluate('scrollTo(0,0)'); await pg.wait_for_timeout(200)
        # dragging a node with touch moves the node, not the page
        nb = await pg.locator('#g-nodes [data-node="1"]').bounding_box()
        x, y = nb['x'] + nb['width']/2, nb['y'] + nb['height']/2
        y0 = await pg.evaluate('scrollY')
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
        for k in range(1, 8):
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x + 6 * k, 'y': y + 8 * k}]})
            await pg.wait_for_timeout(16)
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        await pg.wait_for_timeout(300)
        nb2 = await pg.locator('#g-nodes [data-node="1"]').bounding_box()
        check(abs(nb2['y'] - nb['y']) > 20 and await pg.evaluate('scrollY') == y0, f'touch drag moves node ({nb["y"]:.0f}->{nb2["y"]:.0f}) without scrolling')
        # tabs and editor usable
        await pg.tap('[data-tab=time]'); await pg.tap('#presets button >> nth=1')
        check('Custom' not in await pg.inner_text('#presets'), 'preset tap')
        fs = await pg.evaluate("getComputedStyle(document.querySelector('[data-bind=\"actual.delay\"]')).fontSize")
        check(fs == '16px', 'inputs use 16px on touch: ' + fs)
        h = await pg.evaluate("document.querySelector('#btn-run').getBoundingClientRect().height")
        check(h >= 40, f'touch target height {h}')
        # add node with tap in add mode
        await pg.tap('[data-mode=add]')
        n0 = await pg.locator('#g-nodes .nd').count()
        box = await pg.locator('#topo').bounding_box()
        await pg.tap('#topo', position={'x': 20, 'y': box['height'] - 30})
        check(await pg.locator('#g-nodes .nd').count() == n0 + 1, 'tap adds node in add mode')
        # dialogs fit
        await pg.tap('[data-mode=move]')
        await pg.tap('#btn-export'); await pg.wait_for_timeout(300)
        db = await pg.locator('#dlg-export').bounding_box()
        check(db['x'] >= 0 and db['x'] + db['width'] <= 390, f'export dialog fits {db}')
        await pg.tap('#dlg-export button[value=close]')
        print(errs or 'no errors')
        await b.close()
asyncio.run(main())
print('\n'.join(res))
