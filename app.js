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
          addImageToCanvas(newImgObject);
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
        addImageToCanvas(newImgObject);
      });
      
      showToast(`Imagen lista localmente: ${file.name}`);
      updateGenerateButtonState();
    }
  }
}

// --- Gestión de Canvas / Elementos de Imposición ---

function addImageToCanvas(imgObj) {
  const imageObj = new Image();
  imageObj.src = imgObj.localUrl;
  
  imageObj.onload = () => {
    // Determinar tamaño inicial predeterminado (por ejemplo, A4)
    const defaultFormat = 'A4';
    const dimensions = A_SIZES[defaultFormat];
    
    // Proporciones de la imagen cargada
    const imgRatio = imageObj.width / imageObj.height;
    const formatRatio = dimensions.w / dimensions.h;
    
    let targetW = dimensions.w;
    let targetH = dimensions.h;
    
    // Adaptar orientación de la imagen
    if ((imgRatio > 1 && formatRatio < 1) || (imgRatio < 1 && formatRatio > 1)) {
      // Invertir ancho/alto si las orientaciones no coinciden
      targetW = dimensions.h;
      targetH = dimensions.w;
    }
    
    const konvaImg = new Konva.Image({
      image: imageObj,
      x: 20,
      y: 20,
      width: targetW,
      height: targetH,
      draggable: true,
      name: 'impose-item'
    });
    
    // Guardar ruta de supabase en metadatos del nodo
    konvaImg.setAttr('storagePath', imgObj.storagePath);
    konvaImg.setAttr('originalName', imgObj.name);
    konvaImg.setAttr('currentFormat', defaultFormat);
    
    // Eventos del elemento
    konvaImg.on('dragmove', () => {
      applySnapping(konvaImg);
      updateDetailsPanel(konvaImg);
    });
    
    konvaImg.on('transform', () => {
      // Evitar distorsión descontrolada
      updateDetailsPanel(konvaImg);
    });
    
    konvaImg.on('transformend', () => {
      konvaImg.setAttr('currentFormat', 'custom');
      updateDetailsPanel(konvaImg);
    });
    
    // Evento de click/tap para seleccionar
    konvaImg.on('mousedown touchstart', (e) => {
      selectNode(konvaImg);
      e.cancelBubble = true;
    });
    
    layer.add(konvaImg);
    selectNode(konvaImg);
    layer.draw();
    
    showToast(`Elemento agregado al lienzo como ${defaultFormat}`);
    updateGenerateButtonState();
    updateCanvasStatusText();
  };
}

// --- Selección de Elementos ---
function selectNode(node) {
  selectedNode = node;
  if (node) {
    transformer.nodes([node]);
    updateDetailsPanel(node);
    document.getElementById('details-panel').style.display = 'block';
  } else {
    transformer.nodes([]);
    document.getElementById('details-panel').style.display = 'none';
  }
  layer.draw();
}

// Deseleccionar al hacer click en el lienzo vacío
stage.on('mousedown touchstart', (e) => {
  if (e.target === stage) {
    selectNode(null);
  }
});

// Actualizar panel de detalles
function updateDetailsPanel(node) {
  if (!node) return;
  
  // Calcular dimensiones visuales con escala aplicada por el transformador
  const w = Math.round(node.width() * node.scaleX());
  const h = Math.round(node.height() * node.scaleY());
  const x = Math.round(node.x());
  const y = Math.round(node.y());
  const rotation = Math.round(node.rotation() % 360);
  
  document.getElementById('detail-width').textContent = `${w} mm`;
  document.getElementById('detail-height').textContent = `${h} mm`;
  document.getElementById('detail-x').textContent = `${x} mm`;
  document.getElementById('detail-y').textContent = `${y} mm`;
  document.getElementById('detail-rotation').textContent = `${rotation}°`;
  
  const currentFormat = node.getAttr('currentFormat') || 'custom';
  document.getElementById('detail-format').value = currentFormat;
}

// Rotación del elemento seleccionado
document.getElementById('btn-rotate-item').addEventListener('click', () => {
  if (!selectedNode) return;
  const currentRot = selectedNode.rotation();
  selectedNode.rotation((currentRot + 90) % 360);
  
  // Ajustar escala si se rota (opcional, para mantener el aspecto)
  layer.draw();
  updateDetailsPanel(selectedNode);
});

// Escuchar cambios en el selector de formato
document.getElementById('detail-format').addEventListener('change', (e) => {
  if (!selectedNode) return;
  const newFormat = e.target.value;
  if (newFormat === 'custom') return;
  
  const dimensions = A_SIZES[newFormat];
  if (!dimensions) return;
  
  selectedNode.setAttr('currentFormat', newFormat);
  
  // Preservar la orientación original de la imagen
  const imageObj = selectedNode.image();
  const imgRatio = imageObj.width / imageObj.height;
  const formatRatio = dimensions.w / dimensions.h;
  
  let targetW = dimensions.w;
  let targetH = dimensions.h;
  
  if ((imgRatio > 1 && formatRatio < 1) || (imgRatio < 1 && formatRatio > 1)) {
    targetW = dimensions.h;
    targetH = dimensions.w;
  }
  
  selectedNode.width(targetW);
  selectedNode.height(targetH);
  selectedNode.scaleX(1);
  selectedNode.scaleY(1);
  
  layer.draw();
  updateDetailsPanel(selectedNode);
  showToast(`Elemento redimensionado al formato ${newFormat}`);
});

// Eliminar elemento del lienzo
document.getElementById('btn-delete-item').addEventListener('click', () => {
  if (!selectedNode) return;
  const name = selectedNode.getAttr('originalName');
  selectedNode.destroy();
  selectNode(null);
  layer.draw();
  showToast(`Eliminado del lienzo: ${name}`);
  updateGenerateButtonState();
  updateCanvasStatusText();
});

