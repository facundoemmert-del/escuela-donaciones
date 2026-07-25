import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, onSnapshot, query, doc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let objetivoSeleccionado = null;
let objetivosPublicosCache = [];
let categoriasPublicasCache = [];
let categoriaPublicaActiva = null;

const formatoPesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

function calcularPorcentaje(r, p) { if (!p || p <= 0) return 0; return Math.min(100, Math.round((r / p) * 100)); }

function obtenerYoutubeIdPublico(url){
  if(!url) return "";
  const patrones=[
    /youtu\.be\/([^?&]+)/,
    /youtube\.com\/watch\?v=([^?&]+)/,
    /youtube\.com\/embed\/([^?&]+)/,
    /youtube\.com\/shorts\/([^?&]+)/
  ];
  for(const p of patrones){
    const m=url.match(p);
    if(m&&m[1]) return m[1];
  }
  return "";
}

function renderMediaPublica(url,tipo,titulo=""){
  if(!url) return "";
  const tipoReal=tipo||"imagen";
  if(tipoReal==="youtube"){
    const id=obtenerYoutubeIdPublico(url);
    if(!id) return `<a href="${url}" target="_blank">Ver video</a>`;
    return `<iframe src="https://www.youtube.com/embed/${id}" title="${titulo}" allowfullscreen></iframe>`;
  }
  if(tipoReal==="video"){
    return `<video src="${url}" controls></video>`;
  }
  return `<img src="${url}" alt="${titulo}">`;
}

function textoAHtml(t) { if (!t) return ""; return t.split("\n").map(l => `<p>${l}</p>`).join(""); }

function formatearFechaPublica(valor){
  if(!valor) return "sin fecha";
  let fecha=null;
  if(valor.toDate) fecha=valor.toDate();
  else if(valor.seconds) fecha=new Date(valor.seconds*1000);
  else fecha=new Date(valor);
  if(isNaN(fecha.getTime())) return "sin fecha";
  return fecha.toLocaleDateString("es-AR");
}

function nombreOculto(){
  return "********";
}

document.querySelectorAll(".public-tab-btn").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll(".public-tab-btn").forEach(x => x.classList.remove("activo"));
  document.querySelectorAll(".public-panel").forEach(p => p.classList.remove("activo"));
  b.classList.add("activo");
  document.getElementById(b.dataset.publicTab).classList.add("activo");
  window.scrollTo({ top: 0, behavior: "smooth" });
}));

async function copiarTexto(texto, mensaje) {
  if (!texto || texto === "No cargado") {
    document.getElementById("mensajeCopiado").textContent = "Dato no cargado.";
    return;
  }
  try {
    await navigator.clipboard.writeText(texto);
    document.getElementById("mensajeCopiado").textContent = mensaje;
  } catch {
    document.getElementById("mensajeCopiado").textContent = "No se pudo copiar. Copialo manualmente.";
  }
}

document.getElementById("copiarAliasBtn").addEventListener("click", () => {
  copiarTexto(document.getElementById("aliasDonacion").textContent, "Alias copiado al portapapeles.");
});

document.getElementById("copiarCbuBtn").addEventListener("click", () => {
  copiarTexto(document.getElementById("cbuDonacion").textContent, "CBU/CVU copiado al portapapeles.");
});

onSnapshot(doc(db, "configuracion", "sitio"), s => {
  if (!s.exists()) return;
  const d = s.data();

  document.getElementById("nombreEscuelaPublico").textContent = d.nombreEscuela || "Los Naranjos de la Concordia D-114";
  document.getElementById("subtituloPublico").textContent = d.subtitulo || "Campaña para la construcción de nuestra nueva escuela";
  document.getElementById("titularDonacion").textContent = d.titularCuenta || "No cargado";
  document.getElementById("aliasDonacion").textContent = d.alias || "No cargado";
  document.getElementById("cbuDonacion").textContent = d.cbu || "No cargado";
  document.getElementById("infoInstitucionalPublica").innerHTML = d.infoInstitucional ? textoAHtml(d.infoInstitucional) : "<p>Próximamente se publicará información institucional.</p>";

  const l = document.getElementById("logoPublico");
  const f = document.getElementById("logoFooter");
  if (d.logoUrl) { l.src = d.logoUrl; f.src = d.logoUrl; l.classList.remove("oculto"); f.classList.remove("oculto"); }

  const hero = document.querySelector(".hero");
  if (hero) {
    if (d.bannerUrl) {
      hero.style.backgroundImage = `url("${d.bannerUrl}")`;
      hero.style.backgroundSize = "cover";
      hero.style.backgroundPosition = "center";
      hero.style.backgroundRepeat = "no-repeat";
    } else {
      hero.style.backgroundImage = "";
    }
  }

  if (d.publicBackgroundUrl) {
    document.body.classList.add("fondo-publico-activo");
    document.body.style.setProperty("--fondo-publico-url", `url("${d.publicBackgroundUrl}")`);
  } else {
    document.body.classList.remove("fondo-publico-activo");
    document.body.style.removeProperty("--fondo-publico-url");
  }
});

