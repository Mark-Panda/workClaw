/**
 * Self-test for the FlowDocument ↔ DSL converter.
 * Simulates a loop + rest_client structure to verify no nodes are lost.
 */

// Simulate the converter logic inline for standalone testing
// We import from the actual TypeScript source via ts-node or just re-implement

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Try to load the compiled JS or use tsx
let converter;
try {
  converter = require('./src/pages/Rules/FlowEditor/converter.ts');
} catch {
  // Try tsx
  const { execSync } = await import('child_process');
  console.log('Trying tsx...');
}

// Simulate the DSL structure for a loop chain
const testDsl = {
  chain_id: 'test-chain',
  version: '1.0',
  nodes: [
    { id: 'start', type: 'start', config: {} },
    { id: 'loop_1', type: 'loop', config: { iterator_source: 'items', loop_var: 'item', max_iterations: 100 } },
    { id: 'rest_client_1', type: 'rest_client', config: { method: 'POST', url: 'https://example.com/api', timeout_ms: 10000 } },
    { id: 'end', type: 'end', config: {} },
  ],
  edges: [
    { from: 'start', to: 'loop_1' },
    { from: 'loop_1', to: 'rest_client_1' },
    { from: 'rest_client_1', to: 'end' },
  ],
  interceptors: [],
};

console.log('=== Test DSL ===');
console.log(JSON.stringify(testDsl, null, 2));
console.log(`\nNodes: ${testDsl.nodes.map(n => n.id).join(', ')}`);
console.log(`Edges: ${testDsl.edges.map(e => `${e.from}→${e.to}`).join(', ')}`);

// Now run through the converter
// The converter is in TypeScript, so we need to compile it first
// Let's check if tsc output exists
