import asyncio
from playwright.async_api import async_playwright
from common import URL, launcher
res=[]
def check(c,m): res.append(('OK  ' if c else 'FAIL')+' '+m)
async def main():
    async with async_playwright() as p:
        b = await launcher(p).launch()
        pg = await (await b.new_context(viewport={'width':1440,'height':950})).new_page()
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(900)
        if (await pg.get_attribute('#btn-play','aria-label')) in ('Pause','Pausa'): await pg.click('#btn-play')
        await pg.select_option('#example','flooding'); await pg.wait_for_timeout(900)
        if (await pg.get_attribute('#btn-play','aria-label')) in ('Pause','Pausa'): await pg.click('#btn-play')
        await pg.click('[data-tab=code]')
        code = await pg.input_value('#code')
        # completion of an instance inside the event tuple
        await pg.fill('#code', code + '\n// test\n')
        await pg.click('#code')
        await pg.keyboard.press('Control+End')
        await pg.keyboard.type('algorithm X implements Flood as fb uses Net as net\n  upon event ⟨n')
        await pg.wait_for_timeout(400)
        items = await pg.locator('#complete .ci').count()
        first = await pg.inner_text('#complete .ci.sel') if items else ''
        check(items >= 1 and 'net' in first, f'instance completion offers the instances: {items}, first "{first.strip()}"')
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(200)
        line = (await pg.input_value('#code')).split('\n')[-1]
        check(line.endswith('⟨net'), 'accepting inserts the name: ' + line[-20:])
        # events of that interface
        await pg.keyboard.type(', D')
        await pg.wait_for_timeout(400)
        evs = await pg.evaluate("[...document.querySelectorAll('#complete .ct')].map(e => e.textContent)")
        check('Deliver' in evs, f'event completion offers the interface events: {evs}')
        await pg.keyboard.press('Escape')
        check(await pg.is_hidden('#complete'), 'Escape closes the popup')
        # Ctrl+Space anywhere
        await pg.keyboard.type('\n')
        await pg.keyboard.press('Control+Space'); await pg.wait_for_timeout(300)
        check(await pg.locator('#complete .ci').count() > 0, 'Ctrl+Space opens the list')
        await pg.keyboard.press('Escape')
        # quick fix: undeclared variable
        await pg.fill('#code', 'interface T\n  request Go()\n  indication Out(x)\nend\n\nalgorithm A\n  implements T as t\n  uses Net as net\n\n  upon event ⟨t, Go⟩ where counter > 0 do\n    skip\n  end\nend\n')
        await pg.wait_for_timeout(600)
        fix = pg.locator('#diag button.fix')
        check(await fix.count() >= 1, f'a diagnostic offers a fix: {await fix.count()}')
        label = await fix.first.inner_text()
        await fix.first.click(); await pg.wait_for_timeout(600)
        after = await pg.input_value('#code')
        check('state' in after and 'counter := nil' in after, f'"{label}" declares the variable: ' + [l for l in after.split('\n') if 'counter :=' in l].__str__())
        errors_left = await pg.locator('#diag li.err').count()
        check(errors_left == 0, f'no errors left after the fix: {errors_left}')
        # quick fix: missing handler warning
        await pg.fill('#code', 'interface T\n  request Go()\n  indication Out(x)\nend\n\nalgorithm A\n  implements T as t\n  uses Net as net\n\n  upon event ⟨t, Go⟩ do\n    trigger ⟨net, Send | 2, [PING]⟩\n  end\nend\n')
        await pg.wait_for_timeout(600)
        diag = await pg.inner_text('#diag')
        fixes = pg.locator('#diag button.fix')
        if await fixes.count():
            await fixes.first.click(); await pg.wait_for_timeout(700)
            code2 = await pg.input_value('#code')
            line = [l for l in code2.split('\n') if 'Deliver' in l]
            check('upon event ⟨net, Deliver | p, m⟩ do' in code2, 'the handler is inserted with its arguments: ' + str(line))
            check(await pg.locator('#diag li.err').count() == 0, 'the inserted handler compiles')
        else:
            check(False, 'no fix offered for: ' + diag[:80])
        print(errs or 'no errors')
        await b.close()
try:
    asyncio.run(main())
finally:
    print('\n'.join(res))
