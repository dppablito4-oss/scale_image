// --- Constantes del sistema de papel Serie A (medidas en mm) ---
const A_SIZES = {
  'A0': { w: 841, h: 1189 },
  'A1': { w: 594, h: 841 },
  'A2': { w: 420, h: 594 },
  'A3': { w: 297, h: 420 },
  'A4': { w: 210, h: 297 },
  'A5': { w: 148, h: 210 },
  'A6': { w: 105, h: 148 },
  'A7': { w: 74, h: 105 },
  'A8': { w: 52, h: 74 },
  'A9': { w: 37, h: 52 },
  'A10': { w: 26, h: 37 }
};

const CANVAS_MM_W = 841; // A0 Ancho
const CANVAS_MM_H = 1189; // A0 Alto

// --- Configuración y Estado ---
const supabaseUrl = 'https://koptglmifwpzrfzvipnm.supabase.co';
const supabaseKey = 'sb_publishable_erAiat0Q6VFXk5gveRnj4A_3WKFzBzI';
const bucketName = 'imagenes-impresion';
const edgeFunctionUrl = 'https://koptglmifwpzrfzvipnm.supabase.co/functions/v1/scale-image';

let galleryImages = []; // { name, path, localUrl }
let selectedNode = null;
const scaleFactor = 1; // 1px = 1mm en las coordenadas virtuales de Konva

// --- Inicialización de Konva ---
const stage = new Konva.Stage({
  container: 'konva-container',
  width: CANVAS_MM_W * scaleFactor,
  height: CANVAS_MM_H * scaleFactor
});

const layer = new Konva.Layer();
stage.add(layer);

// Capa para las guías magnéticas
const guideLayer = new Konva.Layer();
stage.add(guideLayer);

// Transformador para cambiar tamaño/rotar
const transformer = new Konva.Transformer({
  boundBoxFunc: (oldBox, newBox) => {
    // Evitar que el elemento se colapse a tamaño negativo o cero
    if (newBox.width < 10 || newBox.height < 10) {
      return oldBox;
    }
    return newBox;
  },
  rotateEnabled: true,
  keepRatio: true,
  enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
  padding: 5
});
layer.add(transformer);

// --- Inicialización al Cargar la Página ---
window.addEventListener('DOMContentLoaded', () => {
  resizeViewport();
});

window.addEventListener('resize', resizeViewport);

// Ajustar escala visual del contenedor del lienzo
function resizeViewport() {
  const viewport = document.querySelector('.canvas-viewport');
  if (!viewport) return;
  
  const pad = 40;
  const vWidth = viewport.clientWidth - pad;
  const vHeight = viewport.clientHeight - pad;
  
  const scaleX = vWidth / (CANVAS_MM_W * scaleFactor);
  const scaleY = vHeight / (CANVAS_MM_H * scaleFactor);
  const scale = Math.min(scaleX, scaleY, 1);
  
  const container = document.getElementById('konva-container');
  container.style.transform = `scale(${scale})`;
  container.style.transformOrigin = 'center center';
}

// --- Notificaciones Toast ---
function showToast(message, isError = false) {
  const toast = document.getElementById('toast-notification');
  const text = document.getElementById('toast-message-text');
  
  text.textContent = message;
  toast.className = 'toast';
  if (isError) {
    toast.classList.add('toast-error');
  }
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}

// --- Subida de Imágenes a Supabase ---
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.style.borderColor = 'var(--accent)';
});

dropZone.addEventListener('dragleave', () => {
  dropZone.style.borderColor = 'var(--border-color)';
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.style.borderColor = 'var(--border-color)';
  if (e.dataTransfer.files.length > 0) {
    handleFiles(e.dataTransfer.files);
  }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) {
    handleFiles(fileInput.files);
  }
});