function actualizarMetaGeneral(objs) {
  let totalMeta = 0;
  let totalRecaudado = 0;

  objs.forEach(o => {
    const precio = Number(o.precio || 0);
    const recaudado = Math.min(Number(o.recaudado || 0), precio);
    totalMeta += precio;
    totalRecaudado += recaudado;
  });

  const porcentaje = calcularPorcentaje(totalRecaudado, totalMeta);
  const barraGeneral = document.querySelector(".meta-general .progreso");
  const textoGeneral = document.querySelector(".meta-general p");
  if (barraGeneral) barraGeneral.style.width = porcentaje + "%";
  if (textoGeneral) textoGeneral.textContent = `${formatoPesos.format(totalRecaudado)} recaudados de ${formatoPesos.format(totalMeta)} (${porcentaje}%)`;
}

function objetivosDeCategoria(categoriaId) {
  if (categoriaId === "sin-categoria") {
    return objetivosPublicosCache.filter(o => !o.categoriaId);
  }
  return objetivosPublicosCache.filter(o => o.categoriaId === categoriaId);
}

function resumenCategoria(categoriaId) {
  const objetivos = objetivosDeCategoria(categoriaId);
  let total = 0;
  let recaudado = 0;

  objetivos.forEach(o => {
    const precio = Number(o.precio || 0);
    const rec = Math.min(Number(o.recaudado || 0), precio);
    total += precio;
    recaudado += rec;
  });

  return {
    cantidad: objetivos.length,
    total,
    recaudado,
    porcentaje: calcularPorcentaje(recaudado, total)
  };
}

function renderCategoriasPublicas() {
  const contenedor = document.getElementById("contenedorObjetivos");
  if (!contenedor) return;

  categoriaPublicaActiva = null;
  actualizarMetaGeneral(objetivosPublicosCache);

  const titulo = document.querySelector("#objetivos h2");
  if (titulo) titulo.textContent = "Categorías de donación";

  const categorias = categoriasPublicasCache.slice().sort((a, b) =>
    String(a.nombre || "").localeCompare(String(b.nombre || ""), "es")
  );

  const haySinCategoria = objetivosPublicosCache.some(o => !o.categoriaId);
  if (haySinCategoria) {
    categorias.push({
      id: "sin-categoria",
      nombre: "Otros objetivos",
      descripcion: "Objetivos que todavía no fueron asignados a una categoría."
    });
  }

  contenedor.innerHTML = "";

  if (!categorias.length) {
    contenedor.innerHTML = '<div class="categorias-vacio-publico"><h3>Todavía no hay categorías disponibles</h3><p>Próximamente se publicarán nuevos objetivos para colaborar.</p></div>';
    return;
  }

  categorias.forEach(categoria => {
    const resumen = resumenCategoria(categoria.id);
    if (resumen.cantidad === 0) return;

    const faltante = Math.max(0, resumen.total - resumen.recaudado);
    const tarjeta = document.createElement("article");
    tarjeta.className = "categoria-publica-card";
    tarjeta.tabIndex = 0;
    tarjeta.setAttribute("role", "button");
    tarjeta.setAttribute("aria-label", `Ver objetivos de ${categoria.nombre || "categoría"}`);
    tarjeta.innerHTML = `
      <div class="categoria-publica-contenido">
        <h3>${categoria.nombre || "Categoría sin nombre"}</h3>
        <p class="categoria-publica-descripcion">${categoria.descripcion || "Objetivos de esta categoría."}</p>
        <div class="categoria-publica-datos">
          <span><strong>${resumen.cantidad}</strong> objetivo${resumen.cantidad === 1 ? "" : "s"}</span>
          <span><strong>${formatoPesos.format(resumen.total)}</strong> necesarios</span>
        </div>
        <div class="barra categoria-publica-barra"><div class="progreso" style="width:${resumen.porcentaje}%"></div></div>
        <div class="categoria-publica-progreso">
          <strong>${resumen.porcentaje}% financiado</strong>
          <span>${faltante > 0 ? `Faltan ${formatoPesos.format(faltante)}` : "Categoría completada"}</span>
        </div>
      </div>
      <button type="button" class="btn-ver-objetivos">Ver objetivos</button>
    `;

    const abrir = () => renderObjetivosCategoria(categoria);
    tarjeta.querySelector(".btn-ver-objetivos").addEventListener("click", e => {
      e.stopPropagation();
      abrir();
    });
    tarjeta.addEventListener("click", abrir);
    tarjeta.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        abrir();
      }
    });
    contenedor.appendChild(tarjeta);
  });

  if (!contenedor.children.length) {
    contenedor.innerHTML = '<div class="categorias-vacio-publico"><h3>No hay objetivos publicados</h3><p>Las categorías aparecerán cuando tengan al menos un objetivo asociado.</p></div>';
  }
}

