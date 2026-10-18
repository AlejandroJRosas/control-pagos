import { invoke } from "@tauri-apps/api/core";
import type { OcrEngine, OcrResultado } from "./types";

/** OCR integrado de Windows (comando Rust `ocr_imagen`, ver src-tauri/src/ocr.rs). */
export const windowsOcr: OcrEngine = {
  async reconocer(imagen) {
    return invoke<OcrResultado>("ocr_imagen", new Uint8Array(await imagen.arrayBuffer()));
  },
};
