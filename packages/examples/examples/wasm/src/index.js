// Due to a bug of how brfs interacts with babel, we need to use require() syntax instead of import pattern
// https://github.com/browserify/brfs/issues/39
const fs = require('fs');
const { ethErrors } = require('eth-rpc-errors');

// Ref:
// - https://developer.mozilla.org/en-US/docs/WebAssembly/Using_the_JavaScript_API
// - https://github.com/mdn/webassembly-examples/tree/06556204f687c00a5d9d3ab55805204cbb711d0c/js-api-examples

let wasm;

const initializeWasm = async () => {
  try {
    // This will be resolved to a buffer with the file contents at build time.
    // The path to the file must be in a string literal prefixed with __dirname
    // in order for brfs to resolve the file correctly.
    // eslint-disable-next-line node/no-sync, node/no-path-concat
    const wasmBuffer = fs.readFileSync(`${__dirname}/../build/program.wasm`);
    wasm = await WebAssembly.instantiate(wasmBuffer);
  } catch (error) {
    console.error('Failed to initialize WebAssembly module.', error);
    throw error;
  }
};

wallet.registerRpcMessageHandler(async (_originString, requestObject) => {
  if (!wasm) {
    await initializeWasm();
  }

  if (wasm.instance.exports[requestObject.method]) {
    return wasm.instance.exports[requestObject.method](...requestObject.params);
  }
  throw ethErrors.rpc.methodNotFound({ data: { request: requestObject } });
});
