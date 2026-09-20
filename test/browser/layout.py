import asyncio, json
from playwright.async_api import async_playwright
from common import URL
VP = [('phone-s', 320, 640, True), ('phone', 375, 667, True), ('phone-l', 414, 896, True), ('phone-land', 844, 390, True),
      ('tablet', 768, 1024, True), ('tablet-land', 1024, 768, True), ('laptop-s', 1280, 720, False), ('laptop', 1366, 768, False),
      ('desktop', 1440, 900, False), ('fhd', 1920, 1080, False), ('qhd', 2560, 1440, False)]
AUDIT = """() => {
  const W = document.documentElement.clientWidth, out = { W, scrollW: document.documentElement.scrollWidth, over: [], small: [], clipped: [] };
  const skip = el => el.closest('#topo, #topo-fx, .ed-main, .log, .st-wrap, dialog, .symbols') || (el.closest('.tabs') && el.tagName === 'BUTTON' && el.closest('.tabs').scrollWidth > el.closest('.tabs').clientWidth && false);
  for (const el of document.querySelectorAll('body *')) {
    if (skip(el)) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || getComputedStyle(el).display === 'none' || el.closest('[hidden]')) continue;
    if (r.right > W + 1 || r.left < -1) out.over.push(el.tagName + (el.id ? '#' + el.id : '') + '.' + el.className + '[' + el.textContent.trim().slice(0,10) + ']' + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
    if (el.matches('button, select, input:not([type=checkbox])') && r.height < 30 && matchMedia('(pointer: coarse)').matches) out.small.push((el.id || el.textContent.trim().slice(0, 12)) + ' ' + Math.round(r.height));
    if (el.matches('.panel-bar, .transport, .st-bar, .props, .toolbar') && el.scrollWidth > el.clientWidth + 1) out.clipped.push(el.className);
  }
  const box = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
  out.topo = box('#topo'); out.side = box('.side'); out.editor = box('.editor'); out.diagram = box('#st-wrap'); out.log = box('#log'); out.transport = box('.transport');
  out.docH = document.documentElement.scrollHeight;
  return out;
}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for name, w, h, touch in VP:
            ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=touch, is_mobile=touch and w < 900)
            pg = await ctx.new_page()
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(URL); await pg.wait_for_timeout(1200)
            a = await pg.evaluate(AUDIT)
            print(f"== {name} {w}x{h}  scrollW={a['scrollW']} docH={a['docH']} topo={a['topo']} side={a['side']} diagram={a['diagram']} log={a['log']}")
            for k in ['over', 'small', 'clipped']:
                if a[k]: print('  ', k, a[k][:8], '...' if len(a[k]) > 8 else '')
            if errs: print('  ERR', errs)
            await pg.screenshot(path=f'r_{name}.png', full_page=True)
            await ctx.close()
        await b.close()
asyncio.run(main())
