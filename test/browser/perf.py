import asyncio, json, sys
from playwright.async_api import async_playwright
from common import URL, launcher
MEASURE = """async (ms) => {
  const deltas = []; let last = performance.now(); let long = 0;
  const po = new PerformanceObserver(l => { for (const e of l.getEntries()) long += e.duration; });
  try { po.observe({ entryTypes: ['longtask'] }); } catch (e) {}
  await new Promise(res => { const end = last + ms; function f(t) { deltas.push(t - last); last = t; if (t < end) requestAnimationFrame(f); else res(); } requestAnimationFrame(f); });
  po.disconnect();
  deltas.sort((a, b) => a - b);
  const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  return { frames: deltas.length, avgMs: +avg.toFixed(1), p95: +deltas[Math.floor(deltas.length * 0.95)].toFixed(1), longTaskMs: Math.round(long) };
}"""
async def scenario(pg, label, setup):
    await setup(pg)
    await pg.click('#btn-start')
    await pg.select_option('#speed', 'auto')
    await pg.click('#btn-play')
    r = await pg.evaluate(MEASURE, 3000)
    if (await pg.get_attribute('#btn-play', 'aria-label')) == 'Pause': await pg.click('#btn-play')
    print(label, json.dumps(r))
async def main():
    async with async_playwright() as p:
        b = await launcher(p).launch()
        pg = await (await b.new_context(viewport={'width': 1440, 'height': 900})).new_page()
        await pg.goto(URL); await pg.wait_for_timeout(900)
        await pg.click('#btn-play')
        async def flood(pg): pass
        await scenario(pg, 'flooding 12 nodes      ', flood)
        async def big(pg):
            await pg.select_option('#gen', 'complete'); await pg.fill('#gen-n', '40'); await pg.click('#btn-gen')
            await pg.click('#btn-run'); await pg.wait_for_timeout(1500)
            if (await pg.get_attribute('#btn-play', 'aria-label')) == 'Pause': await pg.click('#btn-play')
            print('   status:', await pg.inner_text('#status'), '|', (await pg.inner_text('#chips')).replace('\n', ' '))
        await scenario(pg, 'flooding complete 40   ', big)
        async def state(pg):
            await pg.click('[data-tab=state]'); await pg.click('#g-nodes [data-node="3"]')
        await scenario(pg, '  + state tab open     ', state)
        async def epfd(pg):
            await pg.select_option('#example', 'epfd-partition'); await pg.wait_for_timeout(1200)
            if (await pg.get_attribute('#btn-play', 'aria-label')) == 'Pause': await pg.click('#btn-play')
            await pg.select_option('#speed', '1000')
        await scenario(pg, 'epfd-partition          ', epfd)
        # run time of the simulation itself
        t = await pg.evaluate("""() => { const t0 = performance.now(); const s = JSON.parse(localStorage.getItem('ds-playground:scenario:v1')); SimCore.runSimulation(s); return performance.now() - t0; }""")
        print('simulation time epfd-partition ms', round(t))
        await b.close()
asyncio.run(main())