async function handleFiles(files) {
  const hasSupabase = (supabaseUrl && supabaseKey);
  
  if (!hasSupabase) {
    showToast('Modo Demo Local: Las imágenes se añadirán al lienzo pero no se subirán a Supabase.', false);
  }

  for (const file of files) {
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      showToast(`Archivo no soportado: ${file.name}. Solo se aceptan PNG y JPG.`, true);
      continue;
    }
    
    // Crear ID único de almacenamiento
    const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const storagePath = `uploads/${fileName}`;
    
    // Crear item visual
    const itemContainer = document.getElementById('image-list-container');
    const imageItemId = `img-item-${Date.now()}`;
    const localUrl = URL.createObjectURL(file);
    
    if (hasSupabase) {
      const itemHtml = `
        <div class="image-item uploading" id="${imageItemId}">
          <img class="item-thumb" src="${localUrl}">
          <div class="item-info">
            <div class="item-name">${file.name}</div>
            <div class="item-details">Subiendo...</div>
          </div>
        </div>
      `;
      itemContainer.insertAdjacentHTML('beforeend', itemHtml);
      
      try {
        // Subir vía Fetch API directo
        const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucketName}/${storagePath}`;
        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': `${supabaseKey}`
          },
          body: file
        });
        
        if (!response.ok) {
          throw new Error(await response.text());
        }
        
        // Actualizar item
        const itemEl = document.getElementById(imageItemId);
        itemEl.classList.remove('uploading');
        itemEl.querySelector('.item-details').textContent = 'Listo en la nube';
        
        // Agregar botón de acción
        const actionsHtml = `
          <button class="btn-secondary add-to-canvas-btn" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; width: auto; margin-top: 0.25rem;">Añadir</button>
        `;
        itemEl.querySelector('.item-info').insertAdjacentHTML('beforeend', actionsHtml);
        
        const newImgObject = {
          name: file.name,
          storagePath: storagePath,
          localUrl: localUrl
        };
        
        galleryImages.push(newImgObject);
        
        // Configurar evento de añadir al lienzo
        itemEl.querySelector('.add-to-canvas-btn').addEventListener('click', () => {
          activeImage = newImgObject;
          renderActiveImageSpiral();
        });
        
        showToast(`Imagen subida: ${file.name}`);
        updateGenerateButtonState();
        
      } catch (err) {
        console.error(err);
        document.getElementById(imageItemId)?.remove();
        showToast(`Error al subir ${file.name}: ${err.message}`, true);
      }
    } else {
      // Modo Demo Local (sin subir a Supabase)
      const itemHtml = `
        <div class="image-item" id="${imageItemId}">
          <img class="item-thumb" src="${localUrl}">
          <div class="item-info">
            <div class="item-name">${file.name}</div>
            <div class="item-details">Demo Local (No subido)</div>
            <button class="btn-secondary add-to-canvas-btn" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; width: auto; margin-top: 0.25rem;">Añadir</button>
          </div>
        </div>
      `;
      itemContainer.insertAdjacentHTML('beforeend', itemHtml);
      
      const newImgObject = {
        name: file.name,
        storagePath: storagePath, // Ruta simulada
        localUrl: localUrl
      };
      
      galleryImages.push(newImgObject);
      
      itemContainer.querySelector(`#${imageItemId} .add-to-canvas-btn`).addEventListener('click', () => {
        activeImage = newImgObject;
        renderActiveImageSpiral();
      });
      
      showToast(`Imagen lista localmente: ${file.name}`);
      updateGenerateButtonState();
    }
  }
}

// --- Gestión de Canvas / Elementos de Imposición (Distribución Automática) ---

let activeImage = null; // Guardará el objeto de imagen activo { name, storagePath, localUrl }

