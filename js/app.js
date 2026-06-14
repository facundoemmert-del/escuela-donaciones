import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, onSnapshot, query, doc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let objetivoSeleccionado = null;

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
      hero.style.backgroundImage =
        `linear-gradient(135deg, rgba(7, 55, 32, .82), rgba(15, 73, 115, .82)), url("${d.bannerUrl}")`;
      hero.style.backgroundSize = "cover";
      hero.style.backgroundPosition = "center";
    } else {
      hero.style.backgroundImage = "";
    }
  }
});

function renderObjetivos(objs) {
  const c = document.getElementById("contenedorObjetivos");
  c.innerHTML = "";
  let tm = 0, tr = 0;

  objs.forEach(o => {
    const precio = Number(o.precio || 0);
    const rec = Math.min(Number(o.recaudado || 0), precio);
    tm += precio; tr += rec;
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
    c.appendChild(card);
  });

  const p = calcularPorcentaje(tr, tm);
  document.querySelector(".meta-general .progreso").style.width = p + "%";
  document.querySelector(".meta-general p").textContent = `${formatoPesos.format(tr)} recaudados de ${formatoPesos.format(tm)} (${p}%)`;
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
  const a = [];
  snap.forEach(d => a.push({ id: d.id, ...d.data() }));
  renderObjetivos(a);
});

onSnapshot(query(collection(db, "donaciones")), snap => {
  const a = [];
  snap.forEach(d => a.push({ id: d.id, ...d.data() }));
  renderDonacionesPublicas(a);
});


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

function abrirLightboxObra(item){
  guardarVistoObra(item.id);

  const modal = document.createElement("div");
  modal.id = "lightboxObra";
  modal.className = "lightbox-obra";
  modal.innerHTML = `
    <div class="lightbox-obra-contenido">
      <button class="lightbox-cerrar" type="button">×</button>
      <div class="lightbox-media">
        ${renderMediaPublica(item.url, item.tipo, item.titulo)}
      </div>
      <div class="lightbox-info">
  <h3>${item.titulo || "Actualización de obra"}</h3>
   <p> ${item.etapa || "Avances generales"}</p>
  <p>${item.descripcion || ""}</p>
</div>
  `;

  document.body.appendChild(modal);
  modal.querySelector(".lightbox-cerrar").addEventListener("click", cerrarLightboxObra);
  modal.addEventListener("click", (e) => {
    if (e.target.id === "lightboxObra") cerrarLightboxObra();
  });

  const badge = document.querySelector(`[data-nuevo-obra="${item.id}"]`);
  if (badge) badge.remove();
}

document.addEventListener("keydown", e => {
  if (e.key === "Escape") cerrarLightboxObra();
});


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

  const etapas = Object.keys(porEtapa);
  if (!etapas.length) {
    c.innerHTML = "<p>Próximamente se publicarán actualizaciones de obra.</p>";
    return;
  }

  etapas.forEach(etapa => {
    const bloque = document.createElement("section");
    bloque.className = "bloque-etapa-obra";
    bloque.innerHTML = `
      <div class="etapa-obra-header">
        <span>Etapa</span>
        <h3>${etapa}</h3>
      </div>
      <div class="galeria-etapa"></div>
    `;

    const galeria = bloque.querySelector(".galeria-etapa");

    porEtapa[etapa].forEach(o => {
      const url = o.mediaUrl || o.imagenUrl || "";
      const tipo = o.tipoMedia || "imagen";
      const nueva = esNuevaObra(o.id);
      const article = document.createElement("article");
      article.className = "obra-card-pro obra-card-click";
      article.innerHTML = `
        <div class="obra-imagen-wrap ${tipo==="youtube"||tipo==="video"?"obra-video-wrap":""}">
          ${nueva ? `<span class="badge-nuevo-obra" data-nuevo-obra="${o.id}">Nuevo</span>` : ""}
          ${renderMediaPublica(url, tipo, o.titulo || "Actualización de obra")}
        </div>
        <div class="obra-card-info">
          <h4>${o.titulo || "Actualización de obra"}</h4>
          <p>${o.descripcion || ""}</p>
          <button type="button" class="btn-ver-grande">Ver en grande</button>
        </div>
      `;

      article.addEventListener("click", () => {
        abrirLightboxObra({
          id: o.id,
          url,
          tipo,
          titulo: o.titulo || "Actualización de obra",
          etapa,
          descripcion: o.descripcion || ""
        });
      });

      galeria.appendChild(article);
    });

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
