import path from "node:path";
import { fileURLToPath } from "node:url";
import { runNativeBuild } from "../../native-bindings/scripts/build-native";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

runNativeBuild({ packageRoot });