const spiralSlots = [
  { format: 'A1', x: 841, y: 0, w: 594, h: 841, rotation: 90 },
  { format: 'A2', x: 0, y: 594, w: 420, h: 594, rotation: 0 },
  { format: 'A3', x: 840, y: 594, w: 297, h: 420, rotation: 90 },
  { format: 'A4', x: 420, y: 891, w: 210, h: 297, rotation: 0 },
  { format: 'A5', x: 840, y: 891, w: 148, h: 210, rotation: 90 },
  { format: 'A6', x: 630, y: 1039, w: 105, h: 148, rotation: 0 },
  { format: 'A7', x: 840, y: 1039, w: 74, h: 105, rotation: 90 },
  { format: 'A8', x: 735, y: 1113, w: 52, h: 74, rotation: 0 },
  { format: 'A9', x: 839, y: 1113, w: 37, h: 52, rotation: 90 },
  { format: 'A10', x: 787, y: 1150, w: 26, h: 37, rotation: 0 }
];

function updateActiveImageUI(imgObj) {
  if (imgObj) {
    document.getElementById('active-thumb-container').innerHTML = `<img src="${imgObj.localUrl}" style="width: 100%; height: 100%; object-fit: cover;">`;
    document.getElementById('active-img-name').textContent = imgObj.name;
  } else {
    document.getElementById('active-thumb-container').innerHTML = '<span style="font-size: 1.25rem; color: var(--text-muted);">📷</span>';
    document.getElementById('active-img-name').textContent = 'Ninguna seleccionada';
  }
}

function renderActiveImageSpiral() {
  // Limpiar lienzo primero
  const items = stage.find('.impose-item');
  items.forEach(item => item.destroy());
  
  updateActiveImageUI(activeImage);
  
  if (!activeImage) {
    layer.draw();
    updateGenerateButtonState();
    updateCanvasStatusText();
    return;
  }
  
  const imageObj = new Image();
  imageObj.src = activeImage.localUrl;
  
  imageObj.onload = () => {
    spiralSlots.forEach(slot => {
      // Verificar si el checkbox para este formato está activo
      const isChecked = document.getElementById(`chk-${slot.format}`).checked;
      if (!isChecked) return;
      
      const konvaImg = new Konva.Image({
        image: imageObj,
        x: slot.x,
        y: slot.y,
        width: slot.w,
        height: slot.h,
        rotation: slot.rotation,
        draggable: false, // Deshabilitar arrastre
        stroke: '#b5b5b5', // Borde gris claro para guiar el corte (útil para PNGs transparentes)
        strokeWidth: 0.5,
        name: 'impose-item'
      });
      
      konvaImg.setAttr('storagePath', activeImage.storagePath);
      konvaImg.setAttr('originalName', activeImage.name);
      konvaImg.setAttr('currentFormat', slot.format);
      
      layer.add(konvaImg);
    });
    
    layer.draw();
    updateGenerateButtonState();
    updateCanvasStatusText();
  };
}

// --- Selección de Elementos (Desactivada para automático) ---
function selectNode(node) {
  selectedNode = null;
  transformer.nodes([]);
  layer.draw();
}

// Limpiar todo el lienzo
document.getElementById('btn-clear-canvas').addEventListener('click', () => {
  activeImage = null;
  document.getElementById('layout-limit-select').value = 'none';
  
  const formats = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10'];
  formats.forEach(f => {
    document.getElementById(`chk-${f}`).checked = false;
  });
  
  renderActiveImageSpiral();
  showToast('Lienzo limpiado.');
});

function updateCanvasStatusText() {
  const items = stage.find('.impose-item');
  const statusEl = document.getElementById('canvas-status');
  if (items.length === 0) {
    statusEl.textContent = 'Lienzo vacío';
  } else if (items.length === 1) {
    statusEl.textContent = '1 imagen en lienzo';
  } else {
    statusEl.textContent = `${items.length} imágenes en lienzo`;
  }
}

function updateGenerateButtonState() {
  const items = stage.find('.impose-item');
  document.getElementById('btn-generate-pdf').disabled = (items.length === 0);
}

// --- Configuración de los Controles Automáticos del Sidebar ---