function renderObjetivosCategoria(categoria) {
  categoriaPublicaActiva = categoria.id;
  const contenedor = document.getElementById("contenedorObjetivos");
  if (!contenedor) return;

  const titulo = document.querySelector("#objetivos h2");
  if (titulo) titulo.textContent = categoria.nombre || "Objetivos";

  const objetivos = objetivosDeCategoria(categoria.id);
  contenedor.innerHTML = `
    <div class="categoria-publica-cabecera">
      <button type="button" class="btn-volver-categorias">← Volver a categorías</button>
      ${categoria.descripcion ? `<p>${categoria.descripcion}</p>` : ""}
    </div>
    <div id="listaObjetivosCategoria" class="lista-objetivos-categoria"></div>
  `;

  contenedor.querySelector(".btn-volver-categorias").addEventListener("click", renderCategoriasPublicas);
  const lista = contenedor.querySelector("#listaObjetivosCategoria");

  if (!objetivos.length) {
    lista.innerHTML = "<p>No hay objetivos disponibles en esta categoría.</p>";
    return;
  }

  objetivos.forEach(o => {
    const precio = Number(o.precio || 0);
    const rec = Math.min(Number(o.recaudado || 0), precio);
    const pct = calcularPorcentaje(rec, precio);
    const falt = Math.max(0, precio - rec);
    const comp = pct >= 100;

    const card = document.createElement("div");
    card.className = "card objetivo-card";
    card.innerHTML = `
      ${o.imagenUrl ? `<img class="imagen-objetivo" src="${o.imagenUrl}" alt="${o.nombre || "Objetivo"}">` : ""}
      <div class="card-header"><div><h3>${o.nombre || "Objetivo sin nombre"}</h3><p>${o.descripcion || ""}</p></div>${o.urgente ? "<span class='etiqueta'>Urgente</span>" : ""}</div>
      <div class="barra"><div class="progreso" style="width:${pct}%"></div></div>
      <p><strong>${pct}% completado</strong></p>
      <p>Recaudado: ${formatoPesos.format(rec)} de ${formatoPesos.format(precio)}</p>
      <p>${comp ? "✅ Objetivo completado" : "Faltan: " + formatoPesos.format(falt)}</p>
      <button class="btn-donar-publico" ${comp ? "disabled" : ""}>${comp ? "Donaciones cerradas" : "Donar para este objetivo"}</button>
    `;
    const btn = card.querySelector(".btn-donar-publico");
    if (!comp) btn.addEventListener("click", () => abrirModal({ id: o.id, nombre: o.nombre || "Objetivo", faltante: falt }));
    lista.appendChild(card);
  });

  document.getElementById("objetivos")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function actualizarVistaObjetivosPublicos() {
  if (categoriaPublicaActiva) {
    const categoria = categoriasPublicasCache.find(c => c.id === categoriaPublicaActiva) ||
      (categoriaPublicaActiva === "sin-categoria" ? { id: "sin-categoria", nombre: "Otros objetivos", descripcion: "Objetivos que todavía no fueron asignados a una categoría." } : null);
    if (categoria) renderObjetivosCategoria(categoria);
    else renderCategoriasPublicas();
  } else {
    renderCategoriasPublicas();
  }
}

function abrirModal(o) {
  objetivoSeleccionado = o;
  document.getElementById("modalObjetivoNombre").textContent = `Objetivo: ${o.nombre} | Faltan: ${formatoPesos.format(o.faltante)}`;
  document.getElementById("donacionMonto").max = o.faltante;
  document.getElementById("donacionForm").reset();
  document.getElementById("mensajeCopiado").textContent = "";
  document.getElementById("modalDonacion").classList.remove("oculto");
}

document.getElementById("cerrarModalDonacion").addEventListener("click", () => document.getElementById("modalDonacion").classList.add("oculto"));

document.getElementById("donacionForm").addEventListener("submit", async e => {
  e.preventDefault();

  const nombre = document.getElementById("donanteNombre").value.trim();
  const apellido = document.getElementById("donanteApellido").value.trim();
  const dni = document.getElementById("donanteDni").value.trim();
  const monto = Number(document.getElementById("donacionMonto").value);
  const numeroComprobante = document.getElementById("numeroComprobante").value.trim();
  const declara = document.getElementById("declaraTransferencia").checked;

  if (!objetivoSeleccionado) return alert("No se seleccionó objetivo.");
  if (!nombre) return alert("El nombre es obligatorio.");
  if (!apellido) return alert("El apellido es obligatorio.");
  if (!dni) return alert("El DNI es obligatorio.");
  if (!monto || monto <= 0) return alert("Ingresá un monto válido.");
  if (!declara) return alert("Debés declarar que realizaste la transferencia.");
  if (monto > objetivoSeleccionado.faltante) return alert("El monto supera lo que falta para este objetivo.");

  await addDoc(collection(db, "donaciones"), {
    objetivoId: objetivoSeleccionado.id,
    objetivoNombre: objetivoSeleccionado.nombre,
    monto,
    nombreDonante: nombre,
    apellidoDonante: apellido,
    dniDonante: dni,
    nombreCompletoDonante: `${nombre} ${apellido}`,
    numeroComprobante,
    declaraTransferencia: true,
    estado: "pendiente",
    creado: serverTimestamp()
  });

  alert("Donación enviada para verificación. El equipo administrador revisará el ingreso.");
  document.getElementById("modalDonacion").classList.add("oculto");
});

function renderDonacionesPublicas(donaciones) {
  const aprobadas = donaciones.filter(d => d.estado === "aprobada");
  const donantesUnicos = new Set(aprobadas.map(d => (d.dniDonante || d.nombreCompletoDonante || d.nombreDonante || "").trim().toLowerCase()).filter(Boolean));
  document.getElementById("cantidadDonantes").textContent = donantesUnicos.size;
  document.getElementById("cantidadDonaciones").textContent = aprobadas.length;

  const porObjetivo = {};
  aprobadas.forEach(d => {
    const key = d.objetivoNombre || "Objetivo sin nombre";
    if (!porObjetivo[key]) porObjetivo[key] = { objetivo: key, cantidad: 0 };
    porObjetivo[key].cantidad++;
  });

  const ranking = Object.values(porObjetivo).sort((a, b) => b.cantidad - a.cantidad);
  const rankingDiv = document.getElementById("rankingObjetivos");
  rankingDiv.innerHTML = ranking.length ? "" : "<p>Todavía no hay donaciones aprobadas.</p>";
  ranking.forEach((r, i) => {
    rankingDiv.innerHTML += `<div class="ranking-item"><strong>${i + 1}. ${r.objetivo}</strong><span>${r.cantidad} donante${r.cantidad === 1 ? "" : "s"}</span></div>`;
  });

  const historial = document.getElementById("historialDonaciones");
  historial.innerHTML = aprobadas.length ? "" : "<p>Todavía no hay donaciones aprobadas.</p>";
  aprobadas.slice().reverse().forEach(d => {
    const nombre = d.nombreCompletoDonante || `${d.nombreDonante || ""} ${d.apellidoDonante || ""}`.trim() || "Donante";
    historial.innerHTML += `<div class="historial-item"><strong>${nombreOculto()}</strong> donó ${formatoPesos.format(Number(d.monto || 0))} para <strong>${d.objetivoNombre}</strong><br>Fecha: ${formatearFechaPublica(d.aprobado || d.creado)}</div>`;
  });
}

onSnapshot(query(collection(db, "objetivos")), snap => {
  objetivosPublicosCache = [];
  snap.forEach(d => objetivosPublicosCache.push({ id: d.id, ...d.data() }));
  actualizarVistaObjetivosPublicos();
});

onSnapshot(query(collection(db, "categorias")), snap => {
  categoriasPublicasCache = [];
  snap.forEach(d => categoriasPublicasCache.push({ id: d.id, ...d.data() }));
  actualizarVistaObjetivosPublicos();
});

onSnapshot(query(collection(db, "donaciones")), snap => {
  const a = [];
  snap.forEach(d => a.push({ id: d.id, ...d.data() }));
  renderDonacionesPublicas(a);
});



function numeroEtapa(etapa){
  const texto = String(etapa || "").toLowerCase();
  const romanos = {"i":1,"ii":2,"iii":3,"iv":4,"v":5,"vi":6,"vii":7,"viii":8,"ix":9,"x":10};
  const r = texto.match(/etapa\s+([ivx]+)/i);
  if(r && romanos[r[1].toLowerCase()]) return romanos[r[1].toLowerCase()];
  const n = texto.match(/etapa\s+(\d+)/i);
  if(n) return Number(n[1]);
  return 999;
}

function ordenarEtapas(a,b){
  const na=numeroEtapa(a), nb=numeroEtapa(b);
  if(na!==nb) return na-nb;
  return String(a).localeCompare(String(b),"es");
}

function ordenarItemsObra(a,b){
  return (a.creado?.seconds || 0) - (b.creado?.seconds || 0);
}

let galeriaObraActual = [];
let indiceObraActual = 0;

function actualizarLightboxObra(){
  const item = galeriaObraActual[indiceObraActual];
  if(!item) return;

  guardarVistoObra(item.id);

  const media = document.querySelector("#lightboxObra .lightbox-media");
  const info = document.querySelector("#lightboxObra .lightbox-info");
  const contador = document.querySelector("#lightboxObra .lightbox-contador");

  if(media) media.innerHTML = renderMediaPublica(item.url, item.tipo, item.titulo);
  if(info) {
    info.innerHTML = `
      <h3>${item.titulo || "Actualización de obra"}</h3>
      <p>${item.descripcion || ""}</p>
    `;
  }
  if(contador) contador.textContent = `${indiceObraActual + 1} / ${galeriaObraActual.length}`;

  const badge = document.querySelector(`[data-nuevo-obra="${item.id}"]`);
  if (badge) badge.remove();
}

function obraAnterior(){
  if(!galeriaObraActual.length) return;
  indiceObraActual = (indiceObraActual - 1 + galeriaObraActual.length) % galeriaObraActual.length;
  actualizarLightboxObra();
}

function obraSiguiente(){
  if(!galeriaObraActual.length) return;
  indiceObraActual = (indiceObraActual + 1) % galeriaObraActual.length;
  actualizarLightboxObra();
}


function obtenerVistosObra(){
  try {
    return JSON.parse(localStorage.getItem("obraVistas") || "[]");
  } catch {
    return [];
  }
}

function guardarVistoObra(id){
  const vistos = new Set(obtenerVistosObra());
  vistos.add(id);
  localStorage.setItem("obraVistas", JSON.stringify([...vistos]));
}

function esNuevaObra(id){
  return !obtenerVistosObra().includes(id);
}

function cerrarLightboxObra(){
  const modal = document.getElementById("lightboxObra");
  if (modal) modal.remove();
}

function abrirLightboxObra(item, grupo=[], indice=0){
  galeriaObraActual = grupo.length ? grupo : [item];
  indiceObraActual = indice;

  const modal = document.createElement("div");
  modal.id = "lightboxObra";
  modal.className = "lightbox-obra";
  modal.innerHTML = `
    <div class="lightbox-obra-contenido">
      <button class="lightbox-cerrar" type="button">×</button>
      <button class="lightbox-flecha lightbox-prev" type="button">‹</button>
      <button class="lightbox-flecha lightbox-next" type="button">›</button>
      <div class="lightbox-media"></div>
      <div class="lightbox-info"></div>
      <div class="lightbox-contador"></div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector(".lightbox-cerrar").addEventListener("click", cerrarLightboxObra);
  modal.querySelector(".lightbox-prev").addEventListener("click", (e)=>{e.stopPropagation(); obraAnterior();});
  modal.querySelector(".lightbox-next").addEventListener("click", (e)=>{e.stopPropagation(); obraSiguiente();});
  modal.addEventListener("click", (e)=>{ if(e.target.id==="lightboxObra") cerrarLightboxObra(); });

  actualizarLightboxObra();

  if(galeriaObraActual.length <= 1){
    modal.querySelector(".lightbox-prev").style.display="none";
    modal.querySelector(".lightbox-next").style.display="none";
    modal.querySelector(".lightbox-contador").style.display="none";
  }
}

document.addEventListener("keydown", e => {
  if (e.key === "Escape") cerrarLightboxObra();
  if (document.getElementById("lightboxObra") && e.key === "ArrowLeft") obraAnterior();
  if (document.getElementById("lightboxObra") && e.key === "ArrowRight") obraSiguiente();
});



function desplegarEtapaObra(etapaKey){
  document.querySelectorAll(`[data-etapa-grupo="${etapaKey}"]`).forEach(el => {
    el.classList.remove("oculto-etapa-obra");
  });

  const btn = document.querySelector(`[data-btn-etapa="${etapaKey}"]`);
  if(btn) btn.remove();
}

onSnapshot(query(collection(db, "obra")), snap => {
  const c = document.getElementById("galeriaObra");
  c.innerHTML = "";
  const porEtapa = {};

  snap.forEach(d => {
    const o = d.data();
    const etapa = o.etapa || "Avances generales";
    if (!porEtapa[etapa]) porEtapa[etapa] = [];
    porEtapa[etapa].push({ id: d.id, ...o });
  });

  const etapas = Object.keys(porEtapa).sort(ordenarEtapas);
  if (!etapas.length) {
    c.innerHTML = "<p>Próximamente se publicarán actualizaciones de obra.</p>";
    return;
  }

  etapas.forEach((etapa, etapaIndex) => {
    porEtapa[etapa].sort(ordenarItemsObra);

    const etapaKey = `etapa-${etapaIndex}`;
    const bloque = document.createElement("section");
    bloque.className = "bloque-etapa-obra";
    bloque.innerHTML = `
      <div class="etapa-obra-header">
        <span>${etapa}</span>
      </div>
      <div class="galeria-etapa"></div>
    `;

    const galeria = bloque.querySelector(".galeria-etapa");

    const grupo = porEtapa[etapa].map(o => {
      const url = o.mediaUrl || o.imagenUrl || "";
      const tipo = o.tipoMedia || "imagen";
      return { id:o.id, url, tipo, titulo:o.titulo || "Actualización de obra", etapa, descripcion:o.descripcion || "" };
    });

    grupo.forEach((item, indice) => {
      const nueva = esNuevaObra(item.id);
      const ocultar = indice >= 4;
      const article = document.createElement("article");
      article.className = `obra-card-pro obra-card-click ${ocultar ? "oculto-etapa-obra" : ""}`;
      article.setAttribute("data-etapa-grupo", etapaKey);

      article.innerHTML = `
        <div class="obra-imagen-wrap ${item.tipo==="youtube"||item.tipo==="video"?"obra-video-wrap":""}">
          ${nueva ? `<span class="badge-nuevo-obra" data-nuevo-obra="${item.id}">Nuevo</span>` : ""}
          ${renderMediaPublica(item.url, item.tipo, item.titulo)}
        </div>
        <div class="obra-card-info">
          <h4>${item.titulo}</h4>
          <p>${item.descripcion}</p>
          <button type="button" class="btn-ver-grande">Ver en grande</button>
        </div>
      `;

      article.addEventListener("click", () => abrirLightboxObra(item, grupo, indice));
      galeria.appendChild(article);
    });

    if(grupo.length > 4){
      const restantes = grupo.length - 4;
      const mas = document.createElement("button");
      mas.type = "button";
      mas.className = "btn-mas-etapa";
      mas.setAttribute("data-btn-etapa", etapaKey);
      mas.innerHTML = `
        <span class="mas-icono">+</span>
        Ver ${restantes} más
      `;
      mas.addEventListener("click", () => desplegarEtapaObra(etapaKey));
      galeria.appendChild(mas);
    }

    c.appendChild(bloque);
  });
});

onSnapshot(query(collection(db, "transparencia")), snap => {
  const c = document.getElementById("listaTransparencia");
  c.innerHTML = "";
  let count = 0;
  snap.forEach(d => {
    count++;
    const o = d.data(), m = Number(o.monto || 0);
    c.innerHTML += `<article class="card mini-card"><h3>${o.titulo || "Comprobante"}</h3><p>${o.descripcion || ""}</p>${m ? `<p><strong>Monto:</strong> ${formatoPesos.format(m)}</p>` : ""}${o.url ? `<a href="${o.url}" target="_blank">Ver comprobante</a>` : ""}</article>`;
  });
  if (!count) c.innerHTML = "<p>Próximamente se publicarán comprobantes y rendiciones.</p>";
});