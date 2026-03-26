import fs from "fs";
import path from "path";

const logoPath = path.join(process.cwd(), "data", "assets", "pluginbrands-logo-white.webp");
const logoBuffer = fs.readFileSync(logoPath);
export const PB_LOGO_WHITE_BASE64 = `data:image/webp;base64,${logoBuffer.toString("base64")}`;
