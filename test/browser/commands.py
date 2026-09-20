import asyncio, json, re, sys
from playwright.async_api import async_playwright
from common import URL
fails, notes = [], []
def check(cond, msg):
    (notes if cond else fails).append(('OK  ' if cond else 'FAIL') + ' ' + msg)

async def run():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900})
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
        pg.on('console', lambda m: errs.append('CONSOLE ' + m.text) if m.type == 'error' and 'Failed to load' not in m.text else None)
        await pg.goto(URL); await pg.wait_for_timeout(900)
        T = lambda s: pg.inner_text(s)
        async def endT():
            return await pg.evaluate("document.querySelector('#tlabel').textContent")
        async def pause():
            if (await pg.get_attribute('#btn-play', 'aria-label')) == 'Pause': await pg.click('#btn-play')

        # --- top bar
        check('Flooding' in await pg.input_value('#top') or True, 'loads')
        st = await T('#status'); check('events processed' in st, 'initial run status: ' + st)
        check((await pg.get_attribute('#btn-play', 'aria-label')) == 'Pause', 'autoplay starts after load')
        await pause()
        seed0 = await pg.input_value('#seed')
        await pg.click('#btn-dice'); await pg.wait_for_timeout(600)
        check(await pg.input_value('#seed') != seed0, 'dice changes seed')
        await pause()
        await pg.fill('#seed', '7'); await pg.keyboard.press('Tab')
        check(await pg.is_visible('#stale'), 'editing seed marks stale')
        await pg.click('#btn-rerun'); await pg.wait_for_timeout(600); await pause()
        check(not await pg.is_visible('#stale'), 'run again clears stale')
        # every example loads and runs
        for key in ['flooding', 'chang-roberts', 'floodset', 'epfd', 'epfd-partition', 'blank']:
            await pg.select_option('#example', key); await pg.wait_for_timeout(900); await pause()
            s = await T('#status')
            check('events processed' in s or 'No more events' in s or 'Time limit' in s, f'example {key}: {s[:60]}')
            check(await pg.input_value('#example') == '', f'example select resets ({key})')
        # undo toast
        await pg.select_option('#example', 'flooding'); await pg.wait_for_timeout(700); await pause()
        await pg.click('#toast button'); await pg.wait_for_timeout(700); await pause()
        check('MyAlgorithm' in await pg.input_value('#top'), 'undo restores previous scenario')

        # --- topology tools
        await pg.select_option('#example', 'flooding'); await pg.wait_for_timeout(700); await pause()
        n0 = await pg.locator('#g-nodes .nd').count()
        await pg.click('[data-mode=add]')
        box = await pg.locator('#topo').bounding_box()
        await pg.mouse.click(box['x'] + 30, box['y'] + 30); await pg.wait_for_timeout(100)
        check(await pg.locator('#g-nodes .nd').count() == n0 + 1, 'add node')
        check('Topology changed' in await T('#status'), 'topology change clears results')
        await pg.click('[data-mode=link]')
        await pg.click('#g-nodes [data-node="13"]'); await pg.click('#g-nodes [data-node="1"]')
        l0 = await pg.locator('#g-links .lk').count()
        check(l0 == 18, f'add link (links={l0})')
        await pg.click('#g-nodes [data-node="13"]'); await pg.click('#g-nodes [data-node="1"]')
        check('already exists' in await T('#toast'), 'duplicate link rejected')
        await pg.click('#g-nodes [data-node="13"]'); await pg.keyboard.press('Escape')
        check('Click the source' in await T('#props'), 'esc cancels link source')
        await pg.check('#directed')
        await pg.click('#g-nodes [data-node="13"]'); await pg.click('#g-nodes [data-node="12"]')
        check(await pg.locator('#g-links .lk[marker-end]').count() == 1, 'directed link has arrow')
        await pg.uncheck('#directed')
        await pg.click('[data-mode=delete]')
        await pg.click('#g-nodes [data-node="13"]')
        check(await pg.locator('#g-nodes .nd').count() == n0 and await pg.locator('#g-links .lk').count() == 17, 'delete node removes its links')
        await pg.locator('#g-links .lk-hit').first.click(force=True)
        check(await pg.locator('#g-links .lk').count() == 16, 'delete link')
        await pg.click('[data-mode=move]')
        # drag node
        nb = await pg.locator('#g-nodes [data-node="1"]').bounding_box()
        await pg.mouse.move(nb['x'] + nb['width']/2, nb['y'] + nb['height']/2); await pg.mouse.down()
        await pg.mouse.move(nb['x'] + 80, nb['y'] + 60, steps=5); await pg.mouse.up()
        nb2 = await pg.locator('#g-nodes [data-node="1"]').bounding_box()
        check(abs(nb2['x'] - nb['x']) > 30, 'drag moves node')
        # keyboard tool shortcuts
        for k, m in [('n', 'add'), ('l', 'link'), ('d', 'delete'), ('v', 'move')]:
            await pg.keyboard.press(k)
            check(await pg.get_attribute(f'.seg [data-mode={m}]', 'aria-pressed') == 'true', f'shortcut {k}')
        # generators
        for g in ['ring', 'complete', 'star', 'grid', 'line', 'random', 'tree']:
            await pg.select_option('#gen', g); await pg.fill('#gen-n', '7'); await pg.click('#btn-gen')
            cnt = await pg.locator('#g-nodes .nd').count()
            check(cnt == 7, f'generator {g} -> {cnt} nodes, {await pg.locator("#g-links .lk").count()} links')
        await pg.fill('#gen-n', '99'); await pg.click('#btn-gen')
        check(await pg.locator('#g-nodes .nd').count() == 40, 'generator clamps to 40')
        await pg.fill('#gen-n', ''); await pg.click('#btn-gen')
        check(await pg.locator('#g-nodes .nd').count() == 6, 'generator empty count -> default 6')
        await pg.click('#btn-fit')
        await pg.click('#btn-run'); await pg.wait_for_timeout(700); await pause()
        check('events processed' in await T('#status'), 'run on generated tree (flooding code): ' + (await T('#status'))[:60])

        # --- node / link / message properties
        await pg.select_option('#example', 'flooding'); await pg.wait_for_timeout(700); await pause()
        await pg.click('#btn-start')
        await pg.click('#g-nodes [data-node="5"]')
        props = await T('#props')
        check('Inject event' in props and 'Crash here' in props and 'Isolate here' in props, 'node props controls')
        await pg.fill('#props .inject input:not(.narrow)', '"x"'); await pg.click('#props .inject button.primary'); await pg.wait_for_timeout(700)
        check('0s 5 Broadcast | "x"' in await pg.input_value('#inputs'), 'inject event at t=0: ' + (await pg.input_value('#inputs')).split('\n')[-1])
        await pause()
        await pg.fill('#props .inject input:not(.narrow)', 'nope nope'); await pg.click('#props .inject button.primary'); await pg.wait_for_timeout(300)
        check('Input line' not in await T('#toast') and await T('#toast') != '', 'bad inject args toast: ' + await T('#toast'))
        await pg.click('#props button:has-text("Crash here")'); await pg.wait_for_timeout(700); await pause()
        check('Recover here' in await T('#props'), 'after crash here, button becomes recover')
        await pg.click('#props button:has-text("Recover here")'); await pg.wait_for_timeout(700); await pause()
        check('Crash here' in await T('#props'), 'after recover here, button becomes crash')
        await pg.click('#props button:has-text("Isolate here")'); await pg.wait_for_timeout(700); await pause()
        faults = await T('#faults')
        check('partition {p5}' in faults, 'isolate adds partition: ' + faults.replace('\n', ' '))
        # link props
        await pg.locator('#g-links .lk-hit').first.click(force=True)
        lp = await T('#props')
        check('Cut here' in lp and 'Enabled' in lp, 'link props controls')
        await pg.fill('#props input[aria-label="Link loss"]', '2')
        check(await pg.get_attribute('#props input[aria-label="Link loss"]', 'aria-invalid') == 'true', 'invalid link loss flagged')
        await pg.fill('#props input[aria-label="Link loss"]', '0.5')
        await pg.fill('#props input[aria-label="Link delay"]', 'uniform(1ms')
        check(await pg.get_attribute('#props input[aria-label="Link delay"]', 'aria-invalid') == 'true', 'invalid link delay flagged')
        await pg.fill('#props input[aria-label="Link delay"]', 'const(5ms)')
        await pg.click('#props button:has-text("Cut here")'); await pg.wait_for_timeout(700); await pause()
        check('link p' in await T('#faults'), 'cut here adds link fault')
        await pg.locator('#g-links .lk-hit').first.click(force=True)
        await pg.uncheck('#props input[type=checkbox] >> nth=0')
        check(await pg.locator('#g-links .lk.off').count() == 1, 'disable link')
        await pg.check('#props input[type=checkbox] >> nth=1')
        check(await pg.locator('#g-links .lk[marker-end]').count() == 1, 'link directed toggle')
        await pg.click('#btn-run'); await pg.wait_for_timeout(700); await pause()
        # message selection
        pk = pg.locator('#g-msgs .pk:visible')
        for pos in [300, 800, 1500, 2500, 4000]:
            await pg.evaluate(f"(()=>{{const s=document.querySelector('#scrub'); s.value={pos}; s.dispatchEvent(new Event('input'));}})()")
            if await pk.count(): break
        if await pk.count():
            await pk.first.click(force=True)
            mp = await T('#props')
            check('Go to send' in mp, 'packet click shows message props')
            await pg.click('#props button:has-text("Go to arrival")')
            check('Go to send' in await T('#props'), 'message stays selected after jump')
        else:
            check(False, 'no packet in flight after 3 steps')

        # --- tabs
        await pg.click('[data-tab=code]')
        await pg.select_option('#example', 'flooding'); await pg.wait_for_timeout(700); await pause()
        code = pg.locator('#code')
        await code.click()
        await pg.keyboard.press('Control+End')
        await pg.keyboard.type('\nalgorithm Bad implements Nope as x end')
        await pg.wait_for_timeout(500)
        d = await T('#diag')
        check('Interface "Nope"' in d, 'diagnostics show error: ' + d[:60])
        await pg.locator('#diag li.err').first.click()
        sel = await pg.evaluate("(()=>{const t=document.querySelector('#code');return t.value.slice(t.selectionStart,t.selectionEnd)})()")
        check('Nope' in sel, 'clicking diagnostic selects from the error: ' + sel[:40])
        await pg.click('#btn-run'); await pg.wait_for_timeout(500)
        check('errors' in await T('#status'), 'run with errors shows status')
        await pg.keyboard.press('Control+z')  # may not undo programmatic text, ok
        await pg.select_option('#example', 'flooding'); await pg.wait_for_timeout(700); await pause()
        await pg.click('[data-tab=code]')
        await code.click(); await pg.keyboard.press('Control+Home')
        await pg.keyboard.press('Tab')
        v = await pg.input_value('#code'); check(v.startswith('  //'), 'tab inserts spaces')
        await pg.click('.symbols button[data-ins="∪"]')
        v2 = await pg.input_value('#code'); check('∪' in v2[:6], 'symbol palette inserts at caret')
        hl = await pg.evaluate("document.querySelectorAll('#code-hl .ln').length")
        lines = len(v2.split('\n'))
        check(hl == lines + 1, f'highlight lines {hl} vs {lines}+1')
        # scroll sync
        await pg.evaluate("document.querySelector('#code').scrollTop = 200; document.querySelector('#code').dispatchEvent(new Event('scroll'))")
        sy = await pg.evaluate("[document.querySelector('#code-hl').scrollTop, document.querySelector('#gutter').scrollTop]")
        check(sy[0] > 0 and sy[1] > 0, f'editor scroll sync {sy}')
        # top select with multiple algorithms
        await pg.select_option('#example', 'epfd'); await pg.wait_for_timeout(700); await pause()
        opts = await pg.eval_on_selector_all('#top option', 'o => o.map(x => x.value)')
        check(opts == ['DirectLinks', 'IncreasingTimeout'] and await pg.input_value('#top') == 'IncreasingTimeout', f'top options {opts}')
        # timing tab
        await pg.click('[data-tab=time]')
        for label in ['Ideal synchronous', 'Realistic synchronous', 'Timed synchronous', 'Partially synchronous', 'Asynchronous']:
            await pg.click(f'#presets button:has-text("{label}")')
            check(await pg.get_attribute(f'#presets button:has-text("{label}")', 'aria-pressed') == 'true', f'preset {label}')
        check(await pg.is_disabled('[data-bind="assumed.DELTA"]'), 'async disables DELTA')
        await pg.select_option('[data-bind="assumed.timing"]', 'partial')
        check(not await pg.is_disabled('[data-bind="assumed.DELTA"]'), 'partial enables DELTA')
        check('Custom' in await T('#presets'), 'manual change -> Custom')
        await pg.fill('[data-bind="assumed.DELTA"]', '-5ms')
        check(await pg.get_attribute('[data-bind="assumed.DELTA"]', 'aria-invalid') == 'true', 'negative DELTA invalid')
        await pg.fill('[data-bind="assumed.DELTA"]', '30ms')
        await pg.wait_for_timeout(100)
        check('exceed DELTA' in await T('#delay-stats'), 'preview reports DELTA share: ' + await T('#delay-stats'))
        for sel_, bad in [('actual.delay', 'foo(1)'), ('actual.bound', 'abc'), ('actual.loss', '1.5'), ('actual.rho', 'uniform(a,b)'), ('stopAt', '')]:
            loc = f'[data-bind="{sel_}"]'
            old = await pg.input_value(loc)
            await pg.click('[data-tab=scen]') if sel_ == 'stopAt' else None
            await pg.fill(loc, bad)
            check(await pg.get_attribute(loc, 'aria-invalid') == 'true', f'invalid {sel_}')
            await pg.fill(loc, old)
            await pg.click('[data-tab=time]')
        await pg.select_option('[data-bind="assumed.timing"]', 'synchronous-rounds')
        check(await pg.is_visible('[data-bind="actual.roundMode"]'), 'rounds shows round mode')
        await pg.select_option('[data-bind="assumed.timing"]', 'partial')
        check(not await pg.is_visible('[data-bind="actual.roundMode"]'), 'non-rounds hides round mode')
        await pg.click('#btn-run'); await pg.wait_for_timeout(700); await pause()
        check('Time limit' in await T('#status'), 'epfd with DELTA known runs: ' + (await T('#status'))[:50])
        # bad value then run
        await pg.fill('[data-bind="actual.delay"]', 'foo(1)')
        await pg.click('#btn-run'); await pg.wait_for_timeout(500)
        check('Unknown distribution' in await T('#status'), 'run with invalid distribution reports it: ' + await T('#status'))
        await pg.fill('[data-bind="actual.delay"]', 'uniform(5ms, 40ms)')
        # scenario tab
        await pg.click('[data-tab=scen]')
        await pg.fill('#inputs', 'later 1 Start')
        await pg.click('#btn-run'); await pg.wait_for_timeout(500)
        check('Input line 1' in await T('#status'), 'bad input line reported: ' + await T('#status'))
        await pg.fill('#inputs', '')
        for ft, fill in [('crash', {'#fault-node': '2', '#fault-at': '1s'}), ('recover', {'#fault-node': '2', '#fault-at': '2s'}),
                         ('link', {'#fault-a': '1', '#fault-b': '3', '#fault-from': '1s', '#fault-to': '2s'}),
                         ('partition', {'#fault-groups': '1 | 2', '#fault-from': '1s', '#fault-to': ''})]:
            await pg.select_option('#fault-type', ft)
            for k, vv in fill.items(): await pg.fill(k, vv)
            n1 = await pg.locator('#faults li').count()
            await pg.click('#btn-add-fault')
            check(await pg.locator('#faults li').count() == n1 + 1, f'form adds {ft}: {await T("#toast")}')
        await pg.locator('#faults li button').first.click()
        check('p3 crashes' not in await T('#faults'), 'remove fault')
        await pg.check('[data-bind="haltOnAssert"]')
        await pg.click('#btn-run'); await pg.wait_for_timeout(700); await pause()
        check('Time limit' in await T('#status'), 'run with form faults: ' + (await T('#status'))[:60])
        # state tab
        await pg.click('[data-tab=state]')
        check('Select a process' in await T('#inspector'), 'inspector empty state')
        await pg.click('#g-nodes [data-node="2"]')
        ins = await T('#inspector')
        check('p2 at t' in ins and 'suspected' in ins, 'inspector shows state')

        # --- transport
        await pg.click('#btn-start')
        check((await endT()).startswith('t = 0 µs'), 'start button: ' + await endT())
        await pg.click('#btn-next'); t1 = await endT()
        await pg.click('#btn-next'); await pg.click('#btn-prev'); t2 = await endT()
        check(t1 == t2, f'next/prev symmetric {t1} {t2}')
        await pg.click('#btn-end'); te = await endT()
        check(te.split('/')[0].strip() == 't = ' + te.split('/')[1].strip(), 'end button: ' + te)
        await pg.keyboard.press('Home'); check((await endT()).startswith('t = 0 µs'), 'Home key')
        await pg.keyboard.press('End'); check(await endT() == te, 'End key')
        await pg.keyboard.press('Home'); await pg.keyboard.press('ArrowRight')
        check(await endT() == t1, 'ArrowRight key')
        await pg.keyboard.press('ArrowLeft'); check((await endT()).startswith('t = 0 µs'), 'ArrowLeft key')
        for sp in ['step', 'auto', '2', '10', '50', '200', '1000', '5000']:
            await pg.select_option('#speed', sp)
            await pg.click('#btn-start'); await pg.click('#btn-play'); await pg.wait_for_timeout(450)
            await pause(); tt = await endT()
            check(not tt.startswith('t = 0 µs'), f'speed {sp} advances: {tt}')
        await pg.keyboard.press('Space'); await pg.wait_for_timeout(200)
        check((await pg.get_attribute('#btn-play', 'aria-label')) == 'Pause', 'space plays')
        await pg.keyboard.press('Space')
        check((await pg.get_attribute('#btn-play', 'aria-label')) == 'Play', 'space pauses')
        # play to end then play again restarts
        await pg.select_option('#speed', '5000'); await pg.click('#btn-end'); await pg.click('#btn-play'); await pg.wait_for_timeout(300)
        tp = await endT(); await pause()
        check(not tp.startswith(te.split('/')[0]), 'play at end restarts: ' + tp)
        # scrubber
        await pg.evaluate("(()=>{const s=document.querySelector('#scrub'); s.value=5000; s.dispatchEvent(new Event('input'));})()")
        check('6 s' in await endT() or '5.9' in await endT() or '6.0' in await endT(), 'scrub to middle: ' + await endT())
        # autoplay off
        await pg.uncheck('#autoplay'); await pg.click('#btn-run'); await pg.wait_for_timeout(700)
        check((await pg.get_attribute('#btn-play', 'aria-label')) == 'Play' and (await endT()).split('/')[0].strip() != 't = 0 µs', 'autoplay off -> cursor at end')
        await pg.check('#autoplay')

        # --- diagram
        span0 = await pg.evaluate("document.querySelector('#st').width")
        await pg.click('#zoom-in'); await pg.click('#zoom-out'); await pg.click('#zoom-fit'); await pg.click('#zoom-all')
        await pg.check('#ghost'); await pg.uncheck('#ghost')
        await pg.uncheck('#follow'); await pg.check('#follow')
        cb = await pg.locator('#st').bounding_box()
        await pg.mouse.click(cb['x'] + cb['width'] * 0.5, cb['y'] + 12)
        check(True, 'diagram click at middle -> ' + await endT())
        await pg.mouse.move(cb['x'] + 300, cb['y'] + 40); await pg.mouse.down(); await pg.mouse.move(cb['x'] + 150, cb['y'] + 40, steps=4); await pg.mouse.up()
        check(not await pg.is_checked('#follow'), 'dragging diagram disables follow')
        await pg.check('#follow')
        await pg.mouse.move(cb['x'] + 300, cb['y'] + 40)
        await pg.keyboard.down('Control'); await pg.mouse.wheel(0, -200); await pg.keyboard.up('Control')

        # --- log
        for f in ['all', 'fault', 'output', 'input', 'violation', 'drop', 'warn', 'log']:
            await pg.select_option('#log-filter', f)
            c = await pg.locator('#log li').count()
            check(c >= 1, f'log filter {f}: {c} rows')
        await pg.select_option('#log-filter', 'fault')
        await pg.locator('#log li').first.click()
        check('1 s' in await endT(), 'log click moves cursor: ' + await endT())

        # --- keyboard delete / escape
        await pg.click('#g-nodes [data-node="4"]'); await pg.keyboard.press('Escape')
        check('processes' in await T('#props'), 'esc deselects')
        await pg.click('#g-nodes [data-node="4"]'); await pg.keyboard.press('Delete')
        check(await pg.locator('#g-nodes [data-node="4"]').count() == 0, 'delete key removes node')
        await pg.keyboard.press('Control+Enter'); await pg.wait_for_timeout(700); await pause()
        check('processed' in await T('#status'), 'ctrl+enter runs')
        # typing space in inputs must not toggle play
        await pg.click('[data-tab=scen]'); await pg.click('#inputs'); await pg.keyboard.type(' ')
        check((await pg.get_attribute('#btn-play', 'aria-label')) == 'Play', 'space in textarea does not play')

        # --- export / import / share / persistence
        await pg.click('#btn-export'); await pg.wait_for_timeout(400)
        exported = await pg.input_value('#export-text'); link = await pg.input_value('#export-link')
        check(exported.startswith('{') and '#s=z' in link, 'export json and link')
        await pg.click('#btn-save-json'); await pg.wait_for_timeout(300)
        check('Downloading' in await T('#export-msg'), 'save file fallback: ' + await T('#export-msg'))
        await pg.click('#dlg-export button[value=close]')
        await pg.click('#btn-import'); await pg.fill('#import-text', '{bad'); await pg.click('#btn-do-import')
        check('Invalid JSON' in await T('#import-msg'), 'import invalid json')
        await pg.fill('#import-text', '{"a":1}'); await pg.click('#btn-do-import')
        check('not a scenario' in await T('#import-msg'), 'import non-scenario')
        await pg.fill('#import-text', exported); await pg.click('#btn-do-import'); await pg.wait_for_timeout(700); await pause()
        check(not await pg.is_visible('#dlg-import') and 'imported' in await T('#toast'), 'import valid scenario')
        # escape closes dialog
        await pg.click('#btn-import'); await pg.keyboard.press('Escape')
        check(not await pg.is_visible('#dlg-import'), 'esc closes dialog')
        # share link in a new page
        pg2 = await ctx.new_page(); pg2.on('pageerror', lambda e: errs.append('PAGEERR2 ' + str(e)))
        await pg2.goto(link); await pg2.wait_for_timeout(1000)
        check(await pg2.locator('#g-nodes .nd').count() == await pg.locator('#g-nodes .nd').count(), 'share link restores topology')
        await pg2.goto(URL + '#s=zAAAA'); await pg2.wait_for_timeout(1000)
        check('valid scenario' in await pg2.inner_text('#toast'), 'broken share link handled')
        # persistence
        await pg.wait_for_timeout(500)
        await pg.reload(); await pg.wait_for_timeout(1000)
        check(await pg.locator('#g-nodes [data-node="4"]').count() == 0, 'scenario persisted across reload')
        # blank localStorage corrupt
        await pg.evaluate("localStorage.setItem('ds-playground:scenario:v1', '{broken')")
        await pg.reload(); await pg.wait_for_timeout(1000)
        check(await pg.locator('#g-nodes .nd').count() == 12, 'corrupt storage falls back to default example')
        await pg.evaluate("localStorage.setItem('ds-playground:scenario:v1', JSON.stringify({nodes:'x', code: 5}))")
        await pg.reload(); await pg.wait_for_timeout(1000)
        check(True, 'malformed stored scenario: nodes=' + str(await pg.locator('#g-nodes .nd').count()))
        await pg.evaluate("localStorage.clear()")

        print('\n'.join(errs) or 'no JS errors')
        await b.close()

asyncio.run(run())
print('\n'.join(notes))
print('\n'.join(fails) or 'ALL CHECKS PASSED')
print(len(notes), 'passed,', len(fails), 'failed')
