1. Análisis de Pros y Contras del Stack TecnológicoArquitectura: Frontend Estático (GitHub Pages) + Backend Serverless (Supabase Storage & Edge Functions en TypeScript/Deno).Ventas (Pros)Costo mensual $0$: Tanto GitHub Pages como el plan gratuito de Supabase cubren de sobra las necesidades de desarrollo y producción de bajo/mediano volumen.Consumo mínimo de RAM: Al compilar un PDF vectorial en lugar de renderizar un mapa de bits (JPG/PNG) de $10,000 \times 14,000$ píxeles, el servidor procesa archivos de pocos megabytes. Esto evita que la Edge Function o el navegador del cliente se colguen por falta de memoria.Un solo lenguaje de programación: Todo el ecosistema se desarrolla en JavaScript/TypeScript, lo que facilita el mantenimiento y la reutilización de lógica entre el cliente y el servidor.Precisión milimétrica: Los PDFs manejan unidades de medida físicas absolutas (puntos PostScript), garantizando que un A4 mida exactamente $210 \times 297\text{ mm}$ al pasar al plotter de impresión.
Desventajas (Contras)
Arranque en frío (Cold Starts): Las Edge Functions de Supabase pueden tardar entre 1 y 3 segundos en responder si no han recibido peticiones recientes (se inactivan para ahorrar recursos).

Límite de tiempo de ejecución: Las funciones serverless tienen un tiempo límite de ejecución (usualmente entre 30 y 60 segundos). Si el usuario sube 50 imágenes extremadamente pesadas en un solo PDF, la función podría expirar.

Curva de aprendizaje con Deno: Aunque es TypeScript, Deno gestiona las librerías mediante URLs directas en lugar de un archivo package.json tradicional, lo que requiere adaptarse a su manejo de dependencias.
Especificaciones Matemáticas y Sistema de CoordenadasPara que la imposición sea exacta, el sistema debe traducir las coordenadas del monitor (píxeles en una pantalla web) a medidas físicas de impresión dentro del PDF final.El Sistema de Puntos del PDFEl formato PDF no utiliza píxeles ni milímetros de forma nativa; utiliza puntos PostScript (pt). La relación estándar es de 72 puntos por pulgada. Sabiendo que una pulgada equivale a $25.4\text{ mm}$, calculamos el factor de conversión exacto ($F$):$$F = \frac{72}{25.4} \approx 2.83464567\text{ pt/mm}$$
Dimensiones del Lienzo A0 en el PDFAplicando el factor de conversión al tamaño estándar del papel A0 ($841 \times 1189\text{ mm}$), obtenemos las dimensiones del documento que procesará el backend:$$W_{A0} = 841 \times 2.83464567 = 2383.93 \approx 2384\text{ pt}$$$$H_{A0} = 1189 \times 2.83464567 = 3370.40 \approx 3370\text{ pt}$$Inversión del Eje YEn la Web (Canvas): El origen $(0,0)$ se encuentra en la esquina superior izquierda. El eje Y crece hacia abajo.En el PDF (pdf-lib): El origen $(0,0)$ se encuentra en la esquina inferior izquierda. El eje Y crece hacia arriba.Para posicionar una imagen correctamente, el Backend debe transformar la coordenada $Y_{\text{web}}$ calculada por el Frontend usando la siguiente ecuación:$$Y_{\text{pdf}} = H_{A0} - Y_{\text{web}} - H_{\text{elemento}}$$Donde $H_{A0}$ es el alto total del lienzo ($3370\text{ pt}$) y $H_{\text{elemento}}$ es el alto de la imagen que se va a estampar.3. Modelo de Datos (JSON de Comunicación)Cuando el usuario termina de acomodar sus bloques en la web, el Frontend genera y envía este contrato de datos hacia la Edge Function de Supabase:

