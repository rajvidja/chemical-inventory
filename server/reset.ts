import { rmSync } from "node:fs";
import { DATA_DIR } from "./db";

rmSync(DATA_DIR, { recursive: true, force: true });
console.log(`Removed ${DATA_DIR}. The original spreadsheet will be re-imported on next start.`);
