// Local smoke test for the create_job handler.
// Mocks fetch and module dependencies — no live API or deployment needed.
// Run: node connectors/workflowmax/test-create-job.cjs

'use strict';

const Module = require('module');
const path = require('path');

// ---------------------------------------------------------------------------
// 1. Patch module resolution BEFORE any requires
// ---------------------------------------------------------------------------
const SHARED_KEY = '__mock_shared__';

const zodField = () => {
  const f = {};
  ['optional', 'describe', 'min', 'max', 'uuid', 'email', 'url', 'array', 'boolean'].forEach(m => { f[m] = () => f; });
  return f;
};
const zodMock = { z: { string: zodField, number: zodField, boolean: zodField, array: zodField, object: zodField, enum: zodField } };

const ZOD_KEY = '__mock_zod__';
const MCP_KEY = '__mock_mcp__';

// Minimal ConnectorError mock matching the real class interface
class ConnectorError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
  toToolResult() {
    return { content: [{ type: 'text', text: this.message }], isError: true };
  }
}
const sharedMock = { ConnectorError };

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, parent, isMain, opts) {
  if (req === '@custom-connectors/shared') return SHARED_KEY;
  if (req === 'zod') return ZOD_KEY;
  if (req.startsWith('@modelcontextprotocol/sdk')) return MCP_KEY;
  return origResolve.call(this, req, parent, isMain, opts);
};

// Pre-populate cache for synthetic module keys that can't be resolved to real paths
const makeCache = (id, exports) => ({ id, filename: id, loaded: true, exports, parent: null, children: [], paths: [] });
require.cache[SHARED_KEY] = makeCache(SHARED_KEY, sharedMock);
require.cache[ZOD_KEY] = makeCache(ZOD_KEY, zodMock);
require.cache[MCP_KEY] = makeCache(MCP_KEY, { McpServer: class {} });

// ---------------------------------------------------------------------------
// 2. Mock fetch
// ---------------------------------------------------------------------------
let lastPostUrl = null;
let lastPostBody = null;

global.fetch = async (url, options = {}) => {
  const method = options.method || 'GET';
  const makeHeaders = () => ({ entries: () => Object.entries({}) });

  if (url.includes('/job-status')) {
    // Simulate status endpoint not available
    return { ok: false, status: 404, text: async () => '{"message":"Not found"}', headers: makeHeaders() };
  }
  if (method === 'POST' && url.includes('/jobs')) {
    lastPostUrl = url;
    lastPostBody = JSON.parse(options.body || '{}');
    return { ok: true, json: async () => ({ id: 'new-job-uuid-123', jobname: lastPostBody.jobname }) };
  }
  return { ok: true, json: async () => ({}) };
};

// ---------------------------------------------------------------------------
// 3. Environment + load modules
// ---------------------------------------------------------------------------
process.env.WFM_ACCOUNT_ID = 'test-org-id';

const { registerTools } = require('./dist/tools.js');

// ---------------------------------------------------------------------------
// 4. Capture create_job handler via mock McpServer
// ---------------------------------------------------------------------------
let createJobHandler = null;
const mockServer = {
  tool: (name, _desc, _schema, handler) => {
    if (name === 'create_job') createJobHandler = handler;
  },
};
registerTools(mockServer);

if (!createJobHandler) {
  console.error('❌ create_job handler not found after registerTools');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 5. Run handler and assert
// ---------------------------------------------------------------------------
(async () => {
  const fakeToken = 'header.eyJzdWIiOiJ0ZXN0In0.sig'; // valid 3-part JWT shape (account-id from env)
  const fakeExtra = { authInfo: { token: fakeToken } };

  await createJobHandler(
    {
      name: 'Test Job',
      client_id: '9bef86c1-cd82-4879-9333-89b33ec978e9',
      template_id: '9d1b83c5-ff1d-4e6a-9b3c-5233c4abb7ae',
      start_date: '2026-04-22',
      due_date: '2026-05-06',
      // intentionally omitting status_id — fallback UUID must kick in
    },
    fakeExtra
  );

  let pass = true;

  const assert = (cond, label, got) => {
    if (cond) { console.log(`✓ ${label}`); }
    else { console.error(`❌ ${label} — got: ${JSON.stringify(got)}`); pass = false; }
  };

  if (!lastPostBody) {
    console.error('❌ No POST to /jobs was made — handler returned early');
    process.exit(1);
  }

  assert(lastPostBody.jobname === 'Test Job',                          'jobname maps correctly',      lastPostBody.jobname);
  assert(lastPostBody.clientuuid === '9bef86c1-cd82-4879-9333-89b33ec978e9', 'clientuuid maps correctly', lastPostBody.clientuuid);
  assert(lastPostBody.priority === 'Normal',                           'priority defaults to Normal', lastPostBody.priority);
  assert(lastPostBody.statusuuid === '9bef861f-0d89-4151-88ff-99fc9767277d', 'statusuuid uses org fallback UUID', lastPostBody.statusuuid);
  assert(!lastPostBody.name,     'name key absent (not sent to API)',     lastPostBody.name);
  assert(!lastPostBody.clientId, 'clientId key absent (not sent to API)', lastPostBody.clientId);

  if (pass) {
    console.log('\n✅ All assertions passed — create_job sends correct fields');
  } else {
    console.log('\nPOST body was:', JSON.stringify(lastPostBody, null, 2));
    process.exit(1);
  }
})();
