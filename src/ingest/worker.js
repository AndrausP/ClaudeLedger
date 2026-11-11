'use strict';
// Ingestão fora da thread principal: node:sqlite é síncrono e travaria a interface.
const { parentPort, workerData } = require('worker_threads');
const { open } = require('../db');
const { ingestAll } = require('./transcripts');

let db;
try {
  db = open(workerData.dbPath);
  const result = ingestAll(db, workerData.root, workerData.pricing, (d, t) => parentPort.postMessage({ type: 'progress', d, t }));
  parentPort.postMessage({ type: 'done', result });
} catch (err) {
  parentPort.postMessage({ type: 'error', error: err.message });
} finally {
  if (db) db.close();
}
