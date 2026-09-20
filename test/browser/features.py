import asyncio
from playwright.async_api import async_playwright
from common import URL, launcher
res=[]
def check(c,m): res.append(('OK  ' if c else 'FAIL')+' '+m)
async def main():
    async with async_playwright() as p:
        b = await launcher(p).launch()
        ctx = await b.new_context(viewport={'width':1440,'height':900}, color_scheme='dark')
        pg = await ctx.new_page(); errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type=='error' and 'Failed to load' not in m.text else None)
        await pg.goto(URL); await pg.wait_for_timeout(900)
        async def pause():
            if (await pg.get_attribute('#btn-play','aria-label'))=='Pause': await pg.click('#btn-play')
        for key in ['reliable-broadcast', 'causal-broadcast', 'gossip']:
            await pg.select_option('#example', key); await pg.wait_for_timeout(900); await pause()
            check('events processed' in await pg.inner_text('#status'), f'{key} runs: ' + (await pg.inner_text('#status'))[:50])
        # reliable broadcast: layers + stack
        await pg.select_option('#example', 'reliable-broadcast'); await pg.wait_for_timeout(900); await pause()
        await pg.check('#layers')
        leg = await pg.inner_text('#layer-legend')
        check('Newsroom' in leg and 'AckLinks' in leg and 'EagerReliableBroadcast' in leg, 'layer legend: ' + leg.replace('\n', ', '))
        # how many packets are in flight depends on the instant, so look for one instead of guessing
        tints, at = [], None
        for pos in range(60, 3000, 40):
            await pg.evaluate(f"(()=>{{const s=document.querySelector('#scrub'); s.value={pos}; s.dispatchEvent(new Event('input'));}})()")
            tints = await pg.evaluate(
                "[...document.querySelectorAll('#g-msgs .pk')].filter(g => g.getAttribute('display') !== 'none')"
                ".map(g => { const r = g.querySelector('rect'); const c = g.querySelector('circle');"
                " return (r && r.style.fill) || (c && c.style.fill) || ''; })")
            if any(tints):
                at = pos
                break
        check(any(tints), f'packets tinted by layer at {at}: {set(tints)}')
        await pg.screenshot(path='n1.png')
        await pg.click('[data-tab=stack]')
        await pg.click('#g-nodes [data-node="2"]')
        sv = await pg.inner_text('#stack-view')
        check('Application' in sv and 'EagerReliableBroadcast' in sv and 'Network' in sv, 'stack view boxes')
        check('Latest events on p2' in sv, 'stack view recent events')
        await pg.click('#btn-start'); await pg.select_option('#speed', 'step'); await pg.click('#btn-play'); await pg.wait_for_timeout(2500); await pause()
        flows = await pg.locator('#stack-view .flow').count()
        check(True, f'stack flows visible now: {flows}')
        for i in range(40):
            await pg.click('#btn-next')
            if await pg.locator('#stack-view .flow').count(): break
        check(True, 'p2 first flows at ' + await pg.inner_text('#tlabel'))
        check(await pg.locator('#stack-view .flow').count() > 0, 'stack shows flows after stepping')
        await pg.screenshot(path='n2.png')
        # stack process picker
        await pg.select_option('#stack-view select', '3')
        check('Latest events on p3' in await pg.inner_text('#stack-view'), 'stack process picker')
        # causality
        await pg.select_option('#example', 'causal-broadcast'); await pg.wait_for_timeout(900); await pause()
        await pg.check('#cone-mode')
        cb = await pg.locator('#st').bounding_box()
        # row of p4 = index 3 -> y = 26 + 3*26 + 13
        await pg.click('#zoom-fit')
        await pg.mouse.click(cb['x'] + cb['width'] * 0.6, cb['y'] + 26 + 3 * 26 + 13)
        info = await pg.inner_text('#cone-info')
        check('p4' in info and 'could have caused it' in info, 'cone info: ' + info.replace('\n', ' '))
        cls = await pg.evaluate("[...document.querySelectorAll('#g-nodes .nd')].map(n => n.getAttribute('class')).join(' | ')")
        check('origin' in cls, 'topology marks cone origin: ' + cls)
        await pg.screenshot(path='n3.png')
        await pg.click('#cone-info button')
        check(not await pg.is_visible('#cone-info'), 'cone clear')
        await pg.uncheck('#cone-mode')
        # add module
        await pg.select_option('#example', 'blank'); await pg.wait_for_timeout(800); await pause()
        await pg.click('[data-tab=code]')
        await pg.select_option('#add-module', 'causal')
        code = await pg.input_value('#code')
        for name in ['AckLinks', 'BasicBroadcast', 'EagerReliableBroadcast', 'WaitingCausalBroadcast', 'interface CausalOrderBroadcast']:
            check(name in code, f'add module inserted {name}')
        check('Guarantees' in await pg.inner_text('#module-info'), 'module info shown')
        await pg.select_option('#add-module', 'erb')
        check('already in the code' in await pg.inner_text('#toast'), 'duplicate module rejected')
        await pg.wait_for_timeout(500)
        check('No errors' in await pg.inner_text('#diag') or 'warn' in (await pg.inner_html('#diag')), 'inserted code checks: ' + (await pg.inner_text('#diag'))[:80])
        # use it: change MyAlgorithm to use CausalOrderBroadcast
        new = code.replace('uses Net as net', 'uses Net as net\n  uses CausalOrderBroadcast as cb', 1)
        await pg.fill('#code', new); await pg.wait_for_timeout(400)
        await pg.click('#btn-run'); await pg.wait_for_timeout(900); await pause()
        check('events processed' in await pg.inner_text('#status') or 'Warnings' in await pg.inner_text('#status'), 'blank + causal stack runs: ' + (await pg.inner_text('#status'))[:80])
        # add module with syntax error
        await pg.fill('#code', 'algorithm'); await pg.select_option('#add-module', 'beb')
        check('Fix the syntax' in await pg.inner_text('#toast'), 'add module on broken code')
        print(errs or 'no errors')
        await b.close()
try:
    asyncio.run(main())
finally:
    print('\n'.join(res))
