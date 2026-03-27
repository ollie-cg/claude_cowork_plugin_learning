import fs from "fs";
import path from "path";
import { ASSETS_DIR } from "./paths";

const logoPath = path.join(ASSETS_DIR, "pluginbrands-logo-white.webp");
const logoBuffer = fs.readFileSync(logoPath);
export const PB_LOGO_WHITE_BASE64 = `data:image/webp;base64,${logoBuffer.toString("base64")}`;
