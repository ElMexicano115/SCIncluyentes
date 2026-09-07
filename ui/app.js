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
    nombre: { nombre: "nombre", etiqueta: "Nombre Completo", x: 100, y: 150, font_size: 40, color: "#000000", cara: "delantero" },
    cargo: { nombre: "cargo", etiqueta: "Cargo / Puesto", x: 100, y: 220, font_size: 32, color: "#333333", cara: "delantero" },
    empresa: { nombre: "empresa", etiqueta: "Empresa", x: 100, y: 280, font_size: 32, color: "#3b82f6", cara: "delantero" },
  },
  posiciones_fotos: [
    { id: "foto1", cara: "delantero", x: 700, y: 100, width: 220, height: 280, campo_id: "id_foto", carpeta_fotos: "fotos para procesar" }
  ],
  qr_areas: [
    { id: "qr1", cara: "trasero", x: 100, y: 100, width: 180, height: 180, campo_id: "id", base_url: "https://credencial.valida/" }
  ],
  mapeo_campos: {},
  caraActiva: "delantero",
  elementoSeleccionado: null, // { tipo: 'campo'|'foto'|'qr', id: string }
  isDragging: false,
  dragOffset: { x: 0, y: 0 },
  zoomLevel: 1.0,
  hasAutoFitted: false
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
  btnGenerarTodas: document.getElementById('btn-generar-todas'),
  btnExportarPdf: document.getElementById('btn-exportar-pdf'),
  progressSection: document.getElementById('progress-section'),
  progressBarFill: document.getElementById('progress-bar-fill'),
  progressText: document.getElementById('progress-text'),
  footerStatus: document.getElementById('footer-status'),
};

// 1. Initialization
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupConfigListeners();
  setupCanvas();
  calcularResolucion();
  renderCanvas();
});

// 2. Navigation
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
      }
    });
  });
}

// 3. Config Calculations
function calcularResolucion() {
  const mm = parseFloat(elements.tamanoMmSelect.value);
  const dpi = parseInt(elements.dpiSelect.value, 10);
  let orientacion = "horizontal";
  elements.orientacionRadios.forEach(r => { if (r.checked) orientacion = r.value; });

  const inches = mm / 25.4;
  const px = Math.round(inches * dpi);

  state.config.dpi = dpi;
  state.config.tamano_mm = mm;
  state.config.orientacion = orientacion;

  if (orientacion === "horizontal") {
    state.config.width_px = Math.round(px * 1.6);
    state.config.height_px = px;
  } else {
    state.config.width_px = px;
    state.config.height_px = Math.round(px * 1.6);
  }

  elements.resolutionText.textContent = `${state.config.width_px} x ${state.config.height_px} px`;
  
  if (elements.canvas) {
    elements.canvas.width = state.config.width_px;
    elements.canvas.height = state.config.height_px;
    renderCanvas();
  }
}

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