// Limpiar todo el lienzo
document.getElementById('btn-clear-canvas').addEventListener('click', () => {
  const items = stage.find('.impose-item');
  items.forEach(item => item.destroy());
  selectNode(null);
  layer.draw();
  showToast('Lienzo limpiado.');
  updateGenerateButtonState();
  updateCanvasStatusText();
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

// --- Snapping Magnético (Guías inteligentes) ---
const SNAP_THRESHOLD = 8; // distancia de atracción en mm

function applySnapping(activeNode) {
  guideLayer.destroyChildren(); // limpiar guías previas
  
  const box = activeNode.getClientRect();
  const currentX = activeNode.x();
  const currentY = activeNode.y();
  
  // Diferencia entre la caja delimitadora visual y la posición del pivote del nodo
  const offsetX = box.x - currentX;
  const offsetY = box.y - currentY;
  
  let newBoxX = box.x;
  let newBoxY = box.y;
  
  // Bordes del Lienzo A0
  const canvasTargetsX = [0, CANVAS_MM_W - box.width, CANVAS_MM_W];
  const canvasTargetsY = [0, CANVAS_MM_H - box.height, CANVAS_MM_H];
  
  // Snap a bordes de lienzo X
  for (let target of canvasTargetsX) {
    if (Math.abs(box.x - target) < SNAP_THRESHOLD) {
      newBoxX = target;
      drawGuideLine(target, 0, target, CANVAS_MM_H);
      break;
    }
    if (Math.abs(box.x + box.width - target) < SNAP_THRESHOLD) {
      newBoxX = target - box.width;
      drawGuideLine(target, 0, target, CANVAS_MM_H);
      break;
    }
  }
  
  // Snap a bordes de lienzo Y
  for (let target of canvasTargetsY) {
    if (Math.abs(box.y - target) < SNAP_THRESHOLD) {
      newBoxY = target;
      drawGuideLine(0, target, CANVAS_MM_W, target);
      break;
    }
    if (Math.abs(box.y + box.height - target) < SNAP_THRESHOLD) {
      newBoxY = target - box.height;
      drawGuideLine(0, target, CANVAS_MM_W, target);
      break;
    }
  }
  
  // Snap a otros elementos en el lienzo
  const siblingNodes = stage.find('.impose-item');
  
  siblingNodes.forEach(sibling => {
    if (sibling === activeNode) return;
    
    const sBox = sibling.getClientRect();
    
    // Alineaciones en X
    const targetsX = [sBox.x, sBox.x + sBox.width];
    for (let target of targetsX) {
      if (Math.abs(box.x - target) < SNAP_THRESHOLD) {
        newBoxX = target;
        drawGuideLine(target, 0, target, CANVAS_MM_H);
      } else if (Math.abs(box.x + box.width - target) < SNAP_THRESHOLD) {
        newBoxX = target - box.width;
        drawGuideLine(target, 0, target, CANVAS_MM_H);
      }
    }
    
    // Alineaciones en Y
    const targetsY = [sBox.y, sBox.y + sBox.height];
    for (let target of targetsY) {
      if (Math.abs(box.y - target) < SNAP_THRESHOLD) {
        newBoxY = target;
        drawGuideLine(0, target, CANVAS_MM_W, target);
      } else if (Math.abs(box.y + box.height - target) < SNAP_THRESHOLD) {
        newBoxY = target - box.height;
        drawGuideLine(0, target, CANVAS_MM_W, target);
      }
    }
  });
  
  // Asignar nuevas posiciones del pivote del nodo activo
  activeNode.x(newBoxX - offsetX);
  activeNode.y(newBoxY - offsetY);
  guideLayer.draw();
}

function drawGuideLine(x1, y1, x2, y2) {
  const line = new Konva.Line({
    points: [x1, y1, x2, y2],
    stroke: 'var(--accent)',
    strokeWidth: 1.5,
    dash: [4, 4]
  });
  guideLayer.add(line);
}

// Limpiar guías al soltar el elemento
stage.on('dragend', () => {
  guideLayer.destroyChildren();
  guideLayer.draw();
});

// --- Compilar y Solicitar PDF ---
document.getElementById('btn-generate-pdf').addEventListener('click', async () => {
  if (!edgeFunctionUrl) {
    showToast('Debe configurar la URL de la Edge Function en la barra lateral.', true);
    return;
  }
  
  const items = stage.find('.impose-item');
  if (items.length === 0) return;
  
  const btn = document.getElementById('btn-generate-pdf');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = 'Compilando PDF...';
  
  // Construir el payload JSON de acuerdo con el contrato de la Edge Function
  const payload = {
    job_id: `job_${Date.now()}`,
    canvas_width_mm: CANVAS_MM_W,
    canvas_height_mm: CANVAS_MM_H,
    items: items.map(item => {
      return {
        storage_path: item.getAttr('storagePath'),
        format_target: item.getAttr('currentFormat') || 'A4',
        x_mm: Math.round(item.x()),
        y_mm: Math.round(item.y()),
        width_mm: Math.round(item.width() * item.scaleX()),
        height_mm: Math.round(item.height() * item.scaleY()),
        rotation_deg: Math.round(item.rotation() % 360)
      };
    })
  };
  
  try {
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || `Error ${response.status}`);
    }
    
    // Descargar el archivo PDF devuelto
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `impresion_A0_${Date.now()}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    showToast('¡PDF de Imposición generado con éxito!');
  } catch (err) {
    console.error(err);
    showToast(`Error al compilar PDF: ${err.message}`, true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
});
