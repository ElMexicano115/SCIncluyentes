// Tauri IPC dynamic invoke helper
async function invoke(cmd, args) {
  console.log(`[DEBUG JS] Invocando comando Rust: '${cmd}'`, args || '');
  if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
    return await window.__TAURI__.core.invoke(cmd, args);
  }
  if (window.__TAURI__ && window.__TAURI__.invoke) {
    return await window.__TAURI__.invoke(cmd, args);
  }
  if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
    return await window.__TAURI_INTERNALS__.invoke(cmd, args);
  }
  console.error(`[DEBUG JS Error] No se encontró window.__TAURI__ para ejecutar: ${cmd}`, args);
  alert("No se pudo comunicar con Rust. Asegúrate de ejecutar la app usando Tauri ('npx tauri dev').");
  return null;
}

// Global Touchpad / Page Zoom Prevention
window.addEventListener('wheel', (e) => {
  if (e.ctrlKey) {
    e.preventDefault();
    const container = e.target.closest('#canvas-container') || e.target.closest('.editor-canvas-wrapper');
    if (container) {
      if (e.deltaY < 0) {
        state.zoomLevel = Math.min(3.0, parseFloat((state.zoomLevel + 0.1).toFixed(2)));
      } else {
        state.zoomLevel = Math.max(0.25, parseFloat((state.zoomLevel - 0.1).toFixed(2)));
      }
      aplicarZoomYCentrar(false);
    }
  }
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
    e.preventDefault();
  }
});

window.addEventListener('gesturestart', (e) => e.preventDefault());
window.addEventListener('gesturechange', (e) => e.preventDefault());
window.addEventListener('gestureend', (e) => e.preventDefault());

// Helper function: Word Wrapping for Canvas Text Rendering
function wrapTextLines(ctx, text, maxWidth) {
  if (!text) return [];
  const words = text.toString().split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

// Application Global State
const state = {
  config: {
    dpi: 300,
    tamano_mm: 85.6,
    orientacion: "horizontal",
    width_px: 1011,
    height_px: 637,
  },
  archivo_delantero: null,
  archivo_trasero: null,
  excelData: null,
  posiciones_campos: {
    nombre: { nombre: "nombre", etiqueta: "Nombre Completo", x: 100, y: 150, font_size: 40, color: "#000000", cara: "delantero", width: 300, height: 60, es_personalizado: false, texto_personalizado: "" },
    cargo: { nombre: "cargo", etiqueta: "Cargo / Puesto", x: 100, y: 220, font_size: 32, color: "#333333", cara: "delantero", width: 300, height: 50, es_personalizado: false, texto_personalizado: "" },
    empresa: { nombre: "empresa", etiqueta: "Empresa", x: 100, y: 280, font_size: 32, color: "#3b82f6", cara: "delantero", width: 300, height: 50, es_personalizado: false, texto_personalizado: "" },
  },
  posiciones_fotos: [
    { id: "foto1", cara: "delantero", x: 700, y: 100, width: 220, height: 280, campo_id: "id_foto", carpeta_fotos: "fotos para procesar", es_especifica: false, foto_especifica: "" }
  ],
  qr_areas: [
    { id: "qr1", cara: "trasero", x: 100, y: 100, width: 180, height: 180, campo_id: "id", base_url: "https://credencial.valida/", es_personalizado: false, qr_personalizado: "" }
  ],
  mapeo_campos: {},
  caraActiva: "delantero",
  caraActivaTab5: "delantero",
  elementoSeleccionado: null, // { tipo: 'campo'|'foto'|'qr', id: string }
  isDragging: false,
  isResizing: false,
  activeHandle: null,
  resizeStart: null,
  dragOffset: { x: 0, y: 0 },
  zoomLevel: 1.0,
  hasAutoFitted: false,
  modoGeneracion: "masivo", // 'masivo' | 'unica'
  allProfiles: []
};

// DOM Elements
const elements = {
  tabBtns: document.querySelectorAll('.tab-btn'),
  tabContents: document.querySelectorAll('.tab-content'),
  tamanoMmSelect: document.getElementById('tamano-mm'),
  dpiSelect: document.getElementById('dpi-select'),
  orientacionRadios: document.querySelectorAll('input[name="orientacion"]'),
  resolutionText: document.getElementById('resolution-text'),
  previewDelanteroBox: document.getElementById('preview-delantero-box'),
  previewTraseroBox: document.getElementById('preview-trasero-box'),
  btnCrearBlanco: document.getElementById('btn-crear-blanco'),
  blankColorInput: document.getElementById('blank-color'),
  excelStatus: document.getElementById('excel-status'),
  excelTableContainer: document.getElementById('excel-table-container'),
  mappingContainer: document.getElementById('mapping-container'),
  btnCaraDelantero: document.getElementById('btn-cara-delantero'),
  btnCaraTrasero: document.getElementById('btn-cara-trasero'),
  btnAddTextField: document.getElementById('btn-add-text-field'),
  btnAddPhotoArea: document.getElementById('btn-add-photo-area'),
  btnAddQrArea: document.getElementById('btn-add-qr-area'),
  fieldPropertiesForm: document.getElementById('field-properties-form'),
  canvasElementsList: document.getElementById('canvas-elements-list'),
  canvas: document.getElementById('card-canvas'),
  canvasInfo: document.getElementById('canvas-info'),
  canvasContainer: document.getElementById('canvas-container'),
  btnZoomIn: document.getElementById('btn-zoom-in'),
  btnZoomOut: document.getElementById('btn-zoom-out'),
  btnResetView: document.getElementById('btn-reset-view'),
  zoomLevelBadge: document.getElementById('zoom-level-badge'),
  outputDirPathInput: document.getElementById('output-dir-path'),
  btnSelectOutputDir: document.getElementById('btn-select-output-dir'),
  btnGenerarAction: document.getElementById('btn-generar-action'),
  progressSection: document.getElementById('progress-section'),
  progressBarFill: document.getElementById('progress-bar-fill'),
  progressText: document.getElementById('progress-text'),
  footerStatus: document.getElementById('footer-status'),
  modalOverlay: document.getElementById('modal-overlay'),
  modalTitle: document.getElementById('modal-title'),
  modalBody: document.getElementById('modal-body'),
  btnModalGuardar: document.getElementById('btn-modal-guardar'),
  singleCardRowSelect: document.getElementById('single-card-row-select'),
  tab5PreviewCanvas: document.getElementById('tab5-preview-canvas'),
  btnTab5Delantero: document.getElementById('btn-tab5-delantero'),
  btnTab5Trasero: document.getElementById('btn-tab5-trasero'),
  tab5PreviewInfo: document.getElementById('tab5-preview-info')
};

// 1. Initialization
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupConfigListeners();
  setupCanvas();
  calcularResolucion();
  renderCanvas();
});

// 2. Navigation & Accordions
function setupNavigation() {
  elements.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      elements.tabBtns.forEach(b => b.classList.remove('active'));
      elements.tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(targetTab).classList.add('active');

      if (targetTab === 'tab-diseno') {
        setTimeout(() => {
          renderCanvas();
          if (!state.hasAutoFitted && (state.archivo_delantero || state.archivo_trasero)) {
            autoAjustarYCentrarContenido(false);
          } else {
            aplicarZoomYCentrar(false);
          }
        }, 50);
      } else if (targetTab === 'tab-mapeo') {
        renderMappingTab(state.excelData);
      } else if (targetTab === 'tab-generar') {
        renderPreviewCanvasTab5();
      }
    });
  });
}

window.toggleAccordion = function(headerElem) {
  const section = headerElem.closest('.panel-section.collapsible');
  if (section) {
    section.classList.toggle('collapsed');
  }
};

// 3. Config Calculations
function calcularResolucion() {
  const mm = parseFloat(elements.tamanoMmSelect.value);
  const dpi = parseInt(elements.dpiSelect.value, 10);
  let orientacion = "horizontal";
  elements.orientacionRadios.forEach(r => { if (r.checked) orientacion = r.value; });

  const pxW = Math.round((mm / 25.4) * dpi);
  const pxH = Math.round(((mm / 1.585) / 25.4) * dpi);

  state.config.dpi = dpi;
  state.config.tamano_mm = mm;
  state.config.orientacion = orientacion;

  if (orientacion === "horizontal") {
    state.config.width_px = pxW;
    state.config.height_px = pxH;
  } else {
    state.config.width_px = pxH;
    state.config.height_px = pxW;
  }

  elements.resolutionText.textContent = `${state.config.width_px} x ${state.config.height_px} px`;
  
  if (elements.canvas) {
    elements.canvas.width = state.config.width_px;
    elements.canvas.height = state.config.height_px;
    renderCanvas();
  }
}

window.cambiarOrientacionDiseno = function(orientacion) {
  state.config.orientacion = orientacion;
  const btnH = document.getElementById('btn-orientacion-horiz');
  const btnV = document.getElementById('btn-orientacion-vert');
  if (btnH && btnV) {
    if (orientacion === 'horizontal') {
      btnH.classList.add('active');
      btnV.classList.remove('active');
    } else {
      btnV.classList.add('active');
      btnH.classList.remove('active');
    }
  }

  if (elements.orientacionRadios) {
    elements.orientacionRadios.forEach(r => {
      r.checked = (r.value === orientacion);
    });
  }

  calcularResolucion();
  renderCanvas(true);
  autoAjustarYCentrarContenido(true);
  renderPreviewCanvasTab5();
};