// Synchronous Image Cache to eliminate flickering during canvas updates
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

  // Blank template creation
  elements.btnCrearBlanco.addEventListener('click', async () => {
    const color = elements.blankColorInput.value;
    elements.footerStatus.textContent = "Generando plantillas en blanco...";
    
    try {
      await invoke('cmd_create_blank_template', {
        width: state.config.width_px,
        height: state.config.height_px,
        colorHex: color,
        savePath: "plantilla_delantero.png"
      });

      await invoke('cmd_create_blank_template', {
        width: state.config.width_px,
        height: state.config.height_px,
        colorHex: color,
        savePath: "plantilla_trasero.png"
      });

      state.archivo_delantero = "plantilla_delantero.png";
      state.archivo_trasero = "plantilla_trasero.png";

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
  console.log("[DEBUG JS] Usuario hizo clic en 'Importar Archivo Excel'. Invocando cmd_select_excel_file...");
  elements.excelStatus.textContent = "Abriendo selector de archivos...";

  try {
    const path = await invoke('cmd_select_excel_file');
    console.log("[DEBUG JS] Resultado de cmd_select_excel_file:", path);
    if (path && typeof path === 'string' && path.length > 0) {
      await cargarExcelDesdeRuta(path);
    } else {
      console.log("[DEBUG JS] Selección cancelada o vacía.");
      elements.excelStatus.textContent = "Sin datos cargados";
    }
  } catch (err) {
    console.error("[DEBUG JS Error] Excepción en seleccionarArchivoExcel:", err);
    elements.excelStatus.textContent = "Error al abrir selector de archivo";
  }
};

async function cargarExcelDesdeRuta(path) {
  console.log(`[DEBUG JS] Leyendo archivo Excel desde: '${path}'`);
  elements.excelStatus.textContent = "Cargando Excel...";
  elements.footerStatus.textContent = `Leyendo: ${path}`;

  try {
    const res = await invoke('cmd_read_excel', { path });
    console.log("[DEBUG JS] Respuesta de cmd_read_excel:", res);
    if (res) {
      state.excelData = res;
      elements.excelStatus.textContent = `${res.total_rows} registros cargados (${res.columns.length} columnas)`;
      elements.footerStatus.textContent = "Excel cargado correctamente";
      renderExcelTable(res);
      renderMappingTab(res);
    } else {
      console.error("[DEBUG JS Error] Respuesta vacía de Excel");
      elements.excelStatus.textContent = "Error: Respuesta vacía de Excel";
    }
  } catch (err) {
    console.error(`[DEBUG JS Error] Error al leer Excel (${path}):`, err);
    alert(`Error al leer Excel (${path}): ${err}`);
    elements.excelStatus.textContent = "Error de carga";
    elements.footerStatus.textContent = "Error al leer Excel";
  }
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
  if (!data || !data.columns) return;

  let html = '<div class="mapping-list">';
  Object.keys(state.posiciones_campos).forEach(campoKey => {
    const campo = state.posiciones_campos[campoKey];
    html += `
      <div class="mapping-item form-group">
        <label>Campo "${campo.etiqueta}" (${campo.cara}):</label>
        <select onchange="actualizarMapeo('${campoKey}', this.value)">
          <option value="">-- Sin mapear --</option>
          ${data.columns.map(c => `<option value="${c}" ${state.mapeo_campos[campoKey] === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
    `;
  });
  html += '</div>';

  elements.mappingContainer.innerHTML = html;
}

window.actualizarMapeo = (campoKey, columna) => {
  state.mapeo_campos[campoKey] = columna;
  renderCanvas();
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
  if (elements.canvasInfo) {
    elements.canvasInfo.textContent = `Lado: ${state.caraActiva === 'delantero' ? 'Delantero' : 'Trasero'} | Zoom: ${Math.round(state.zoomLevel * 100)}%`;
  }

  if (scrollCenter && elements.canvasContainer) {
    setTimeout(() => {
      const scrollX = (elements.canvasContainer.scrollWidth - elements.canvasContainer.clientWidth) / 2;
      const scrollY = (elements.canvasContainer.scrollHeight - elements.canvasContainer.clientHeight) / 2;
      elements.canvasContainer.scrollLeft = Math.max(0, scrollX);
      elements.canvasContainer.scrollTop = Math.max(0, scrollY);
    }, 30);
  }
}

// 5. Visual Drag & Drop Canvas Engine
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
      cara: state.caraActiva
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
      carpeta_fotos: "fotos para procesar"
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
      base_url: "https://"
    });
    state.elementoSeleccionado = { tipo: 'qr', id };
    renderCanvas();
  });

  // Canvas Mouse Interaction for Drag & Drop
  const cvs = elements.canvas;
  cvs.addEventListener('mousedown', (e) => {
    const rect = cvs.getBoundingClientRect();
    const scaleX = cvs.width / rect.width;
    const scaleY = cvs.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    let hit = null;

    // Fields
    Object.keys(state.posiciones_campos || {}).forEach(key => {
      const f = state.posiciones_campos[key];
      if (f.cara === state.caraActiva) {
        if (mouseX >= f.x && mouseX <= f.x + 200 && mouseY >= f.y - f.font_size && mouseY <= f.y + 10) {
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
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!state.isDragging || !state.elementoSeleccionado) return;

    const rect = cvs.getBoundingClientRect();
    const scaleX = cvs.width / rect.width;
    const scaleY = cvs.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const newX = Math.max(0, Math.round(mouseX - state.dragOffset.x));
    const newY = Math.max(0, Math.round(mouseY - state.dragOffset.y));

    if (state.elementoSeleccionado.tipo === 'campo' && state.posiciones_campos[state.elementoSeleccionado.id]) {
      state.posiciones_campos[state.elementoSeleccionado.id].x = newX;
      state.posiciones_campos[state.elementoSeleccionado.id].y = newY;
    } else if (state.elementoSeleccionado.tipo === 'foto') {
      const list = Array.isArray(state.posiciones_fotos) ? state.posiciones_fotos : [];
      const item = list.find(p => p.id === state.elementoSeleccionado.id);
      if (item) { item.x = newX; item.y = newY; }
    } else if (state.elementoSeleccionado.tipo === 'qr') {
      const list = Array.isArray(state.qr_areas) ? state.qr_areas : [];
      const item = list.find(q => q.id === state.elementoSeleccionado.id);
      if (item) { item.x = newX; item.y = newY; }
    }

    renderCanvas(false);
  });

  window.addEventListener('mouseup', () => {
    if (state.isDragging) {
      state.isDragging = false;
      renderCanvas(true);
    }
  });
}

function drawCanvasOverlay(ctx) {
  // Draw photos
  (Array.isArray(state.posiciones_fotos) ? state.posiciones_fotos : []).forEach(photo => {
    if (photo.cara === state.caraActiva) {
      ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.fillRect(photo.x, photo.y, photo.width, photo.height);
      ctx.strokeRect(photo.x, photo.y, photo.width, photo.height);

      ctx.fillStyle = '#3b82f6';
      ctx.font = '16px Inter, sans-serif';
      ctx.fillText(`[Foto: ${photo.campo_id}]`, photo.x + 10, photo.y + 30);
    }
  });

  // Draw QRs
  (Array.isArray(state.qr_areas) ? state.qr_areas : []).forEach(qr => {
    if (qr.cara === state.caraActiva) {
      ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.fillRect(qr.x, qr.y, qr.width, qr.height);
      ctx.strokeRect(qr.x, qr.y, qr.width, qr.height);

      ctx.fillStyle = '#10b981';
      ctx.font = '16px Inter, sans-serif';
      ctx.fillText(`[QR Code]`, qr.x + 10, qr.y + 30);
    }
  });

  // Draw Text Fields
  Object.keys(state.posiciones_campos || {}).forEach(key => {
    const field = state.posiciones_campos[key];
    if (field.cara === state.caraActiva) {
      ctx.fillStyle = field.color || '#000000';
      ctx.font = `${field.font_size}px Inter, sans-serif`;
      ctx.fillText(field.etiqueta, field.x, field.y);

      // Selection box
      if (state.elementoSeleccionado && state.elementoSeleccionado.id === key) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(field.x - 5, field.y - field.font_size, 250, field.font_size + 10);
        ctx.setLineDash([]);
      }
    }
  });
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

  // Draw overlay items synchronously
  drawCanvasOverlay(ctx);

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
      html += `<li class="${selected}" onclick="seleccionarElemento('campo', '${key}')">[Texto] ${f.etiqueta} <button class="btn btn-xs btn-outline" onclick="eliminarElemento('campo', '${key}')">Eliminar</button></li>`;
    }
  });

  (Array.isArray(state.posiciones_fotos) ? state.posiciones_fotos : []).forEach(p => {
    if (p.cara === state.caraActiva) {
      const selected = state.elementoSeleccionado && state.elementoSeleccionado.id === p.id ? 'selected' : '';
      html += `<li class="${selected}" onclick="seleccionarElemento('foto', '${p.id}')">[Foto] Área Foto (${p.campo_id})</li>`;
    }
  });

  (Array.isArray(state.qr_areas) ? state.qr_areas : []).forEach(q => {
    if (q.cara === state.caraActiva) {
      const selected = state.elementoSeleccionado && state.elementoSeleccionado.id === q.id ? 'selected' : '';
      html += `<li class="${selected}" onclick="seleccionarElemento('qr', '${q.id}')">[QR] Código QR</li>`;
    }
  });

  elements.canvasElementsList.innerHTML = html;
}

window.seleccionarElemento = (tipo, id) => {
  state.elementoSeleccionado = { tipo, id };
  renderCanvas(true);
};

window.eliminarElemento = (tipo, id) => {
  if (tipo === 'campo') {
    delete state.posiciones_campos[id];
  }
  state.elementoSeleccionado = null;
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
        <label>Tamaño de Fuente (px):</label>
        <input type="number" value="${f.font_size}" min="8" max="200" oninput="actualizarPropiedadCampo('${id}', 'font_size', parseInt(this.value, 10))" />
      </div>
      <div class="form-group">
        <label>Color del Texto:</label>
        <input type="color" value="${f.color}" oninput="actualizarPropiedadCampo('${id}', 'color', this.value)" />
      </div>
      <div class="form-group">
        <label>Posición X:</label>
        <input type="number" value="${f.x}" oninput="actualizarPropiedadCampo('${id}', 'x', parseInt(this.value, 10))" />
      </div>
      <div class="form-group">
        <label>Posición Y:</label>
        <input type="number" value="${f.y}" oninput="actualizarPropiedadCampo('${id}', 'y', parseInt(this.value, 10))" />
      </div>
    `;
  }
}

window.actualizarPropiedadCampo = (id, prop, valor) => {
  if (state.posiciones_campos[id]) {
    state.posiciones_campos[id][prop] = valor;
    renderCanvas(false);
  }
};

// 6. Batch Generation & PDF Export
elements.btnGenerarTodas.addEventListener('click', async () => {
  if (!state.excelData || !state.excelData.rows || state.excelData.rows.length === 0) {
    alert("Por favor carga un archivo Excel primero en la pestaña 'Datos Excel'.");
    return;
  }

  const outputDir = elements.outputDirPathInput.value;
  elements.progressSection.style.display = 'block';
  elements.progressText.textContent = "Procesando credenciales en paralelo con Rust...";
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
      rows: state.excelData.rows,
      outputDir
    });

    elements.progressBarFill.style.width = '100%';
    elements.progressText.textContent = `Éxito. Se generaron ${total} tarjetas en '${outputDir}'.`;
    alert(`Éxito. Se han generado ${total} tarjetas en la carpeta: ${outputDir}`);
  } catch (err) {
    alert(`Error en generación masiva: ${err}`);
    elements.progressText.textContent = "Error en la generación";
  }
});

// 7. Management of Printing Profiles (SQLite)
async function cargarPerfilesImpresion() {
  console.log("[DEBUG JS] Obteniendo perfiles de impresión desde SQLite...");
  try {
    const profiles = await invoke('cmd_get_profiles');
    console.log("[DEBUG JS] Perfiles obtenidos:", profiles);
    state.allProfiles = profiles || [];
    
    // Clear search input if present
    const searchInput = document.getElementById('tab1-profile-search');
    const query = searchInput ? searchInput.value : '';
    
    window.filtrarPerfilesTab1(query);
    renderProfilesTab5(state.allProfiles);
  } catch (err) {
    console.error("[DEBUG JS Error] Error al cargar perfiles:", err);
  }
}

window.filtrarPerfilesTab1 = function(query) {
  const q = (query || '').toLowerCase().trim();
  const filtered = (state.allProfiles || []).filter(p => p.nombre.toLowerCase().includes(q));
  renderProfilesTab1(filtered, query);
};

function renderProfilesTab1(profiles, query = '') {
  const container = document.getElementById('tab1-profiles-list-container');
  if (!container) return;

  if (!profiles || profiles.length === 0) {
    container.innerHTML = query 
      ? '<p class="subtle-text">No se encontraron perfiles coincidentes.</p>' 
      : '<p class="subtle-text">No hay perfiles guardados en la base de datos.</p>';
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
    html += `
      <div class="profile-item">
        <div class="profile-info">
          <span class="profile-name">[Perfil] ${p.nombre}</span>
          <span class="profile-date">Creado: ${p.creado || 'Desconocido'}</span>
        </div>
        <div class="profile-btns">
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
            carpeta_fotos: item.carpeta_fotos || 'fotos para procesar'
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
            base_url: item.base_url || 'https://'
          });
        });
      }
    });
  }
  return list;
}

window.guardarPerfilActual = async function() {
  const nameInput = document.getElementById('profile-name-input');
  const nombre = nameInput ? nameInput.value.trim() : '';

  if (!nombre) {
    alert("Por favor ingresa un nombre para el perfil.");
    return;
  }

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
  console.log(`[DEBUG JS] Guardando perfil '${nombre}'...`);

  try {
    await invoke('cmd_save_profile', { nombre, configJson });
    alert(`Perfil '${nombre}' guardado exitosamente en SQLite.`);
    if (nameInput) nameInput.value = '';
    await cargarPerfilesImpresion();
  } catch (err) {
    alert(`Error al guardar perfil: ${err}`);
  }
};

window.cargarPerfilConfig = function(jsonEscaped) {
  try {
    const jsonStr = decodeURIComponent(jsonEscaped);
    const cfg = JSON.parse(jsonStr);

    console.log("[DEBUG JS] Aplicando perfil cargado:", cfg);

    if (cfg.config) state.config = cfg.config;

    // Preserve valid Linux background image paths and ignore Windows legacy paths (C:\...)
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

    // Update UI controls
    if (elements.tamanoMmSelect && state.config.tamano_mm) elements.tamanoMmSelect.value = state.config.tamano_mm;
    if (elements.dpiSelect && state.config.dpi) elements.dpiSelect.value = state.config.dpi;

    calcularResolucion();
    renderCanvas();
    autoAjustarYCentrarContenido(false);
    if (state.excelData) renderMappingTab(state.excelData);

    alert("Perfil de impresión cargado y aplicado correctamente. Puedes seleccionar imágenes locales de fondo si lo deseas.");
  } catch (err) {
    console.error("[DEBUG JS Error] Error al cargar la configuración del perfil:", err);
    alert(`Error al cargar la configuración del perfil: ${err}`);
  }
};

window.eliminarPerfilConfig = async function(nombre) {
  if (!confirm(`¿Estás seguro de que deseas eliminar el perfil '${nombre}'?`)) return;

  console.log(`[DEBUG JS] Eliminando perfil '${nombre}'...`);
  try {
    await invoke('cmd_delete_profile', { nombre });
    await cargarPerfilesImpresion();
  } catch (err) {
    alert(`Error al eliminar perfil: ${err}`);
  }
};

// Hook btn-guardar-perfil listener
document.addEventListener('DOMContentLoaded', () => {
  const btnSave = document.getElementById('btn-guardar-perfil');
  if (btnSave) {
    btnSave.addEventListener('click', window.guardarPerfilActual);
  }
  // Load initial profiles from SQLite
  setTimeout(cargarPerfilesImpresion, 100);
});
