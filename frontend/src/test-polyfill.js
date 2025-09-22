/**
 * Polyfills for Jest test environment
 * This file must be loaded before any other imports
 */

// TextEncoder/TextDecoder polyfill for Node.js < 20
if (typeof globalThis.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}

// Additional polyfills can be added here if needed