// Escuchar cambios en el selector de rango de formatos
document.getElementById('layout-limit-select').addEventListener('change', (e) => {
  const limit = e.target.value;
  const formats = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10'];
  
  if (limit === 'none') {
    formats.forEach(f => {
      document.getElementById(`chk-${f}`).checked = false;
    });
  } else if (limit !== 'custom') {
    const limitIndex = formats.indexOf(limit);
    formats.forEach((f, index) => {
      document.getElementById(`chk-${f}`).checked = (index <= limitIndex);
    });
  }
  
  renderActiveImageSpiral();
});

// Escuchar cambios en los checkboxes individuales
const formatsList = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10'];
formatsList.forEach(f => {
  document.getElementById(`chk-${f}`).addEventListener('change', () => {
    // Si marcan/desmarcan algo manual, el selector pasa a 'Personalizado'
    document.getElementById('layout-limit-select').value = 'custom';
    renderActiveImageSpiral();
  });
});

// --- Compilar y Solicitar PDF ---
document.getElementById('btn-generate-pdf').addEventListener('click', async () => {
  const items = stage.find('.impose-item');
  if (items.length === 0) return;
  
  const btn = document.getElementById('btn-generate-pdf');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = 'Compilando PDF...';
  
  try {
    const MM_TO_PT = 2.83464567;
    const CANVAS_H_PT = 1189 * MM_TO_PT; // 3370.4 pt
    
    // Crear PDF en blanco tamaño A0
    const pdfDoc = await PDFLib.PDFDocument.create();
    const page = pdfDoc.addPage([841 * MM_TO_PT, CANVAS_H_PT]);
    
    // Obtener los bytes de la imagen activa
    const response = await fetch(activeImage.localUrl);
    const imageBytes = await response.arrayBuffer();
    
    // Incrustar la imagen según el formato
    const isPng = activeImage.name.toLowerCase().endsWith('.png');
    const embeddedImg = isPng 
      ? await pdfDoc.embedPng(imageBytes) 
      : await pdfDoc.embedJpg(imageBytes);
      
    // Dibujar cada elemento de imposición
    for (const item of items) {
      const format = item.getAttr('currentFormat');
      const slot = spiralSlots.find(s => s.format === format);
      if (!slot) continue;
      
      const wPt = slot.w * MM_TO_PT;
      const hPt = slot.h * MM_TO_PT;
      const xPt = slot.x * MM_TO_PT;
      
      // Inversión del eje Y (Web arriba-izquierda a PDF abajo-izquierda)
      const yPt = CANVAS_H_PT - (slot.y * MM_TO_PT) - hPt;
      
      let drawX = xPt;
      let drawY = yPt;
      const rotationAngle = slot.rotation;
      
      // Aplicar el pivote correcto según el ángulo de rotación
      if (rotationAngle === 90) {
        drawX = xPt - hPt;
        drawY = yPt + hPt;
      } else if (rotationAngle === 180) {
        drawX = xPt;
        drawY = yPt + 2 * hPt;
      } else if (rotationAngle === 270) {
        drawX = xPt + hPt;
        drawY = yPt + hPt;
      }
      
      // Estampar la imagen en el PDF
      page.drawImage(embeddedImg, {
        x: drawX,
        y: drawY,
        width: wPt,
        height: hPt,
        rotate: PDFLib.degrees(-rotationAngle)
      });
      
      // Dibujar un borde delgado gris alrededor de la imagen (guía de corte)
      page.drawRectangle({
        x: drawX,
        y: drawY,
        width: wPt,
        height: hPt,
        borderColor: PDFLib.rgb(0.7, 0.7, 0.7), // Gris claro
        borderWidth: 0.5,
        rotate: PDFLib.degrees(-rotationAngle)
      });
    }
    
    // Guardar e iniciar descarga
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `impresion_A0_${Date.now()}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    showToast('¡PDF de Imposición generado con éxito localmente!');
  } catch (err) {
    console.error(err);
    showToast(`Error al compilar PDF: ${err.message}`, true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
});
