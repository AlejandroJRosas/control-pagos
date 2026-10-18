use serde::Serialize;

#[derive(Serialize, Debug, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct Caja {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OcrPalabra {
    pub texto: String,
    pub caja: Caja,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OcrLinea {
    pub texto: String,
    pub palabras: Vec<OcrPalabra>,
    pub caja: Caja,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OcrResultado {
    pub lineas: Vec<OcrLinea>,
    pub ancho: u32,
    pub alto: u32,
}

/// Reconoce el texto de una imagen (PNG/JPG/WEBP en bytes) con el OCR integrado de Windows.
#[cfg(windows)]
pub fn reconocer(bytes: &[u8]) -> Result<OcrResultado, String> {
    use windows::Globalization::Language;
    use windows::Graphics::Imaging::{
        BitmapAlphaMode, BitmapDecoder, BitmapInterpolationMode, BitmapPixelFormat, BitmapTransform,
        ColorManagementMode, ExifOrientationMode,
    };
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::Streams::{DataWriter, InMemoryRandomAccessStream};
    use windows::core::HSTRING;

    let leer = |e: windows::core::Error| format!("No se pudo leer la imagen: {}", e.message());

    let stream = InMemoryRandomAccessStream::new().map_err(leer)?;
    let writer = DataWriter::CreateDataWriter(&stream).map_err(leer)?;
    writer.WriteBytes(bytes).map_err(leer)?;
    writer.StoreAsync().map_err(leer)?.get().map_err(leer)?;
    writer.FlushAsync().map_err(leer)?.get().map_err(leer)?;
    writer.DetachStream().map_err(leer)?;
    stream.Seek(0).map_err(leer)?;

    let decoder = BitmapDecoder::CreateAsync(&stream).map_err(leer)?.get().map_err(leer)?;
    let (ancho, alto) = (decoder.PixelWidth().map_err(leer)?, decoder.PixelHeight().map_err(leer)?);
    let max = OcrEngine::MaxImageDimension().map_err(leer)?;
    let escala = (max as f64 / ancho.max(alto) as f64).min(1.0);
    let (ancho, alto) = (
        ((ancho as f64 * escala) as u32).max(1),
        ((alto as f64 * escala) as u32).max(1),
    );
    let transform = BitmapTransform::new().map_err(leer)?;
    transform.SetScaledWidth(ancho).map_err(leer)?;
    transform.SetScaledHeight(alto).map_err(leer)?;
    transform.SetInterpolationMode(BitmapInterpolationMode::Fant).map_err(leer)?;
    let bitmap = decoder
        .GetSoftwareBitmapTransformedAsync(
            BitmapPixelFormat::Bgra8,
            BitmapAlphaMode::Premultiplied,
            &transform,
            ExifOrientationMode::RespectExifOrientation,
            ColorManagementMode::DoNotColorManage,
        )
        .map_err(leer)?
        .get()
        .map_err(leer)?;

    let engine = ["es", "es-ES", "es-VE"]
        .iter()
        .find_map(|tag| {
            let lang = Language::CreateLanguage(&HSTRING::from(*tag)).ok()?;
            OcrEngine::TryCreateFromLanguage(&lang).ok()
        })
        .or_else(|| OcrEngine::TryCreateFromUserProfileLanguages().ok())
        .ok_or_else(|| {
            "No hay reconocimiento de texto instalado en Windows. Instala el idioma español con \
             'Reconocimiento óptico de caracteres' en Configuración > Hora e idioma > Idioma."
                .to_string()
        })?;

    let ocr = |e: windows::core::Error| format!("Error del reconocimiento de texto: {}", e.message());
    let resultado = engine.RecognizeAsync(&bitmap).map_err(ocr)?.get().map_err(ocr)?;
    let mut lineas = Vec::new();
    for linea in resultado.Lines().map_err(ocr)? {
        let mut palabras = Vec::new();
        for palabra in linea.Words().map_err(ocr)? {
            let r = palabra.BoundingRect().map_err(ocr)?;
            palabras.push(OcrPalabra {
                texto: palabra.Text().map_err(ocr)?.to_string(),
                caja: Caja { x: r.X, y: r.Y, w: r.Width, h: r.Height },
            });
        }
        let caja = union(palabras.iter().map(|p| p.caja));
        lineas.push(OcrLinea { texto: linea.Text().map_err(ocr)?.to_string(), palabras, caja });
    }
    Ok(OcrResultado { lineas, ancho, alto })
}

#[cfg(not(windows))]
pub fn reconocer(_bytes: &[u8]) -> Result<OcrResultado, String> {
    Err("El OCR solo está disponible en Windows".into())
}

#[cfg_attr(not(windows), allow(dead_code))]
fn union(cajas: impl Iterator<Item = Caja>) -> Caja {
    let (mut x0, mut y0, mut x1, mut y1) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
    for c in cajas {
        x0 = x0.min(c.x);
        y0 = y0.min(c.y);
        x1 = x1.max(c.x + c.w);
        y1 = y1.max(c.y + c.h);
    }
    if x0 > x1 {
        return Caja { x: 0.0, y: 0.0, w: 0.0, h: 0.0 };
    }
    Caja { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bytes_que_no_son_imagen_dan_error_en_espanol() {
        let e = reconocer(b"no es una imagen").unwrap_err();
        assert!(e.contains("imagen"), "{e}");
    }
}
