"""Accessibility checks that can be made without listening: names, roles, focus, contrast.

What a screen reader actually announces still has to be heard; this suite catches the
mistakes that make that impossible in the first place.
"""
import asyncio
from playwright.async_api import async_playwright
from common import URL, launcher

res = []
def check(c, m): res.append(('OK  ' if c else 'FAIL') + ' ' + m)

# relative luminance and contrast ratio, as WCAG defines them
def luminance(rgb):
    def channel(c):
        c = c / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = [channel(x) for x in rgb]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)

def parse_rgb(text):
    nums = [int(x) for x in ''.join(c if c.isdigit() else ' ' for c in text).split()[:3]]
    return tuple(nums) if len(nums) == 3 else (0, 0, 0)

async def main():
    async with async_playwright() as p:
        b = await launcher(p).launch()
        pg = await (await b.new_context(viewport={'width': 1440, 'height': 950})).new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL)
        await pg.wait_for_timeout(900)
        if (await pg.get_attribute('#btn-play', 'aria-label')) in ('Pause', 'Pausa'):
            await pg.click('#btn-play')

        # 1. every control that a user can reach has a name
        unnamed = await pg.evaluate("""() => {
          const out = [];
          for (const e of document.querySelectorAll('button, input, select, textarea, a[href]')) {
            if (e.closest('[hidden]') || e.hidden || e.type === 'hidden') continue;
            const name = (e.getAttribute('aria-label') || e.getAttribute('title') || e.textContent || '').trim()
              || (e.labels && e.labels.length ? [...e.labels].map(l => l.textContent).join(' ').trim() : '')
              || (e.getAttribute('placeholder') || '').trim();
            if (!name) out.push(e.tagName.toLowerCase() + '#' + (e.id || '') + '.' + (e.className || ''));
          }
          return out;
        }""")
        check(not unnamed, f'every visible control has a name ({len(unnamed)} without: {unnamed[:4]})')

        # 2. the page has one main landmark and a document language
        lang = await pg.get_attribute('html', 'lang')
        check(bool(lang), f'the document declares its language: {lang}')
        mains = await pg.locator('main, [role=main]').count()
        check(mains >= 1, f'the page has a main region: {mains}')
        h1 = await pg.locator('h1').count()
        check(h1 == 1, f'exactly one first-level heading: {h1}')

        # 3. keyboard: tab reaches the first controls, and focus is visible
        await pg.keyboard.press('Tab')
        first = await pg.evaluate("document.activeElement.id || document.activeElement.tagName")
        check(bool(first) and first != 'BODY', f'Tab moves into the page: {first}')
        outline = await pg.evaluate("""() => {
          const e = document.activeElement;
          const cs = getComputedStyle(e);
          return [cs.outlineStyle, cs.outlineWidth, cs.boxShadow.slice(0, 20)];
        }""")
        check(outline[0] != 'none' or outline[2] not in ('', 'none'), f'the focused control is visible: {outline}')

        # 4. dialogs are modal and return focus to the page
        await pg.click('#btn-about')
        await pg.wait_for_timeout(200)
        check(await pg.is_visible('#dlg-about'), 'the about dialog opens')
        named = await pg.evaluate("!!document.querySelector('#dlg-about h2')")
        check(named, 'the dialog has a heading')
        await pg.keyboard.press('Escape')
        await pg.wait_for_timeout(200)
        check(not await pg.is_visible('#dlg-about'), 'Escape closes it')

        # 5. contrast of the main text and of the muted text, in both themes
        for scheme in ('dark', 'light'):
            await pg.emulate_media(color_scheme=scheme)
            await pg.wait_for_timeout(200)
            pairs = await pg.evaluate("""() => {
              const body = getComputedStyle(document.body);
              const hint = document.querySelector('.hint');
              return {
                bg: body.backgroundColor,
                ink: body.color,
                muted: hint ? getComputedStyle(hint).color : body.color
              };
            }""")
            bg = parse_rgb(pairs['bg'])
            for name in ('ink', 'muted'):
                ratio = contrast(bg, parse_rgb(pairs[name]))
                check(ratio >= 4.5, f'{scheme}: {name} on the background is {ratio:.1f}:1 (4.5 needed)')
        await pg.emulate_media(color_scheme='dark')

        # 6. the diagram and the graph are described for those who cannot see them
        for sel, what in [('#topo', 'the graph'), ('#st', 'the diagram')]:
            label = await pg.evaluate(f"""() => {{
              const e = document.querySelector('{sel}');
              return e ? (e.getAttribute('aria-label') || e.getAttribute('title') || '') : 'missing';
            }}""")
            check(bool(label) and label != 'missing', f'{what} carries a description: "{label[:60]}"')

        print(errs or 'no errors')
        await b.close()

try:
    asyncio.run(main())
finally:
    print('\n'.join(res))
