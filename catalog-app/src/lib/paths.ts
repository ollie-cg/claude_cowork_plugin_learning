import path from "path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

export const IMAGES_DIR = path.join(DATA_DIR, "images");
export const ASSETS_DIR = path.join(DATA_DIR, "assets");
