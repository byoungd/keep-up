import path from "node:path";
import { fileURLToPath } from "node:url";
import { runNapiBuild } from "../../native-bindings/scripts/build-napi";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

runNapiBuild({ packageRoot, cargoCwd: "native" });