{
  "job_id": "print-job-2026-xyz",
  "canvas_width_mm": 841,
  "canvas_height_mm": 1189,
  "items": [
    {
      "storage_path": "uploads/foto_alta_res_1.jpg",
      "format_target": "A1",
      "x_mm": 0,
      "y_mm": 0,
      "width_mm": 594,
      "height_mm": 841,
      "rotation_deg": 0
    },
    {
      "storage_path": "uploads/diseño_afiche.png",
      "format_target": "A2",
      "x_mm": 594,
      "y_mm": 0,
      "width_mm": 420,
      "height_mm": 594,
      "rotation_deg": 90
    }
  ]
}

4. Guía de Implementación Paso a PasoPaso 1: El Lienzo Interactivo en el FrontendPara la interfaz de usuario en GitHub Pages, utilizaremos Konva.js por su alto rendimiento manejando transformaciones y contenedores a escala.Escalar el Lienzo: No puedes dibujar un canvas de $10,000\text{ px}$ en el navegador. Si tu contenedor web mide $841\text{ px}$ de ancho, tu factor de escala en pantalla es exactamente de $1\text{ px} = 1\text{ mm}$.Snapping Magnético: Al arrastrar una imagen, el código de JavaScript debe redondear sus coordenadas (X, Y) para que se "imanten" a los bordes de la cuadrícula de la serie A (evitando espacios vacíos accidentales).Paso 2: Subida Directa a Supabase StoragePara evitar saturar la memoria del cliente, las imágenes pesadas se suben directamente desde el navegador al Storage de Supabase antes de procesar el layout.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient('TU_SUPABASE_URL', 'TU_ANON_KEY')

async function uploadImage(file) {
  const { data, error } = await supabase.storage
    .from('imagenes-impresion')
    .upload(`uploads/${Date.now()}_${file.name}`, file)
  
  if (error) console.error('Error al subir:', error)
  return data.path // Esta ruta se guardará en el JSON del layout
}
Paso 3: La Edge Function del Servidor (TypeScript + Deno)
Esta función corre en Supabase de forma aislada. Descarga los archivos crudos del Storage, lee el mapa de coordenadas enviado por el cliente y genera el empaquetado final en PDF.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { PDFDocument } from "https://cdn.skypack.dev/pdf-lib?dts"

const MM_TO_PT = 2.83464567
const CANVAS_H_PT = 1189 * MM_TO_PT // 3370.4 pt

serve(async (req) => {
  try {
    const { items } = await req.json()
    
    // Inicializar Supabase interno
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Crear PDF en blanco tamaño A0
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([841 * MM_TO_PT, CANVAS_H_PT])

    for (const item of items) {
      // 1. Descargar la imagen original desde el Storage
      const { data, error } = await supabaseAdmin.storage
        .from('imagenes-impresion')
        .download(item.storage_path)

      if (error) throw error

      const imageBytes = await data.arrayBuffer()
      
      // 2. Incrustar en el documento según el tipo de archivo
      const isPng = item.storage_path.toLowerCase().endsWith('.png')
      const embeddedImg = isPng 
        ? await pdfDoc.embedPng(imageBytes) 
        : await pdfDoc.embedJpg(imageBytes)

      // 3. Convertir medidas a Puntos PostScript
      const xPt = item.x_mm * MM_TO_PT
      const wPt = item.width_mm * MM_TO_PT
      const hPt = item.height_mm * MM_TO_PT
      
      // Aplicar inversión del eje Y
      const yPt = CANVAS_H_PT - (item.y_mm * MM_TO_PT) - hPt

      // 4. Dibujar en el lienzo PDF
      page.drawImage(embeddedImg, {
        x: xPt,
        y: yPt,
        width: wPt,
        height: hPt,
        rotate: item.rotation_deg ? { angle: item.rotation_deg } : undefined
      })
    }

    // 5. Compilar PDF y retornar bytes
    const pdfBytes = await pdfDoc.save()
    return new Response(pdfBytes, {
      headers: { 
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=impresion_A0.pdf"
      },
      status: 200
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500
    })
  }
})
