// Browser tooling is optional and is never loaded by the shipped application.
let runtime;
try {runtime=require(process.env.PATCHLINE_PLAYWRIGHT_MODULE || 'playwright');}
catch {
  // Codex's managed workstation runtime; portable users install Playwright.
  try {runtime=require(require('node:path').join(require('node:os').homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
  catch {throw new Error('Browser verification requires Playwright. Install with npm install --no-save playwright, then use your installed Chrome browser.');}
}
module.exports=runtime;