// Image Base64 / Protocol display helper
async function getDisplaySrc(path) {
  if (!path) return '';
  if (path.startsWith('data:') || path.startsWith('blob:') || path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  try {
    const base64Data = await invoke('cmd_read_file_base64', { path });
    if (base64Data) return base64Data;
  } catch (e) {
    console.warn("[DEBUG JS] Error obteniendo base64 de imagen:", e);
  }
  return path;
}

// Image Cache
const bgImageCache = {
  delanteroPath: null,
  delanteroImg: null,
  traseroPath: null,
  traseroImg: null,
};

async function preloadBackgroundImage(cara, path) {
  if (!path || typeof path !== 'string' || path.startsWith('C:') || path.startsWith('C\\')) return;

  if (cara === 'delantero') {
    if (bgImageCache.delanteroPath === path && bgImageCache.delanteroImg) return;
    bgImageCache.delanteroPath = path;
    const src = await getDisplaySrc(path);
    if (src) {
      const img = new Image();
      img.onload = () => {
        bgImageCache.delanteroImg = img;
        renderCanvas(false);
        renderPreviewCanvasTab5();
      };
      img.src = src;
    }
  } else {
    if (bgImageCache.traseroPath === path && bgImageCache.traseroImg) return;
    bgImageCache.traseroPath = path;
    const src = await getDisplaySrc(path);
    if (src) {
      const img = new Image();
      img.onload = () => {
        bgImageCache.traseroImg = img;
        renderCanvas(false);
        renderPreviewCanvasTab5();
      };
      img.src = src;
    }
  }
}

// Native Image Selector Handlers
window.seleccionarImagenDelantero = async function() {
  try {
    const path = await invoke('cmd_select_image_file');
    if (path && typeof path === 'string') {
      state.archivo_delantero = path;
      const displaySrc = await getDisplaySrc(path);
      elements.previewDelanteroBox.innerHTML = `<img src="${displaySrc}" alt="Fondo Delantero" />`;
      await preloadBackgroundImage('delantero', path);
      renderCanvas(true);
      autoAjustarYCentrarContenido(false);
    }
  } catch (err) {
    console.error("[DEBUG JS Error] Error al seleccionar imagen delantera:", err);
  }
};

window.seleccionarImagenTrasero = async function() {
  try {
    const path = await invoke('cmd_select_image_file');
    if (path && typeof path === 'string') {
      state.archivo_trasero = path;
      const displaySrc = await getDisplaySrc(path);
      elements.previewTraseroBox.innerHTML = `<img src="${displaySrc}" alt="Fondo Trasero" />`;
      await preloadBackgroundImage('trasero', path);
      renderCanvas(true);
      autoAjustarYCentrarContenido(false);
    }
  } catch (err) {
    console.error("[DEBUG JS Error] Error al seleccionar imagen trasera:", err);
  }
};

function setupConfigListeners() {
  elements.tamanoMmSelect.addEventListener('change', calcularResolucion);
  elements.dpiSelect.addEventListener('change', calcularResolucion);
  elements.orientacionRadios.forEach(r => r.addEventListener('change', calcularResolucion));

  elements.btnCrearBlanco.addEventListener('click', async () => {
    const color = elements.blankColorInput.value;
    elements.footerStatus.textContent = "Generando plantillas en blanco...";
    
    try {
      const pathDelantero = await invoke('cmd_create_blank_template', {
        width: state.config.width_px,
        height: state.config.height_px,
        colorHex: color,
        filename: "plantilla_delantero.png"
      });

      const pathTrasero = await invoke('cmd_create_blank_template', {
        width: state.config.width_px,
        height: state.config.height_px,
        colorHex: color,
        filename: "plantilla_trasero.png"
      });

      state.archivo_delantero = pathDelantero;
      state.archivo_trasero = pathTrasero;

      elements.previewDelanteroBox.innerHTML = `<div style="background:${color}; width:100%; height:100%;">Plantilla Blanco</div>`;
      elements.previewTraseroBox.innerHTML = `<div style="background:${color}; width:100%; height:100%;">Plantilla Blanco</div>`;

      elements.footerStatus.textContent = "Plantillas en blanco creadas con éxito";
      renderCanvas();
    } catch (err) {
      alert(`Error: ${err}`);
      elements.footerStatus.textContent = "Error al crear plantillas";
    }
  });
}

// 4. Excel Import & Data Grid
window.seleccionarArchivoExcel = async function() {
  elements.excelStatus.textContent = "Abriendo selector de archivos...";

  try {
    const path = await invoke('cmd_select_excel_file');
    if (path && typeof path === 'string' && path.length > 0) {
      await cargarExcelDesdeRuta(path);
    } else {
      elements.excelStatus.textContent = "Sin datos cargados";
    }
  } catch (err) {
    console.error("[DEBUG JS Error] Excepción en seleccionarArchivoExcel:", err);
    elements.excelStatus.textContent = "Error al abrir selector de archivo";
  }
};

async function cargarExcelDesdeRuta(path) {
  elements.excelStatus.textContent = "Cargando Excel...";
  elements.footerStatus.textContent = `Leyendo: ${path}`;

  try {
    const res = await invoke('cmd_read_excel', { path });
    if (res) {
      state.excelData = res;
      elements.excelStatus.textContent = `${res.total_rows} registros cargados (${res.columns.length} columnas)`;
      elements.footerStatus.textContent = "Excel cargado correctamente";
      renderExcelTable(res);
      renderMappingTab(res);
      updateSingleCardRowSelect(res);
      renderPreviewCanvasTab5();
    } else {
      elements.excelStatus.textContent = "Error: Respuesta vacía de Excel";
    }
  } catch (err) {
    console.error(`[DEBUG JS Error] Error al leer Excel (${path}):`, err);
    alert(`Error al leer Excel (${path}): ${err}`);
    elements.excelStatus.textContent = "Error de carga";
    elements.footerStatus.textContent = "Error al leer Excel";
  }
}

function updateSingleCardRowSelect(data) {
  if (!elements.singleCardRowSelect) return;
  if (!data || !data.rows || data.rows.length === 0) {
    elements.singleCardRowSelect.innerHTML = '<option value="0">Registro 1 (Sin datos de Excel)</option>';
    return;
  }

  let html = '';
  data.rows.forEach((row, idx) => {
    const label = row.nombre || row.Nombre || row.ID || row.id || `Registro ${idx + 1}`;
    html += `<option value="${idx}">[${idx + 1}] ${label}</option>`;
  });
  elements.singleCardRowSelect.innerHTML = html;
}

function renderExcelTable(data) {
  if (!data || !data.columns || data.columns.length === 0) return;

  let html = '<table><thead><tr>';
  data.columns.forEach(col => { html += `<th>${col}</th>`; });
  html += '</tr></thead><tbody>';

  data.rows.slice(0, 50).forEach(row => {
    html += '<tr>';
    data.columns.forEach(col => {
      html += `<td>${row[col] || ''}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  elements.excelTableContainer.innerHTML = html;
}

function renderMappingTab(data) {
  const container = elements.mappingContainer;
  if (!container) return;

  const columns = (data && data.columns) ? data.columns : [];

  let html = '<div class="mapping-list">';

  // Text fields
  Object.keys(state.posiciones_campos || {}).forEach(campoKey => {
    const campo = state.posiciones_campos[campoKey];
    html += `
      <div class="mapping-item form-group">
        <label><i class="fa-solid fa-font"></i> Texto "${campo.etiqueta}" (${campo.cara}):</label>
        <select onchange="actualizarMapeo('${campoKey}', this.value)">
          <option value="">-- Sin mapear --</option>
          ${columns.map(c => `<option value="${c}" ${state.mapeo_campos[campoKey] === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
    `;
  });

  // Photos
  (Array.isArray(state.posiciones_fotos) ? state.posiciones_fotos : []).forEach(photo => {
    html += `
      <div class="mapping-item form-group">
        <label><i class="fa-solid fa-image"></i> Área Foto "${photo.id}" (${photo.cara}):</label>
        <select onchange="actualizarMapeoFoto('${photo.id}', this.value)">
          <option value="">-- Sin mapear --</option>
          ${columns.map(c => `<option value="${c}" ${photo.campo_id === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
    `;
  });

  // QRs
  (Array.isArray(state.qr_areas) ? state.qr_areas : []).forEach(qr => {
    html += `
      <div class="mapping-item form-group">
        <label><i class="fa-solid fa-qrcode"></i> Código QR "${qr.id}" (${qr.cara}):</label>
        <select onchange="actualizarMapeoQR('${qr.id}', this.value)">
          <option value="">-- Sin mapear --</option>
          ${columns.map(c => `<option value="${c}" ${qr.campo_id === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

window.actualizarMapeo = (campoKey, columna) => {
  state.mapeo_campos[campoKey] = columna;
  renderCanvas();
  renderPreviewCanvasTab5();
};

window.actualizarMapeoFoto = (photoId, columna) => {
  const p = (Array.isArray(state.posiciones_fotos) ? state.posiciones_fotos : []).find(x => x.id === photoId);
  if (p) { p.campo_id = columna; renderCanvas(); renderPreviewCanvasTab5(); }
};

window.actualizarMapeoQR = (qrId, columna) => {
  const q = (Array.isArray(state.qr_areas) ? state.qr_areas : []).find(x => x.id === qrId);
  if (q) { q.campo_id = columna; renderCanvas(); renderPreviewCanvasTab5(); }
};

function autoAjustarYCentrarContenido(force = false) {
  if (!elements.canvasContainer || !elements.canvas) return;

  if (!state.hasAutoFitted || force) {
    const containerW = elements.canvasContainer.clientWidth - 40;
    const containerH = elements.canvasContainer.clientHeight - 40;

    if (containerW > 0 && containerH > 0) {
      const scaleX = containerW / state.config.width_px;
      const scaleY = containerH / state.config.height_px;
      let fitZoom = Math.min(scaleX, scaleY);
      fitZoom = Math.max(0.25, Math.min(1.0, fitZoom));

      state.zoomLevel = parseFloat(fitZoom.toFixed(2));
      state.hasAutoFitted = true;
    }
  }

  aplicarZoomYCentrar(true);
}

function aplicarZoomYCentrar(scrollCenter = false) {
  const cvs = elements.canvas;
  if (!cvs) return;

  const displayW = Math.round(state.config.width_px * state.zoomLevel);
  const displayH = Math.round(state.config.height_px * state.zoomLevel);

  cvs.style.width = `${displayW}px`;
  cvs.style.height = `${displayH}px`;

  if (elements.zoomLevelBadge) {
    elements.zoomLevelBadge.textContent = `${Math.round(state.zoomLevel * 100)}%`;
  }
  updateCanvasInfoText();

  if (scrollCenter && elements.canvasContainer) {
    setTimeout(() => {
      const scrollX = (elements.canvasContainer.scrollWidth - elements.canvasContainer.clientWidth) / 2;
      const scrollY = (elements.canvasContainer.scrollHeight - elements.canvasContainer.clientHeight) / 2;
      elements.canvasContainer.scrollLeft = Math.max(0, scrollX);
      elements.canvasContainer.scrollTop = Math.max(0, scrollY);
    }, 30);
  }
}

function updateCanvasInfoText() {
  if (!elements.canvasInfo) return;
  let text = `Lado: ${state.caraActiva === 'delantero' ? 'Delantero' : 'Trasero'} | Zoom: ${Math.round(state.zoomLevel * 100)}%`;

  if (state.elementoSeleccionado) {
    const bounds = getElementBounds(state.elementoSeleccionado.tipo, state.elementoSeleccionado.id);
    if (bounds) {
      const name = state.elementoSeleccionado.tipo === 'campo' ? (bounds.item.etiqueta || bounds.item.nombre) : (state.elementoSeleccionado.tipo === 'foto' ? `Foto (${bounds.item.id})` : `QR (${bounds.item.id})`);
      text += ` | Selección: ${name} [Ancho: ${bounds.width}px, Alto: ${bounds.height}px]`;
    }
  }

  elements.canvasInfo.textContent = text;
}

// 5. Visual Drag, Drop & Resizing Canvas Engine (Font size stays fixed on resize)
function getElementBounds(tipo, id) {
  if (tipo === 'campo' && state.posiciones_campos[id]) {
    const f = state.posiciones_campos[id];
    const w = f.width || 300;
    const h = f.height || (f.font_size + 6);
    return { x: f.x, y: f.y, width: w, height: h, font_size: f.font_size, item: f };
  } else if (tipo === 'foto') {
    const p = (Array.isArray(state.posiciones_fotos) ? state.posiciones_fotos : []).find(x => x.id === id);
    if (p) return { x: p.x, y: p.y, width: p.width, height: p.height, item: p };
  } else if (tipo === 'qr') {
    const q = (Array.isArray(state.qr_areas) ? state.qr_areas : []).find(x => x.id === id);
    if (q) return { x: q.x, y: q.y, width: q.width, height: q.height, item: q };
  }
  return null;
}

function getResizeHandles(bounds) {
  if (!bounds) return {};
  const { x, y, width, height } = bounds;
  const size = 10;
  const half = size / 2;

  return {
    nw: { x: x - half, y: y - half, w: size, h: size, cursor: 'nwse-resize' },
    n:  { x: x + width/2 - half, y: y - half, w: size, h: size, cursor: 'ns-resize' },
    ne: { x: x + width - half, y: y - half, w: size, h: size, cursor: 'nesw-resize' },
    e:  { x: x + width - half, y: y + height/2 - half, w: size, h: size, cursor: 'ew-resize' },
    se: { x: x + width - half, y: y + height - half, w: size, h: size, cursor: 'nwse-resize' },
    s:  { x: x + width/2 - half, y: y + height - half, w: size, h: size, cursor: 'ns-resize' },
    sw: { x: x - half, y: y + height - half, w: size, h: size, cursor: 'nesw-resize' },
    w:  { x: x - half, y: y + height/2 - half, w: size, h: size, cursor: 'ew-resize' },
  };
}

function setupCanvas() {
  if (elements.btnZoomIn) {
    elements.btnZoomIn.addEventListener('click', () => {
      state.zoomLevel = Math.min(3.0, parseFloat((state.zoomLevel + 0.1).toFixed(2)));
      aplicarZoomYCentrar(false);
    });
  }

  if (elements.btnZoomOut) {
    elements.btnZoomOut.addEventListener('click', () => {
      state.zoomLevel = Math.max(0.25, parseFloat((state.zoomLevel - 0.1).toFixed(2)));
      aplicarZoomYCentrar(false);
    });
  }

  if (elements.btnResetView) {
    elements.btnResetView.addEventListener('click', () => {
      autoAjustarYCentrarContenido(true);
    });
  }

  elements.btnCaraDelantero.addEventListener('click', () => {
    state.caraActiva = "delantero";
    elements.btnCaraDelantero.classList.add('active');
    elements.btnCaraTrasero.classList.remove('active');
    aplicarZoomYCentrar(false);
    renderCanvas();
  });

  elements.btnCaraTrasero.addEventListener('click', () => {
    state.caraActiva = "trasero";
    elements.btnCaraTrasero.classList.add('active');
    elements.btnCaraDelantero.classList.remove('active');
    aplicarZoomYCentrar(false);
    renderCanvas();
  });

  // Add items
  elements.btnAddTextField.addEventListener('click', () => {
    const id = `campo_${Date.now()}`;
    state.posiciones_campos[id] = {
      nombre: id,
      etiqueta: "Nuevo Texto",
      x: 100,
      y: 100,
      font_size: 36,
      color: "#000000",
      cara: state.caraActiva,
      width: 300,
      height: 50,
      es_personalizado: false,
      texto_personalizado: ""
    };
    state.elementoSeleccionado = { tipo: 'campo', id };
    renderCanvas();
  });

  elements.btnAddPhotoArea.addEventListener('click', () => {
    const id = `foto_${Date.now()}`;
    if (!Array.isArray(state.posiciones_fotos)) state.posiciones_fotos = [];
    state.posiciones_fotos.push({
      id,
      cara: state.caraActiva,
      x: 100,
      y: 100,
      width: 200,
      height: 250,
      campo_id: "id_foto",
      carpeta_fotos: "fotos para procesar",
      es_especifica: false,
      foto_especifica: ""
    });
    state.elementoSeleccionado = { tipo: 'foto', id };
    renderCanvas();
  });

  elements.btnAddQrArea.addEventListener('click', () => {
    const id = `qr_${Date.now()}`;
    if (!Array.isArray(state.qr_areas)) state.qr_areas = [];
    state.qr_areas.push({
      id,
      cara: state.caraActiva,
      x: 100,
      y: 100,
      width: 150,
      height: 150,
      campo_id: "id",
      base_url: "https://",
      es_personalizado: false,
      qr_personalizado: ""
    });
    state.elementoSeleccionado = { tipo: 'qr', id };
    renderCanvas();
  });

  // Canvas Mouse Events: Drag & Resize
  const cvs = elements.canvas;
  cvs.addEventListener('mousedown', (e) => {
    const rect = cvs.getBoundingClientRect();
    const scaleX = cvs.width / rect.width;
    const scaleY = cvs.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    // 1. Check if clicking on resize handles of current selection
    if (state.elementoSeleccionado) {
      const bounds = getElementBounds(state.elementoSeleccionado.tipo, state.elementoSeleccionado.id);
      if (bounds && bounds.item.cara === state.caraActiva) {
        const handles = getResizeHandles(bounds);
        for (const [hKey, h] of Object.entries(handles)) {
          if (mouseX >= h.x && mouseX <= h.x + h.w && mouseY >= h.y && mouseY <= h.y + h.h) {
            state.isResizing = true;
            state.activeHandle = hKey;
            state.resizeStart = { mouseX, mouseY, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, font_size: bounds.font_size || 36, item: bounds.item };
            return;
          }
        }
      }
    }

    // 2. Element Selection & Dragging Hit Test
    let hit = null;

    // Fields
    Object.keys(state.posiciones_campos || {}).forEach(key => {
      const f = state.posiciones_campos[key];
      if (f.cara === state.caraActiva) {
        const w = f.width || 300;
        const h = f.height || (f.font_size + 6);
        if (mouseX >= f.x && mouseX <= f.x + w && mouseY >= f.y && mouseY <= f.y + h) {
          hit = { tipo: 'campo', id: key, item: f };
        }
      }
    });

    // Photos
    (Array.isArray(state.posiciones_fotos) ? state.posiciones_fotos : []).forEach(photo => {
      if (photo.cara === state.caraActiva) {
        if (mouseX >= photo.x && mouseX <= photo.x + photo.width && mouseY >= photo.y && mouseY <= photo.y + photo.height) {
          hit = { tipo: 'foto', id: photo.id, item: photo };
        }
      }
    });

    // QRs
    (Array.isArray(state.qr_areas) ? state.qr_areas : []).forEach(qr => {
      if (qr.cara === state.caraActiva) {
        if (mouseX >= qr.x && mouseX <= qr.x + qr.width && mouseY >= qr.y && mouseY <= qr.y + qr.height) {
          hit = { tipo: 'qr', id: qr.id, item: qr };
        }
      }
    });

    if (hit) {
      state.elementoSeleccionado = { tipo: hit.tipo, id: hit.id };
      state.isDragging = true;
      state.dragOffset = { x: mouseX - hit.item.x, y: mouseY - hit.item.y };
      renderCanvas(true);
    } else {
      state.elementoSeleccionado = null;
      renderCanvas(true);
    }
  });

  window.addEventListener('mousemove', (e) => {
    const rect = cvs.getBoundingClientRect();
    const scaleX = cvs.width / rect.width;
    const scaleY = cvs.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    // Handle cursor hover feedback
    if (!state.isDragging && !state.isResizing && state.elementoSeleccionado) {
      const bounds = getElementBounds(state.elementoSeleccionado.tipo, state.elementoSeleccionado.id);
      if (bounds && bounds.item.cara === state.caraActiva) {
        const handles = getResizeHandles(bounds);
        let cursorSet = false;
        for (const [hKey, h] of Object.entries(handles)) {
          if (mouseX >= h.x && mouseX <= h.x + h.w && mouseY >= h.y && mouseY <= h.y + h.h) {
            cvs.style.cursor = h.cursor;
            cursorSet = true;
            break;
          }
        }
        if (!cursorSet) cvs.style.cursor = 'crosshair';
      }
    }

    // Handle Resizing (FONT SIZE REMAINS FIXED, ONLY WIDTH/HEIGHT ADAPTS)
    if (state.isResizing && state.resizeStart) {
      const { mouseX: startMx, mouseY: startMy, x: origX, y: origY, width: origW, height: origH, item } = state.resizeStart;
      const dx = mouseX - startMx;
      const dy = mouseY - startMy;
      const handle = state.activeHandle;

      let newW = origW;
      let newH = origH;
      let newX = origX;
      let newY = origY;

      if (handle.includes('e')) newW = Math.max(30, origW + dx);
      if (handle.includes('s')) newH = Math.max(16, origH + dy);
      if (handle.includes('w')) {
        newW = Math.max(30, origW - dx);
        newX = origX + (origW - newW);
      }
      if (handle.includes('n')) {
        newH = Math.max(16, origH - dy);
        newY = origY + (origH - newH);
      }

      item.x = Math.round(newX);
      item.y = Math.round(newY);
      item.width = Math.round(newW);
      item.height = Math.round(newH);

      renderCanvas(false);
      return;
    }

    // Handle Dragging
    if (state.isDragging && state.elementoSeleccionado) {
      const originX = Math.max(0, Math.round(mouseX - state.dragOffset.x));
      const originY = Math.max(0, Math.round(mouseY - state.dragOffset.y));

      if (state.elementoSeleccionado.tipo === 'campo' && state.posiciones_campos[state.elementoSeleccionado.id]) {
        const item = state.posiciones_campos[state.elementoSeleccionado.id];
        item.x = originX;
        item.y = originY;
      } else if (state.elementoSeleccionado.tipo === 'foto') {
        const list = Array.isArray(state.posiciones_fotos) ? state.posiciones_fotos : [];
        const item = list.find(p => p.id === state.elementoSeleccionado.id);
        if (item) { item.x = originX; item.y = originY; }
      } else if (state.elementoSeleccionado.tipo === 'qr') {
        const list = Array.isArray(state.qr_areas) ? state.qr_areas : [];
        const item = list.find(q => q.id === state.elementoSeleccionado.id);
        if (item) { item.x = originX; item.y = originY; }
      }

      renderCanvas(false);
    }
  });

  window.addEventListener('mouseup', () => {
    if (state.isDragging || state.isResizing) {
      state.isDragging = false;
      state.isResizing = false;
      state.activeHandle = null;
      renderCanvas(true);
    }
  });
}

function drawCanvasOverlay(ctx) {
  ctx.save();

  // Draw photos
  (Array.isArray(state.posiciones_fotos) ? state.posiciones_fotos : []).forEach(photo => {
    if (photo.cara === state.caraActiva) {
      ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.fillRect(photo.x, photo.y, photo.width, photo.height);
      ctx.strokeRect(photo.x, photo.y, photo.width, photo.height);

      ctx.fillStyle = '#3b82f6';
      ctx.font = '14px Inter, sans-serif';
      ctx.textBaseline = 'top';
      const label = photo.es_especifica ? '[Foto Específica]' : `[Foto: ${photo.campo_id}]`;
      ctx.fillText(label, photo.x + 8, photo.y + 8);

      if (state.elementoSeleccionado && state.elementoSeleccionado.id === photo.id) {
        drawSelectionAndHandles(ctx, { x: photo.x, y: photo.y, width: photo.width, height: photo.height });
      }
    }
  });

  // Draw QRs
  (Array.isArray(state.qr_areas) ? state.qr_areas : []).forEach(qr => {
    if (qr.cara === state.caraActiva) {
      ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.fillRect(qr.x, qr.y, qr.width, qr.height);
      ctx.strokeRect(qr.x, qr.y, qr.width, qr.height);

      ctx.fillStyle = '#10b981';
      ctx.font = '14px Inter, sans-serif';
      ctx.textBaseline = 'top';
      const label = qr.es_personalizado ? '[QR Personalizado]' : `[QR: ${qr.campo_id}]`;
      ctx.fillText(label, qr.x + 8, qr.y + 8);

      if (state.elementoSeleccionado && state.elementoSeleccionado.id === qr.id) {
        drawSelectionAndHandles(ctx, { x: qr.x, y: qr.y, width: qr.width, height: qr.height });
      }
    }
  });

  // Draw Text Fields with Multi-Line Word Wrapping
  Object.keys(state.posiciones_campos || {}).forEach(key => {
    const field = state.posiciones_campos[key];
    if (field.cara === state.caraActiva) {
      const displayText = field.es_personalizado && field.texto_personalizado ? field.texto_personalizado : field.etiqueta;
      ctx.fillStyle = field.color || '#000000';
      ctx.font = `${field.font_size}px 'DejaVu Sans', Inter, sans-serif`;
      ctx.textBaseline = 'top';

      const maxWidth = field.width || 300;
      const lines = wrapTextLines(ctx, displayText, maxWidth);
      const lineHeight = Math.round(field.font_size * 1.15);

      lines.forEach((lineStr, idx) => {
        ctx.fillText(lineStr, field.x, field.y + (idx * lineHeight));
      });

      const totalH = Math.max(field.height || (field.font_size + 6), lines.length * lineHeight);
      field.height = totalH;

      const bounds = { x: field.x, y: field.y, width: maxWidth, height: totalH, font_size: field.font_size };

      if (state.elementoSeleccionado && state.elementoSeleccionado.id === key) {
        drawSelectionAndHandles(ctx, bounds);
      }
    }
  });

  ctx.restore();
}

function drawSelectionAndHandles(ctx, bounds) {
  const { x, y, width, height, font_size } = bounds;
  
  // Selection box
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);
  ctx.setLineDash([]);

  // Draw 8 resize handle anchors
  const handles = getResizeHandles(bounds);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 2;

  for (const h of Object.values(handles)) {
    ctx.fillRect(h.x, h.y, h.w, h.h);
    ctx.strokeRect(h.x, h.y, h.w, h.h);
  }

  // Accessibility Dimension Badge directly below the element
  let infoText = `Ancho: ${width}px | Alto: ${height}px`;
  if (font_size) {
    infoText += ` | Fuente: ${font_size}px`;
  }

  ctx.font = '12px Inter, sans-serif';
  ctx.textBaseline = 'top';
  const textWidth = ctx.measureText(infoText).width;
  const badgeW = textWidth + 16;
  const badgeH = 22;
  const badgeX = Math.max(5, x);
  const badgeY = y + height + 10;

  // Badge Background
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.fillRect(badgeX, badgeY, badgeW, badgeH);

  // Badge Text
  ctx.fillStyle = '#ffffff';
  ctx.fillText(infoText, badgeX + 8, badgeY + 4);
}

function renderCanvas(updateForm = true) {
  const cvs = elements.canvas;
  if (!cvs) return;
  const ctx = cvs.getContext('2d');

  if (cvs.width !== state.config.width_px) cvs.width = state.config.width_px;
  if (cvs.height !== state.config.height_px) cvs.height = state.config.height_px;

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cvs.width, cvs.height);

  const bgPath = state.caraActiva === 'delantero' ? state.archivo_delantero : state.archivo_trasero;
  const bgImg = state.caraActiva === 'delantero' ? bgImageCache.delanteroImg : bgImageCache.traseroImg;

  if (bgPath) {
    const cachedPath = state.caraActiva === 'delantero' ? bgImageCache.delanteroPath : bgImageCache.traseroPath;
    if (cachedPath !== bgPath) {
      preloadBackgroundImage(state.caraActiva, bgPath);
    }
    if (bgImg && bgImg.complete && bgImg.naturalWidth !== 0) {
      ctx.drawImage(bgImg, 0, 0, cvs.width, cvs.height);
    }
  }

  // Draw overlay items
  drawCanvasOverlay(ctx);
  updateCanvasInfoText();

  if (updateForm) {
    renderElementsList();
    renderPropertiesForm();
  }
}

function renderElementsList() {
  if (!elements.canvasElementsList) return;
  let html = '';

  Object.keys(state.posiciones_campos || {}).forEach(key => {
    const f = state.posiciones_campos[key];
    if (f.cara === state.caraActiva) {
      const selected = state.elementoSeleccionado && state.elementoSeleccionado.id === key ? 'selected' : '';
      const textLabel = f.es_personalizado && f.texto_personalizado ? f.texto_personalizado : f.etiqueta;
      html += `<li class="${selected}" onclick="seleccionarElemento('campo', '${key}')"><span><i class="fa-solid fa-font"></i> ${textLabel}</span> <button class="btn btn-xs btn-outline" onclick="eliminarElemento('campo', '${key}', event)"><i class="fa-solid fa-trash"></i></button></li>`;
    }
  });

  (Array.isArray(state.posiciones_fotos) ? state.posiciones_fotos : []).forEach(p => {
    if (p.cara === state.caraActiva) {
      const selected = state.elementoSeleccionado && state.elementoSeleccionado.id === p.id ? 'selected' : '';
      const photoLabel = p.es_especifica ? 'Foto Específica' : `Área Foto (${p.campo_id})`;
      html += `<li class="${selected}" onclick="seleccionarElemento('foto', '${p.id}')"><span><i class="fa-solid fa-image"></i> ${photoLabel}</span> <button class="btn btn-xs btn-outline" onclick="eliminarElemento('foto', '${p.id}', event)"><i class="fa-solid fa-trash"></i></button></li>`;
    }
  });

  (Array.isArray(state.qr_areas) ? state.qr_areas : []).forEach(q => {
    if (q.cara === state.caraActiva) {
      const selected = state.elementoSeleccionado && state.elementoSeleccionado.id === q.id ? 'selected' : '';
      const qrLabel = q.es_personalizado ? 'QR Personalizado' : `Código QR (${q.campo_id})`;
      html += `<li class="${selected}" onclick="seleccionarElemento('qr', '${q.id}')"><span><i class="fa-solid fa-qrcode"></i> ${qrLabel}</span> <button class="btn btn-xs btn-outline" onclick="eliminarElemento('qr', '${q.id}', event)"><i class="fa-solid fa-trash"></i></button></li>`;
    }
  });

  elements.canvasElementsList.innerHTML = html || '<p class="subtle-text">No hay elementos en esta cara.</p>';
}

window.seleccionarElemento = (tipo, id) => {
  state.elementoSeleccionado = { tipo, id };
  renderCanvas(true);
};

window.eliminarElemento = (tipo, id, event) => {
  if (event) event.stopPropagation();
  if (tipo === 'campo') {
    delete state.posiciones_campos[id];
  } else if (tipo === 'foto') {
    state.posiciones_fotos = (state.posiciones_fotos || []).filter(p => p.id !== id);
  } else if (tipo === 'qr') {
    state.qr_areas = (state.qr_areas || []).filter(q => q.id !== id);
  }

  if (state.elementoSeleccionado && state.elementoSeleccionado.id === id) {
    state.elementoSeleccionado = null;
  }
  renderCanvas(true);
};

function renderPropertiesForm() {
  if (!elements.fieldPropertiesForm) return;

  if (!state.elementoSeleccionado) {
    elements.fieldPropertiesForm.innerHTML = '<p class="subtle-text">Selecciona un elemento en el lienzo para editar sus propiedades.</p>';
    return;
  }

  const { tipo, id } = state.elementoSeleccionado;

  if (tipo === 'campo') {
    const f = state.posiciones_campos[id];
    if (!f) return;

    elements.fieldPropertiesForm.innerHTML = `
      <div class="form-group">
        <label>Etiqueta / Nombre:</label>
        <input type="text" value="${f.etiqueta}" oninput="actualizarPropiedadCampo('${id}', 'etiqueta', this.value)" />
      </div>

      <div class="form-group">
        <label>Modo de Contenido:</label>
        <div class="radio-group" style="flex-direction: column; gap: 6px; margin-top: 4px;">
          <label><input type="radio" name="text_mode_${id}" value="excel" ${!f.es_personalizado ? 'checked' : ''} onchange="actualizarModoTexto('${id}', false)"> Vincular a Excel / Etiqueta</label>
          <label><input type="radio" name="text_mode_${id}" value="custom" ${f.es_personalizado ? 'checked' : ''} onchange="actualizarModoTexto('${id}', true)"> Contenido personalizado (Credencial Única)</label>
        </div>
      </div>

      ${f.es_personalizado ? `
        <div class="form-group" style="background:#f1f5f9; padding:10px; border-radius:6px; border:1px solid #cbd5e1;">
          <label><strong>Texto Personalizado (Impreso directo):</strong></label>
          <input type="text" value="${f.texto_personalizado || ''}" placeholder="Escribe el contenido único aquí..." oninput="actualizarPropiedadCampo('${id}', 'texto_personalizado', this.value)" />
        </div>
      ` : ''}

      <div class="form-group">
        <label>Tamaño de Fuente (px):</label>
        <input type="number" value="${f.font_size}" min="8" max="200" oninput="actualizarPropiedadCampo('${id}', 'font_size', parseInt(this.value, 10))" />
      </div>
      <div class="form-group">
        <label>Color del Texto:</label>
        <input type="color" value="${f.color}" oninput="actualizarPropiedadCampo('${id}', 'color', this.value)" />
      </div>
      <div class="form-group">
        <label>Ancho del Box (px):</label>
        <input type="number" value="${f.width || 300}" oninput="actualizarPropiedadCampo('${id}', 'width', parseInt(this.value, 10))" />
      </div>
      <div class="form-group">
        <label>Posición X:</label>
        <input type="number" value="${f.x}" oninput="actualizarPropiedadCampo('${id}', 'x', parseInt(this.value, 10))" />
      </div>
      <div class="form-group">
        <label>Posición Y:</label>
        <input type="number" value="${f.y}" oninput="actualizarPropiedadCampo('${id}', 'y', parseInt(this.value, 10))" />
      </div>
      <button class="btn btn-danger btn-sm" style="width:100%; margin-top:8px;" onclick="eliminarElemento('campo', '${id}')"><i class="fa-solid fa-trash"></i> Eliminar Campo de Texto</button>
    `;
  } else if (tipo === 'foto') {
    const p = (Array.isArray(state.posiciones_fotos) ? state.posiciones_fotos : []).find(x => x.id === id);
    if (!p) return;

    elements.fieldPropertiesForm.innerHTML = `
      <div class="form-group">
        <label><strong>Área de Foto (${p.id}):</strong></label>
        <button class="btn btn-primary btn-sm" style="width:100%; margin-top:6px;" onclick="abrirModalFotoContent()"><i class="fa-solid fa-gear"></i> Seleccionar / Configurar Contenido</button>
      </div>

      <div style="background:#f8fafc; padding:8px 12px; border-radius:6px; font-size:11px; color:#475569; margin-bottom:12px; border:1px solid #e2e8f0;">
        ${p.es_especifica ? `<strong>Modo:</strong> Foto Específica<br><span style="word-break:break-all;">${p.foto_especifica || 'Sin archivo seleccionado'}</span>` : `<strong>Modo:</strong> Masivo (Excel)<br><strong>Columna:</strong> ${p.campo_id}<br><strong>Carpeta:</strong> ${p.carpeta_fotos}`}
      </div>

      <div class="form-group">
        <label>Ancho (px):</label>
        <input type="number" value="${p.width}" oninput="actualizarPropiedadFoto('${id}', 'width', parseInt(this.value, 10))" />
      </div>
      <div class="form-group">
        <label>Alto (px):</label>
        <input type="number" value="${p.height}" oninput="actualizarPropiedadFoto('${id}', 'height', parseInt(this.value, 10))" />
      </div>
      <div class="form-group">
        <label>Posición X:</label>
        <input type="number" value="${p.x}" oninput="actualizarPropiedadFoto('${id}', 'x', parseInt(this.value, 10))" />
      </div>
      <div class="form-group">
        <label>Posición Y:</label>
        <input type="number" value="${p.y}" oninput="actualizarPropiedadFoto('${id}', 'y', parseInt(this.value, 10))" />
      </div>
      <button class="btn btn-danger btn-sm" style="width:100%; margin-top:8px;" onclick="eliminarElemento('foto', '${id}')"><i class="fa-solid fa-trash"></i> Eliminar Área de Foto</button>
    `;
  } else if (tipo === 'qr') {
    const q = (Array.isArray(state.qr_areas) ? state.qr_areas : []).find(x => x.id === id);
    if (!q) return;

    elements.fieldPropertiesForm.innerHTML = `
      <div class="form-group">
        <label><strong>Área de Código QR (${q.id}):</strong></label>
        <button class="btn btn-primary btn-sm" style="width:100%; margin-top:6px;" onclick="abrirModalQRContent()"><i class="fa-solid fa-gear"></i> Seleccionar / Configurar Contenido</button>
      </div>

      <div style="background:#f8fafc; padding:8px 12px; border-radius:6px; font-size:11px; color:#475569; margin-bottom:12px; border:1px solid #e2e8f0;">
        ${q.es_personalizado ? `<strong>Modo:</strong> QR Personalizado<br><strong>Contenido:</strong> ${q.qr_personalizado || ''}` : `<strong>Modo:</strong> Masivo (Excel)<br><strong>Columna:</strong> ${q.campo_id}`}
      </div>

      <div class="form-group">
        <label>Ancho (px):</label>
        <input type="number" value="${q.width}" oninput="actualizarPropiedadQR('${id}', 'width', parseInt(this.value, 10))" />
      </div>
      <div class="form-group">
        <label>Alto (px):</label>
        <input type="number" value="${q.height}" oninput="actualizarPropiedadQR('${id}', 'height', parseInt(this.value, 10))" />
      </div>
      <div class="form-group">
        <label>Posición X:</label>
        <input type="number" value="${q.x}" oninput="actualizarPropiedadQR('${id}', 'x', parseInt(this.value, 10))" />
      </div>
      <div class="form-group">
        <label>Posición Y:</label>
        <input type="number" value="${q.y}" oninput="actualizarPropiedadQR('${id}', 'y', parseInt(this.value, 10))" />
      </div>
      <button class="btn btn-danger btn-sm" style="width:100%; margin-top:8px;" onclick="eliminarElemento('qr', '${id}')"><i class="fa-solid fa-trash"></i> Eliminar Área de QR</button>
    `;
  }
}

window.actualizarPropiedadCampo = (id, prop, valor) => {
  if (state.posiciones_campos[id]) {
    state.posiciones_campos[id][prop] = valor;
    renderCanvas(false);
    renderPreviewCanvasTab5();
  }
};

window.actualizarModoTexto = (id, esPersonalizado) => {
  if (state.posiciones_campos[id]) {
    state.posiciones_campos[id].es_personalizado = esPersonalizado;
    renderCanvas(true);
    renderPreviewCanvasTab5();
  }
};

window.actualizarPropiedadFoto = (id, prop, valor) => {
  const p = (Array.isArray(state.posiciones_fotos) ? state.posiciones_fotos : []).find(x => x.id === id);
  if (p) {
    p[prop] = valor;
    renderCanvas(false);
    renderPreviewCanvasTab5();
  }
};

window.actualizarPropiedadQR = (id, prop, valor) => {
  const q = (Array.isArray(state.qr_areas) ? state.qr_areas : []).find(x => x.id === id);
  if (q) {
    q[prop] = valor;
    renderCanvas(false);
    renderPreviewCanvasTab5();
  }
};

// 6. Modal Dialogs for Photo & QR Content Selection
window.cerrarModal = function() {
  if (elements.modalOverlay) elements.modalOverlay.style.display = 'none';
};

window.abrirModalFotoContent = function() {
  if (!state.elementoSeleccionado || state.elementoSeleccionado.tipo !== 'foto') return;
  const photo = (state.posiciones_fotos || []).find(p => p.id === state.elementoSeleccionado.id);
  if (!photo) return;

  const hasExcel = !!(state.excelData && state.excelData.columns && state.excelData.columns.length > 0);
  const excelCols = hasExcel ? state.excelData.columns : [];

  elements.modalTitle.innerHTML = '<i class="fa-solid fa-image"></i> Configurar Contenido de Área de Foto';

  let bodyHtml = '';

  if (!hasExcel) {
    bodyHtml += `
      <div class="alert alert-warning">
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 16px;"></i>
        <div><strong>Advertencia:</strong> No se ha importado ningún archivo Excel en la pestaña "2. Datos". Para vincular fotos masivamente se requiere importar un Excel previamente.</div>
      </div>
    `;
  }

  bodyHtml += `
    <div class="form-group">
      <label><strong>Modo de Uso de la Foto:</strong></label>
      <div class="radio-group" style="flex-direction: column; gap: 8px; margin-top: 6px;">
        <label><input type="radio" name="modal_photo_mode" value="masivo" ${!photo.es_especifica ? 'checked' : ''} onchange="toggleModalPhotoMode('masivo')"> Generación Masiva (Carpeta de Fotos + Excel)</label>
        <label><input type="radio" name="modal_photo_mode" value="especifica" ${photo.es_especifica ? 'checked' : ''} onchange="toggleModalPhotoMode('especifica')"> Foto Específica (Para credencial única)</label>
      </div>
    </div>

    <!-- Sección Masiva -->
    <div id="modal-photo-masivo-section" style="display: ${!photo.es_especifica ? 'block' : 'none'}; background:#f8fafc; padding:14px; border-radius:6px; border:1px solid #e2e8f0;">
      <div class="form-group">
        <label>1. Carpeta de Fotos (usadas para la generación):</label>
        <div class="input-with-button">
          <input type="text" id="modal-photo-folder-input" value="${photo.carpeta_fotos || 'fotos para procesar'}" readonly />
          <button class="btn btn-secondary btn-sm" onclick="seleccionarCarpetaModal()"><i class="fa-solid fa-folder-open"></i> Seleccionar Carpeta</button>
        </div>
      </div>

      <div class="form-group" style="margin-bottom:0;">
        <label>2. Columna del Excel para vincular nombre de foto:</label>
        <select id="modal-photo-column-select">
          ${excelCols.map(c => `<option value="${c}" ${photo.campo_id === c ? 'selected' : ''}>${c}</option>`).join('')}
          ${!hasExcel ? '<option value="id_foto">-- Sin Excel importado --</option>' : ''}
        </select>
      </div>
    </div>

    <!-- Sección Específica -->
    <div id="modal-photo-especifica-section" style="display: ${photo.es_especifica ? 'block' : 'none'}; background:#f8fafc; padding:14px; border-radius:6px; border:1px solid #e2e8f0;">
      <div class="form-group" style="margin-bottom:0;">
        <label>Seleccionar Foto Única Específica:</label>
        <div class="input-with-button">
          <input type="text" id="modal-photo-file-input" value="${photo.foto_especifica || ''}" placeholder="Sin imagen elegida..." readonly />
          <button class="btn btn-secondary btn-sm" onclick="seleccionarFotoEspecificaModal()"><i class="fa-solid fa-file-image"></i> Seleccionar Archivo</button>
        </div>
      </div>
    </div>
  `;

  elements.modalBody.innerHTML = bodyHtml;
  elements.btnModalGuardar.onclick = () => guardarModalFotoContent(photo.id);
  elements.modalOverlay.style.display = 'flex';
};

window.toggleModalPhotoMode = function(mode) {
  const masivoSec = document.getElementById('modal-photo-masivo-section');
  const especSec = document.getElementById('modal-photo-especifica-section');
  if (masivoSec && especSec) {
    masivoSec.style.display = mode === 'masivo' ? 'block' : 'none';
    especSec.style.display = mode === 'especifica' ? 'block' : 'none';
  }
};

window.seleccionarCarpetaModal = async function() {
  try {
    const folder = await invoke('cmd_select_folder');
    if (folder) {
      const input = document.getElementById('modal-photo-folder-input');
      if (input) input.value = folder;
    }
  } catch (e) {
    console.error("Error al seleccionar carpeta:", e);
  }
};

window.seleccionarFotoEspecificaModal = async function() {
  try {
    const file = await invoke('cmd_select_image_file');
    if (file) {
      const input = document.getElementById('modal-photo-file-input');
      if (input) input.value = file;
    }
  } catch (e) {
    console.error("Error al seleccionar archivo de foto:", e);
  }
};

function guardarModalFotoContent(photoId) {
  const photo = (state.posiciones_fotos || []).find(p => p.id === photoId);
  if (!photo) return;

  const modeRadio = document.querySelector('input[name="modal_photo_mode"]:checked');
  const isEspecifica = modeRadio ? modeRadio.value === 'especifica' : false;

  photo.es_especifica = isEspecifica;
  if (isEspecifica) {
    const fileInput = document.getElementById('modal-photo-file-input');
    photo.foto_especifica = fileInput ? fileInput.value : '';
  } else {
    const folderInput = document.getElementById('modal-photo-folder-input');
    const colSelect = document.getElementById('modal-photo-column-select');
    if (folderInput) photo.carpeta_fotos = folderInput.value;
    if (colSelect) photo.campo_id = colSelect.value;
  }

  renderCanvas(true);
  renderPreviewCanvasTab5();
  cerrarModal();
}

window.abrirModalQRContent = function() {
  if (!state.elementoSeleccionado || state.elementoSeleccionado.tipo !== 'qr') return;
  const qr = (state.qr_areas || []).find(q => q.id === state.elementoSeleccionado.id);
  if (!qr) return;

  const hasExcel = !!(state.excelData && state.excelData.columns && state.excelData.columns.length > 0);
  const excelCols = hasExcel ? state.excelData.columns : [];

  elements.modalTitle.innerHTML = '<i class="fa-solid fa-qrcode"></i> Configurar Contenido de Área de Código QR';

  let bodyHtml = '';

  if (!hasExcel) {
    bodyHtml += `
      <div class="alert alert-warning">
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 16px;"></i>
        <div><strong>Advertencia:</strong> No se ha importado ningún archivo Excel en la pestaña "2. Datos". Importa un Excel para generar QRs masivos.</div>
      </div>
    `;
  }

  bodyHtml += `
    <div class="form-group">
      <label><strong>Modo de Generación del Código QR:</strong></label>
      <div class="radio-group" style="flex-direction: column; gap: 8px; margin-top: 6px;">
        <label><input type="radio" name="modal_qr_mode" value="masivo" ${!qr.es_personalizado ? 'checked' : ''} onchange="toggleModalQRMode('masivo')"> Generación Masiva (Vinculado a Columna de Excel)</label>
        <label><input type="radio" name="modal_qr_mode" value="personalizado" ${qr.es_personalizado ? 'checked' : ''} onchange="toggleModalQRMode('personalizado')"> Código QR Personalizado (Para credencial única)</label>
      </div>
    </div>

    <!-- Sección Masiva -->
    <div id="modal-qr-masivo-section" style="display: ${!qr.es_personalizado ? 'block' : 'none'}; background:#f8fafc; padding:14px; border-radius:6px; border:1px solid #e2e8f0;">
      <div class="form-group">
        <label>1. Columna del Excel con los datos del QR:</label>
        <select id="modal-qr-column-select">
          ${excelCols.map(c => `<option value="${c}" ${qr.campo_id === c ? 'selected' : ''}>${c}</option>`).join('')}
          ${!hasExcel ? '<option value="id">-- Sin Excel importado --</option>' : ''}
        </select>
      </div>

      <div class="form-group" style="margin-bottom:0;">
        <label>2. Prefijo / URL Base previo (Opcional):</label>
        <input type="text" id="modal-qr-baseurl-input" value="${qr.base_url || 'https://'}" placeholder="Ej: https://midominio.com/validar?id=" />
      </div>
    </div>

    <!-- Sección Personalizada -->
    <div id="modal-qr-personalizado-section" style="display: ${qr.es_personalizado ? 'block' : 'none'}; background:#f8fafc; padding:14px; border-radius:6px; border:1px solid #e2e8f0;">
      <div class="form-group" style="margin-bottom:0;">
        <label>Contenido Estático o URL del Código QR:</label>
        <input type="text" id="modal-qr-custom-input" value="${qr.qr_personalizado || ''}" placeholder="Ej: https://credencial.com/verificar/12300" />
      </div>
    </div>
  `;

  elements.modalBody.innerHTML = bodyHtml;
  elements.btnModalGuardar.onclick = () => guardarModalQRContent(qr.id);
  elements.modalOverlay.style.display = 'flex';
};

window.toggleModalQRMode = function(mode) {
  const masivoSec = document.getElementById('modal-qr-masivo-section');
  const customSec = document.getElementById('modal-qr-personalizado-section');
  if (masivoSec && customSec) {
    masivoSec.style.display = mode === 'masivo' ? 'block' : 'none';
    customSec.style.display = mode === 'personalizado' ? 'block' : 'none';
  }
};

function guardarModalQRContent(qrId) {
  const qr = (state.qr_areas || []).find(q => q.id === qrId);
  if (!qr) return;

  const modeRadio = document.querySelector('input[name="modal_qr_mode"]:checked');
  const isPersonalizado = modeRadio ? modeRadio.value === 'personalizado' : false;

  qr.es_personalizado = isPersonalizado;
  if (isPersonalizado) {
    const customInput = document.getElementById('modal-qr-custom-input');
    qr.qr_personalizado = customInput ? customInput.value : '';
  } else {
    const colSelect = document.getElementById('modal-qr-column-select');
    const baseUrlInput = document.getElementById('modal-qr-baseurl-input');
    if (colSelect) qr.campo_id = colSelect.value;
    if (baseUrlInput) qr.base_url = baseUrlInput.value;
  }

  renderCanvas(true);
  renderPreviewCanvasTab5();
  cerrarModal();
}

// 7. Tab 5 Real Live Preview Canvas Engine
window.cambiarCaraTab5 = function(cara) {
  state.caraActivaTab5 = cara;
  if (elements.btnTab5Delantero && elements.btnTab5Trasero) {
    if (cara === 'delantero') {
      elements.btnTab5Delantero.classList.add('active');
      elements.btnTab5Trasero.classList.remove('active');
    } else {
      elements.btnTab5Trasero.classList.add('active');
      elements.btnTab5Delantero.classList.remove('active');
    }
  }
  renderPreviewCanvasTab5();
};

const previewItemCache = {
  photos: {},
  qrs: {}
};

window.renderPreviewCanvasTab5 = async function() {
  const cvs = elements.tab5PreviewCanvas;
  if (!cvs) return;
  const ctx = cvs.getContext('2d');

  cvs.width = state.config.width_px;
  cvs.height = state.config.height_px;

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cvs.width, cvs.height);

  const cara = state.caraActivaTab5 || 'delantero';
  const bgPath = cara === 'delantero' ? state.archivo_delantero : state.archivo_trasero;
  const bgImg = cara === 'delantero' ? bgImageCache.delanteroImg : bgImageCache.traseroImg;

  if (bgPath) {
    const cachedPath = cara === 'delantero' ? bgImageCache.delanteroPath : bgImageCache.traseroPath;
    if (cachedPath !== bgPath) {
      preloadBackgroundImage(cara, bgPath);
    }
    if (bgImg && bgImg.complete && bgImg.naturalWidth !== 0) {
      ctx.drawImage(bgImg, 0, 0, cvs.width, cvs.height);
    }
  }

  // Determine current selected row data
  let rowData = {};
  if (state.excelData && state.excelData.rows && state.excelData.rows.length > 0) {
    const rowIdx = parseInt((elements.singleCardRowSelect ? elements.singleCardRowSelect.value : '0') || '0', 10);
    rowData = state.excelData.rows[rowIdx] || state.excelData.rows[0];
    if (elements.tab5PreviewInfo) {
      const label = rowData.nombre || rowData.Nombre || rowData.ID || `Registro ${rowIdx + 1}`;
      elements.tab5PreviewInfo.textContent = `Registro ${rowIdx + 1}: ${label}`;
    }
  } else {
    if (elements.tab5PreviewInfo) {
      elements.tab5PreviewInfo.textContent = 'Sin datos de Excel';
    }
  }

  // 1. Draw Photos (Real photos if available; do not draw fallback placeholders in Tab 5 real preview)
  const photos = Array.isArray(state.posiciones_fotos) ? state.posiciones_fotos : [];
  for (const photo of photos) {
    if (photo.cara === cara) {
      let photoSrc = null;
      if (photo.es_especifica && photo.foto_especifica) {
        photoSrc = await getDisplaySrc(photo.foto_especifica);
      } else {
        const photoId = state.mapeo_campos[photo.campo_id] ? rowData[state.mapeo_campos[photo.campo_id]] : (rowData[photo.campo_id] || rowData['id'] || rowData['ID'] || '');
        if (photoId && photo.carpeta_fotos) {
          const cacheKey = `${photo.carpeta_fotos}___${photoId}`;
          if (previewItemCache.photos[cacheKey]) {
            photoSrc = previewItemCache.photos[cacheKey];
          } else {
            try {
              const base64 = await invoke('cmd_get_photo_base64', { folder: photo.carpeta_fotos, photoId: photoId.toString() });
              if (base64) {
                previewItemCache.photos[cacheKey] = base64;
                photoSrc = base64;
              }
            } catch (e) {
              console.warn("Error fetching preview photo:", e);
            }
          }
        }
      }

      if (photoSrc) {
        let pImg = previewItemCache.photos[photoSrc + '_img'];
        if (!pImg) {
          pImg = new Image();
          pImg.src = photoSrc;
          previewItemCache.photos[photoSrc + '_img'] = pImg;
          pImg.onload = () => window.renderPreviewCanvasTab5();
        } else if (pImg.complete && pImg.naturalWidth !== 0) {
          ctx.drawImage(pImg, photo.x, photo.y, photo.width, photo.height);
        }
      }
    }
  }

  // 2. Draw QRs (Real QRs if available; do not draw fallback placeholders in Tab 5 real preview)
  const qrs = Array.isArray(state.qr_areas) ? state.qr_areas : [];
  for (const qr of qrs) {
    if (qr.cara === cara) {
      let fullContent = '';
      if (qr.es_personalizado && qr.qr_personalizado) {
        fullContent = qr.qr_personalizado;
      } else {
        const val = state.mapeo_campos[qr.campo_id] ? rowData[state.mapeo_campos[qr.campo_id]] : (rowData[qr.campo_id] || rowData['id'] || rowData['ID'] || '');
        if (val) {
          fullContent = `${qr.base_url || ''}${val}`;
        }
      }

      if (fullContent) {
        const cacheKey = `qr___${fullContent}_${qr.width}_${qr.height}`;
        let qrDataUrl = previewItemCache.qrs[cacheKey];
        if (!qrDataUrl) {
          try {
            qrDataUrl = await invoke('cmd_generate_qr_preview', { content: fullContent, width: qr.width, height: qr.height });
            previewItemCache.qrs[cacheKey] = qrDataUrl;
          } catch (e) {
            console.warn("Error generating QR preview:", e);
          }
        }

        if (qrDataUrl) {
          let qImg = previewItemCache.qrs[qrDataUrl + '_img'];
          if (!qImg) {
            qImg = new Image();
            qImg.src = qrDataUrl;
            previewItemCache.qrs[qrDataUrl + '_img'] = qImg;
            qImg.onload = () => window.renderPreviewCanvasTab5();
          } else if (qImg.complete && qImg.naturalWidth !== 0) {
            ctx.drawImage(qImg, qr.x, qr.y, qr.width, qr.height);
          }
        }
      }
    }
  }

  // 3. Draw Mapped & Wrapped Text Fields using matching DejaVu Sans font
  Object.keys(state.posiciones_campos || {}).forEach(key => {
    const field = state.posiciones_campos[key];
    if (field.cara === cara) {
      let displayText = '';
      if (field.es_personalizado && field.texto_personalizado) {
        displayText = field.texto_personalizado;
      } else {
        const col = state.mapeo_campos[key];
        if (col && rowData[col] !== undefined && rowData[col] !== null && rowData[col] !== '') {
          displayText = rowData[col];
        } else if (rowData[key] !== undefined && rowData[key] !== null && rowData[key] !== '') {
          displayText = rowData[key];
        } else {
          displayText = field.etiqueta;
        }
      }

      if (!displayText) return;

      ctx.fillStyle = field.color || '#000000';
      ctx.font = `${field.font_size}px 'DejaVu Sans', Inter, sans-serif`;
      ctx.textBaseline = 'top';

      const maxWidth = field.width || 300;
      const lines = wrapTextLines(ctx, displayText, maxWidth);
      const lineHeight = Math.round(field.font_size * 1.15);

      lines.forEach((lineStr, idx) => {
        ctx.fillText(lineStr, field.x, field.y + (idx * lineHeight));
      });
    }
  });
};

// 8. Generation Engine (Direct PDF Generation)
window.cambiarModoGeneracion = function(modo) {
  state.modoGeneracion = modo;
};

elements.btnGenerarAction.addEventListener('click', async () => {
  const outputDir = elements.outputDirPathInput.value;
  elements.progressSection.style.display = 'block';

  let rowsToProcess = [];

  if (state.modoGeneracion === 'unica') {
    if (state.excelData && state.excelData.rows && state.excelData.rows.length > 0) {
      const selectedIndex = parseInt(elements.singleCardRowSelect.value || '0', 10);
      const row = state.excelData.rows[selectedIndex] || state.excelData.rows[0];
      rowsToProcess = [row];
    } else {
      rowsToProcess = [{}];
    }
    elements.progressText.textContent = "Generando archivo PDF para credencial única...";
  } else {
    if (!state.excelData || !state.excelData.rows || state.excelData.rows.length === 0) {
      alert("Por favor carga un archivo Excel primero en la pestaña '2. Datos' para la generación masiva.");
      elements.progressSection.style.display = 'none';
      return;
    }
    rowsToProcess = state.excelData.rows;
    elements.progressText.textContent = `Procesando ${rowsToProcess.length} credenciales masivas en PDF con Rust...`;
  }

  elements.progressBarFill.style.width = '50%';

  try {
    const templateState = {
      config: state.config,
      archivo_delantero: state.archivo_delantero,
      archivo_trasero: state.archivo_trasero,
      posiciones_campos: state.posiciones_campos,
      posiciones_fotos: state.posiciones_fotos,
      qr_areas: state.qr_areas,
      mapeo_campos: state.mapeo_campos
    };

    const total = await invoke('cmd_generate_batch_cards', {
      state: templateState,
      rows: rowsToProcess,
      outputDir
    });

    elements.progressBarFill.style.width = '100%';
    elements.progressText.textContent = `Éxito. Se generaron ${total} credencial(es) en PDF en la carpeta '${outputDir}'.`;
    alert(`Éxito. Se han generado ${total} credencial(es) en formato PDF en la carpeta: ${outputDir}`);
  } catch (err) {
    alert(`Error en generación de PDF: ${err}`);
    elements.progressText.textContent = "Error en la generación";
  }
});

// Directory picker for output folder
if (elements.btnSelectOutputDir) {
  elements.btnSelectOutputDir.addEventListener('click', async () => {
    try {
      const folder = await invoke('cmd_select_folder');
      if (folder) {
        elements.outputDirPathInput.value = folder;
      }
    } catch (err) {
      console.error("Error al seleccionar carpeta de salida:", err);
    }
  });
}

// 9. Management of Printing Profiles (SQLite & Sync)
async function cargarPerfilesImpresion() {
  try {
    const profiles = await invoke('cmd_get_profiles');
    state.allProfiles = profiles || [];

    window.filtrarPerfilesDiseno('');
    renderProfilesTab5(state.allProfiles);
  } catch (err) {
    console.error("[DEBUG JS Error] Error al cargar perfiles:", err);
  }
}

window.filtrarPerfilesDiseno = function(query) {
  const q = (query || '').toLowerCase().trim();
  const filtered = (state.allProfiles || []).filter(p => p.nombre.toLowerCase().includes(q));
  renderProfilesTab4(filtered, query);
};

function renderProfilesTab4(profiles, query = '') {
  const container = document.getElementById('tab4-profiles-list-container');
  if (!container) return;

  if (!profiles || profiles.length === 0) {
    container.innerHTML = query 
      ? '<p class="subtle-text">No se encontraron perfiles.</p>' 
      : '<p class="subtle-text">No hay perfiles guardados.</p>';
    return;
  }

  let html = '';
  profiles.forEach(p => {
    const jsonEscaped = encodeURIComponent(p.config_json);
    html += `
      <div class="profile-item" style="padding: 6px 10px;">
        <div class="profile-info">
          <span class="profile-name" style="font-size:12px;">${p.nombre}</span>
        </div>
        <div class="profile-btns">
          <button class="btn btn-xs btn-primary" onclick="cargarPerfilConfig('${jsonEscaped}')"><i class="fa-solid fa-folder-open"></i></button>
          <button class="btn btn-xs btn-outline" onclick="eliminarPerfilConfig('${p.nombre}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function renderProfilesTab5(profiles) {
  const container = document.getElementById('profiles-list-container');
  if (!container) return;

  if (!profiles || profiles.length === 0) {
    container.innerHTML = '<p class="subtle-text">No hay perfiles guardados en la base de datos.</p>';
    return;
  }

  let html = '';
  profiles.forEach(p => {
    const jsonEscaped = encodeURIComponent(p.config_json);
    html += `
      <div class="profile-item">
        <div class="profile-info">
          <span class="profile-name">[Perfil] ${p.nombre}</span>
          <span class="profile-date">Creado: ${p.creado || 'Desconocido'}</span>
        </div>
        <div class="profile-btns">
          <button class="btn btn-sm btn-primary" onclick="cargarPerfilConfig('${jsonEscaped}')">Cargar</button>
          <button class="btn btn-sm btn-outline" onclick="eliminarPerfilConfig('${p.nombre}')">Eliminar</button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function normalizarFotos(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  let list = [];
  if (typeof data === 'object') {
    Object.keys(data).forEach(cara => {
      if (Array.isArray(data[cara])) {
        data[cara].forEach((item, idx) => {
          list.push({
            id: item.id || `foto_${cara}_${idx}`,
            cara: item.cara || cara,
            x: item.x || 0,
            y: item.y || 0,
            width: item.width || item.w || 200,
            height: item.height || item.h || 250,
            campo_id: item.campo_id || 'id_foto',
            carpeta_fotos: item.carpeta_fotos || 'fotos para procesar',
            es_especifica: item.es_especifica || false,
            foto_especifica: item.foto_especifica || ''
          });
        });
      }
    });
  }
  return list;
}

function normalizarQRs(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  let list = [];
  if (typeof data === 'object') {
    Object.keys(data).forEach(cara => {
      if (Array.isArray(data[cara])) {
        data[cara].forEach((item, idx) => {
          list.push({
            id: item.id || `qr_${cara}_${idx}`,
            cara: item.cara || cara,
            x: item.x || 0,
            y: item.y || 0,
            width: item.width || item.w || 150,
            height: item.height || item.h || 150,
            campo_id: item.campo_id || 'id',
            base_url: item.base_url || 'https://',
            es_personalizado: item.es_personalizado || false,
            qr_personalizado: item.qr_personalizado || ''
          });
        });
      }
    });
  }
  return list;
}

window.guardarPerfilDesdeDiseno = async function() {
  const nameInput = document.getElementById('diseno-profile-name');
  const nombre = nameInput ? nameInput.value.trim() : '';
  if (!nombre) {
    alert("Por favor ingresa un nombre para el perfil.");
    return;
  }
  await ejecutarGuardarPerfil(nombre);
  if (nameInput) nameInput.value = '';
};

window.guardarPerfilActual = async function() {
  const nameInput = document.getElementById('profile-name-input');
  const nombre = nameInput ? nameInput.value.trim() : '';
  if (!nombre) {
    alert("Por favor ingresa un nombre para el perfil.");
    return;
  }
  await ejecutarGuardarPerfil(nombre);
  if (nameInput) nameInput.value = '';
};

async function ejecutarGuardarPerfil(nombre) {
  const currentConfig = {
    config: state.config,
    archivo_delantero: state.archivo_delantero,
    archivo_trasero: state.archivo_trasero,
    posiciones_campos: state.posiciones_campos,
    posiciones_fotos: state.posiciones_fotos,
    qr_areas: state.qr_areas,
    mapeo_campos: state.mapeo_campos
  };

  const configJson = JSON.stringify(currentConfig);

  try {
    await invoke('cmd_save_profile', { nombre, configJson });
    alert(`Perfil '${nombre}' guardado exitosamente.`);
    await cargarPerfilesImpresion();
  } catch (err) {
    alert(`Error al guardar perfil: ${err}`);
  }
}

window.cargarPerfilConfig = function(jsonEscaped) {
  try {
    const jsonStr = decodeURIComponent(jsonEscaped);
    const cfg = JSON.parse(jsonStr);

    if (cfg.config) state.config = cfg.config;

    if (cfg.archivo_delantero && typeof cfg.archivo_delantero === 'string' && !cfg.archivo_delantero.startsWith('C:') && !cfg.archivo_delantero.startsWith('C\\')) {
      state.archivo_delantero = cfg.archivo_delantero;
      getDisplaySrc(cfg.archivo_delantero).then(src => {
        if (elements.previewDelanteroBox && src) {
          elements.previewDelanteroBox.innerHTML = `<img src="${src}" alt="Delantero" />`;
        }
      });
    }

    if (cfg.archivo_trasero && typeof cfg.archivo_trasero === 'string' && !cfg.archivo_trasero.startsWith('C:') && !cfg.archivo_trasero.startsWith('C\\')) {
      state.archivo_trasero = cfg.archivo_trasero;
      getDisplaySrc(cfg.archivo_trasero).then(src => {
        if (elements.previewTraseroBox && src) {
          elements.previewTraseroBox.innerHTML = `<img src="${src}" alt="Trasero" />`;
        }
      });
    }

    if (cfg.posiciones_campos) state.posiciones_campos = cfg.posiciones_campos;
    state.posiciones_fotos = normalizarFotos(cfg.posiciones_fotos);
    state.qr_areas = normalizarQRs(cfg.qr_areas);
    if (cfg.mapeo_campos) state.mapeo_campos = cfg.mapeo_campos;

    if (elements.tamanoMmSelect && state.config.tamano_mm) elements.tamanoMmSelect.value = state.config.tamano_mm;
    if (elements.dpiSelect && state.config.dpi) elements.dpiSelect.value = state.config.dpi;

    calcularResolucion();
    renderCanvas();
    autoAjustarYCentrarContenido(false);
    if (state.excelData) renderMappingTab(state.excelData);
    renderPreviewCanvasTab5();

    alert("Perfil de impresión cargado y aplicado correctamente.");
  } catch (err) {
    console.error("[DEBUG JS Error] Error al cargar el perfil:", err);
    alert(`Error al cargar el perfil: ${err}`);
  }
};

window.eliminarPerfilConfig = async function(nombre) {
  if (!confirm(`¿Estás seguro de que deseas eliminar el perfil '${nombre}'?`)) return;

  try {
    await invoke('cmd_delete_profile', { nombre });
    await cargarPerfilesImpresion();
  } catch (err) {
    alert(`Error al eliminar perfil: ${err}`);
  }
};

async function cargarFuenteDejaVu() {
  try {
    if (typeof FontFace !== 'undefined') {
      const font = new FontFace('DejaVu Sans', 'url(fonts/DejaVuSans.ttf)');
      const loadedFont = await font.load();
      document.fonts.add(loadedFont);
      console.log("[DEBUG] Fuente 'DejaVu Sans' cargada dinámicamente.");
      renderCanvas();
      renderPreviewCanvasTab5();
    }
  } catch (err) {
    console.warn("[DEBUG] No se pudo cargar dinámicamente DejaVu Sans:", err);
  }
}

// Hook btn-guardar-perfil listener
document.addEventListener('DOMContentLoaded', () => {
  const btnSave = document.getElementById('btn-guardar-perfil');
  if (btnSave) {
    btnSave.addEventListener('click', window.guardarPerfilActual);
  }
  cargarFuenteDejaVu();
  setTimeout(cargarPerfilesImpresion, 100);
});
