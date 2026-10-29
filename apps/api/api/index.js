// Vercel serverless entry point for the API.
//
// Vercel compiles files in this folder into functions; vercel.json rewrites every
// path here, so Express keeps doing the routing. The app is imported from the tsup
// bundle (dist/app.js) because that bundle already contains the @tsm/shared
// workspace package, which ships TypeScript source that Node cannot load directly.
//
// Plain JavaScript on purpose: this file sits outside the TypeScript project and
// must not depend on dist/ existing at typecheck time.
import { createApp } from '../dist/app.js';

// One app per cold start, reused by every request the instance serves.
export default createApp();
