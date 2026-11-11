'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ledger', {
  load: () => ipcRenderer.invoke('ledger:load'),
  setPricing: (rows) => ipcRenderer.invoke('pricing:set', rows),
  profiles: {
    get: () => ipcRenderer.invoke('profiles:get'),
    save: (st) => ipcRenderer.invoke('profiles:save', st),
    plan: (p) => ipcRenderer.invoke('profiles:plan', p),
    apply: (id) => ipcRenderer.invoke('profiles:apply', id),
    detach: () => ipcRenderer.invoke('profiles:detach'),
    exportFile: (p) => ipcRenderer.invoke('profiles:export', p),
    importFile: () => ipcRenderer.invoke('profiles:import'),
  },
  inventory: () => ipcRenderer.invoke('inventory:get'),
  link: {
    analyze: (input) => ipcRenderer.invoke('link:analyze', input),
    install: (token, action) => ipcRenderer.invoke('link:install', { token, action }),
    assist: (token) => ipcRenderer.invoke('link:assist', token),
  },
  installs: {
    list: () => ipcRenderer.invoke('installs:list'),
    remove: (key) => ipcRenderer.invoke('installs:remove', key),
  },
  installFrom: (source, name) => ipcRenderer.invoke('plugin:installFrom', { source, name }),
  updatePlugin: (id) => ipcRenderer.invoke('plugin:update', id),
  addMcp: (name, config) => ipcRenderer.invoke('mcp:add', { name, config }),
  exportProject: (p) => ipcRenderer.invoke('profiles:exportProject', p),
  catalog: {
    plugins: () => ipcRenderer.invoke('catalog:plugins'),
    mcp: (q) => ipcRenderer.invoke('catalog:mcp', q),
    community: () => ipcRenderer.invoke('catalog:community'),
  },
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    set: (c) => ipcRenderer.invoke('config:set', c),
  },
  // contratos da especificação v1 (só canais da lista)
  api: (ch, ...args) => {
    const ALLOWED = ['db:status', 'db:ingest', 'sessions:list', 'sessions:get', 'sessions:timeline', 'sessions:eventPage', 'sessions:event',
      'diagnostics:list', 'diagnostics:recompute', 'diagnostics:feedback', 'efficiency:analyze', 'outcome:set', 'costs:summary', 'costs:reconciliation',
      'subscription:usage', 'changes:commits', 'changes:show', 'changes:files', 'changes:fileDiff', 'tags:set', 'topics:list', 'settings:get', 'settings:set',
      'admin:deleteSession', 'admin:deleteProject', 'admin:restore', 'statusline:install', 'statusline:uninstall', 'otel:set',
      'filters:options', 'agents:list', 'agents:detail', 'audit:overview', 'audit:responses', 'audit:tools', 'audit:errors', 'github:search', 'github:backend', 'app:openExternal', 'orchestra:overview', 'orchestra:agent', 'orchestra:setPath', 'orchestra:saveReport'];
    if (!ALLOWED.includes(ch)) return Promise.reject(new Error('canal não permitido: ' + ch));
    return ipcRenderer.invoke(ch, ...args);
  },
  onDbUpdated: (cb) => ipcRenderer.on('db:updated', (_e, d) => cb(d)),
  onDbProgress: (cb) => ipcRenderer.on('db:progress', (_e, d) => cb(d)),
  onProgress: (cb) => ipcRenderer.on('ledger:progress', (_e, p) => cb(p)),
});
