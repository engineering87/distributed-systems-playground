import asyncio, json, base64, zlib
from playwright.async_api import async_playwright
from common import URL
res=[]
def check(c,m): res.append(('OK  ' if c else 'FAIL')+' '+m)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width':1440,'height':900})
        pg = await ctx.new_page(); errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('dialog', lambda d: errs.append('DIALOG ' + d.message))
        await pg.goto(URL); await pg.wait_for_timeout(800)
        if (await pg.get_attribute('#btn-play','aria-label'))=='Pause': await pg.click('#btn-play')
        # 1. markup typed in the editor stays text
        payload = '// </span><img src=x onerror="window.__xss=1"><script>window.__xss=2</script>\n"<b onmouseover=window.__xss=3>"'
        await pg.click('[data-tab=code]'); await pg.fill('#code', payload); await pg.wait_for_timeout(500)
        n = await pg.evaluate("document.querySelectorAll('#code-hl img, #code-hl script, #code-hl b, #gutter *:not(span)').length")
        x = await pg.evaluate("window.__xss")
        txt = await pg.evaluate("document.querySelector('#code-hl').textContent")
        check(n == 0 and x is None and '<img src=x' in txt, f'editor markup stays text (elements {n}, flag {x})')
        # 2. imported JSON cannot reach Object.prototype or the scenario prototype
        scn = await pg.evaluate("JSON.stringify(window.SimExamples.EXAMPLES[0].scenario)")
        evil = scn[:-1] + ',"__proto__":{"polluted":"yes","code":"hijack"},"assumed":{"timing":"asynchronous","__proto__":{"polluted2":1}},"constructor":{"prototype":{"polluted3":1}}}'
        await pg.click('#btn-import'); await pg.fill('#import-text', evil); await pg.click('#btn-do-import'); await pg.wait_for_timeout(800)
        r = await pg.evaluate("[({}).polluted, ({}).polluted2, ({}).polluted3, Object.prototype.hasOwnProperty('polluted')]")
        check(r == [None, None, None, False], f'import does not pollute prototypes {r}')
        check(await pg.locator('#g-nodes .nd').count() == 12, 'malicious-looking import still loads the scenario')
        stored = await pg.evaluate("localStorage.getItem('ds-playground:scenario:v1')")
        check('__proto__' not in stored and 'polluted' not in stored, 'unsafe keys are not stored')
        # 3. shared link with the same payload
        raw = zlib.compressobj(9, zlib.DEFLATED, -15); data = raw.compress(evil.encode()) + raw.flush()
        link = URL + '#s=z' + base64.urlsafe_b64encode(data).decode().rstrip('=')
        pg2 = await ctx.new_page(); pg2.on('pageerror', lambda e: errs.append(str(e)))
        await pg2.goto(link); await pg2.wait_for_timeout(1000)
        r2 = await pg2.evaluate("[({}).polluted, ({}).polluted2, ({}).polluted3]")
        check(r2 == [None, None, None] and await pg2.locator('#g-nodes .nd').count() == 12, f'shared link is sanitized {r2}')
        # 4. stored settings with unsafe or unknown values
        await pg2.evaluate("""localStorage.setItem('ds-playground:settings', '{"__proto__":{"polluted4":1},"theme":"<b>","lang":"it"}')""")
        await pg2.reload(); await pg2.wait_for_timeout(800)
        r3 = await pg2.evaluate("[({}).polluted4, document.documentElement.getAttribute('data-theme'), document.documentElement.lang]")
        check(r3 == [None, None, 'it'], f'settings are validated {r3}')
        await pg2.evaluate("localStorage.removeItem('ds-playground:settings')")
        # 5. translation blocks switch back and forth without losing content
        await pg.click('#btn-settings'); await pg.select_option('#set-lang', 'it'); await pg.select_option('#set-lang', 'en'); await pg.select_option('#set-lang', 'it'); await pg.select_option('#set-lang', 'en'); await pg.keyboard.press('Escape')
        g = await pg.evaluate("document.querySelector('.guide-body').textContent")
        check('A program contains' in g and 'Built-ins' in g, 'guide restored after repeated switches')
        # 6. downloaded JSON comes from the state, even if the text box was edited
        await pg.click('#btn-export'); await pg.wait_for_timeout(300)
        await pg.evaluate("document.querySelector('#export-text').value = '<html><script>alert(1)</script></html>'")
        async with pg.expect_download() as dl:
            await pg.click('#btn-save-json')
        d = await dl.value; path = 'sec_export.json'; await d.save_as(path)
        content = open(path).read()
        check(content.lstrip().startswith('{') and '<script>' not in content, 'saved file is the scenario JSON from state')
        # 7. exported images never carry script or event handlers
        await pg.keyboard.press('Escape')
        await pg.click('[data-tab=code]')
        evil_code = '''interface T
  request Go()
  indication Out(x)
end
algorithm A
  implements T as t
  uses Net as net
  upon event ⟨t, Go⟩ do
    trigger ⟨t, Out | "</text><script>window.__svg=1</script><g onload=window.__svg=2>"⟩
    trigger ⟨net, Send | 2, "</text><script>alert(1)</script>"⟩
  end
end'''
        await pg.fill('#code', evil_code)
        await pg.click('[data-tab=scen]'); await pg.fill('#inputs', '0ms 1 Go')
        await pg.click('#btn-run'); await pg.wait_for_timeout(900)
        if (await pg.get_attribute('#btn-play','aria-label'))=='Pause': await pg.click('#btn-play')
        await pg.keyboard.press('End')
        await pg.evaluate("""(() => {
          const g = document.querySelector('#g-nodes .nd');
          g.setAttribute('onclick', 'window.__svg=3');
          const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
          fo.setAttribute('width', '10'); fo.setAttribute('height', '10');
          fo.innerHTML = '<div xmlns="http://www.w3.org/1999/xhtml">injected</div>';
          g.append(fo);
          const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
          img.setAttribute('href', 'javascript:window.__svg=4');
          g.append(img);
        })()""")
        await pg.click('#btn-export'); await pg.wait_for_timeout(300)
        for bid, ext in [('#btn-img-diagram-svg','svg'), ('#btn-img-graph-svg','svg')]:
            async with pg.expect_download() as dl:
                await pg.click(bid)
            d = await dl.value; path = 'sec_' + bid[9:] + '.' + ext; await d.save_as(path)
            body = open(path, encoding='utf-8').read()
            clean = '<script' not in body.lower() and 'onload=' not in body.lower() and 'onclick' not in body.lower()
            check(clean and len(body) > 500, f'{bid}: exported image carries no script or handlers ({len(body)} bytes)')
            check('<script' not in body.lower() and ('&lt;' in body or 'script' not in body.lower()),
                  f'{bid}: payload text is escaped, not markup')
            check('foreignobject' not in body.lower() and 'javascript:' not in body.lower() and '<image' not in body.lower(),
                  f'{bid}: injected elements are dropped')
        await pg.keyboard.press('Escape')
        print(errs or 'no errors')
        await b.close()
asyncio.run(main())
print('\n'.join(res))
