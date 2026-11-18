// Standalone generation worker. Run alongside the web app when
// PERSONA3D_IN_PROCESS_WORKER=false (e.g. Vercel web + a long-running worker host).
//   npm run worker
import { startRunner } from "../src/server/jobs/runner";

startRunner();
console.log("[worker] Persona3D generation worker running. Ctrl+C to stop.");
process.on("SIGTERM", () => process.exit(0));
