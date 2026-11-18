import { init } from "./src/modules/bench/index.js";

(async () => {
    await init();

    process.exit(process.exitCode ?? 0);
})();