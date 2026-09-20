/* Distributed Systems Playground — batch worker.
   Runs one simulation per message, with the same engine as the page. It never touches the DOM. */
'use strict';
/*__WORKER_LIBS__*/
self.onmessage = function (e) {
  const { scenario, seed, minimize } = e.data;
  try {
    if (minimize) {
      self.postMessage(Object.assign({ seed, minimized: true }, SimRunner.minimize(scenario, { seed, faults: minimize })));
      return;
    }
    const res = SimRunner.runBatch(scenario, { seeds: [seed] });
    self.postMessage(res.runs[0]);
  } catch (err) {
    self.postMessage({
      seed, ok: false, error: String(err && err.message || err), errorLine: null, compileErrors: [], warnings: [],
      stopReason: null, endT: 0, eventCount: 0, messages: 0, byStatus: {}, delivered: 0, lost: 0, violations: 0,
      assertions: 0, properties: [], propertyFailures: 0, outputs: [], outputCount: 0, nodesWithOutput: 0
    });
  }
};
