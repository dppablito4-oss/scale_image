import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { PDFDocument, degrees } from "https://cdn.skypack.dev/pdf-lib?dts"

const MM_TO_PT = 2.83464567
const CANVAS_H_PT = 1189 * MM_TO_PT // 3370.4 pt

// Cabeceras para Cross-Origin Resource Sharing (CORS)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

Deno.serve(async (req) => {
  // Manejo de la petición OPTIONS para CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Validar método HTTP
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: "Método no permitido. Utilizar POST." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 405
      })
    }

    const { items } = await req.json()
    
    if (!items || !Array.isArray(items)) {
      return new Response(JSON.stringify({ error: "Datos de entrada inválidos. Se requiere el arreglo 'items'." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400
      })
    }

    // Inicializar cliente administrativo de Supabase usando variables de entorno globales de la Edge Function
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Crear PDF en blanco tamaño A0
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([841 * MM_TO_PT, CANVAS_H_PT])

    // Procesar secuencialmente para respetar los límites de memoria serverless (150 MB)
    for (const item of items) {
      console.log(`Procesando archivo desde storage: ${item.storage_path}`)

      // 1. Descargar la imagen desde el Storage de Supabase
      const { data, error } = await supabaseAdmin.storage
        .from('imagenes-impresion')
        .download(item.storage_path)

      if (error) {
        throw new Error(`Error descargando la imagen (${item.storage_path}) del storage: ${error.message}`)
      }

      // Convertir a ArrayBuffer
      const imageBytes = await data.arrayBuffer()
      
      // 2. Validar formato e incrustar la imagen
      const pathLower = item.storage_path.toLowerCase()
      const isPng = pathLower.endsWith('.png')
      const isJpg = pathLower.endsWith('.jpg') || pathLower.endsWith('.jpeg')

      if (!isPng && !isJpg) {
        throw new Error(`Tipo de archivo no soportado por pdf-lib para (${item.storage_path}). Solo se aceptan PNG y JPG/JPEG.`)
      }

      const embeddedImg = isPng 
        ? await pdfDoc.embedPng(imageBytes) 
        : await pdfDoc.embedJpg(imageBytes)

      // 3. Convertir coordenadas a Puntos PostScript
      const wPt = item.width_mm * MM_TO_PT
      const hPt = item.height_mm * MM_TO_PT
      const xPt = item.x_mm * MM_TO_PT
      
      // Inversión del eje Y (Web arriba-izquierda a PDF abajo-izquierda)
      const yPt = CANVAS_H_PT - (item.y_mm * MM_TO_PT) - hPt

      // Coordenadas base de dibujo final
      let drawX = xPt
      let drawY = yPt
      
      // Normalizar rotación de forma segura
      const rotationAngle = ((item.rotation_deg || 0) % 360 + 360) % 360

      // 4. Adaptación matemática de rotación (Giro horario en web -> Giro antihorario en pdf-lib)
      // Ajuste de los puntos de anclaje de rotación (Konva.js rota respecto a esquina superior izquierda, pdf-lib respecto a inferior izquierda)
      if (rotationAngle === 90) {
        drawX = xPt - hPt
        drawY = yPt + hPt
      } else if (rotationAngle === 180) {
        drawX = xPt
        drawY = yPt + 2 * hPt
      } else if (rotationAngle === 270) {
        drawX = xPt + hPt
        drawY = yPt + hPt
      }

      // Estampar imagen en el lienzo PDF
      page.drawImage(embeddedImg, {
        x: drawX,
        y: drawY,
        width: wPt,
        height: hPt,
        rotate: degrees(-rotationAngle) // Cambiar signo para convertir sentido horario a antihorario
      })
    }

    // 5. Compilar PDF y generar bytes
    const pdfBytes = await pdfDoc.save()
    
    return new Response(pdfBytes, {
      headers: { 
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=impresion_A0.pdf"
      },
      status: 200
    })

  } catch (err) {
    console.error("Error en ejecución de Edge Function:", err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    })
  }
})
