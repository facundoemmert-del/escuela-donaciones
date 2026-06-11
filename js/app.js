import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  query,
  doc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const formatoPesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0
});

function activarSeccionesPublicas() {
  const botones = document.querySelectorAll(".public-tab-btn");
  const paneles = document.querySelectorAll(".public-panel");

  botones.forEach(boton => {
    boton.addEventListener("click", () => {
      botones.forEach(b => b.classList.remove("activo"));
      paneles.forEach(p => p.classList.remove("activo"));

      boton.classList.add("activo");
      document.getElementById(boton.dataset.publicTab).classList.add("activo");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

function calcularPorcentaje(recaudado, precio) {
  if (!precio || precio <= 0) return 0;
  return Math.min(100, Math.round((recaudado / precio) * 100));
}

function textoAHtml(texto) {
  if (!texto) return "";
  return texto.split("\\n").map(linea => `<p>${linea}</p>`).join("");
}

function cargarConfiguracion() {
  const ref = doc(db, "configuracion", "sitio");

  onSnapshot(ref, documento => {
    if (!documento.exists()) return;

    const data = documento.data();

    document.getElementById("nombreEscuelaPublico").textContent =
      data.nombreEscuela || "Los Naranjos de la Concordia D-114";

    document.getElementById("subtituloPublico").textContent =
      data.subtitulo || "Campaña para la construcción de nuestra nueva escuela";

    const infoPublica = document.getElementById("infoInstitucionalPublica");
    if (infoPublica) {
      infoPublica.innerHTML = data.infoInstitucional
        ? textoAHtml(data.infoInstitucional)
        : "<p>Próximamente se publicará información institucional.</p>";
    }

    const logoPublico = document.getElementById("logoPublico");
    const logoFooter = document.getElementById("logoFooter");

    if (data.logoUrl) {
      logoPublico.src = data.logoUrl;
      logoFooter.src = data.logoUrl;
      logoPublico.classList.remove("oculto");
      logoFooter.classList.remove("oculto");
    }
  });
}

function renderizarObjetivos(objetivos) {
  const contenedor = document.querySelector(".objetivos");
  if (!contenedor) return;

  contenedor.querySelectorAll(".card").forEach(card => card.remove());

  let totalMeta = 0;
  let totalRecaudado = 0;

  objetivos.forEach(objetivo => {
    const precio = Number(objetivo.precio || 0);
    const recaudado = Number(objetivo.recaudado || 0);
    const recaudadoVisible = Math.min(recaudado, precio);

    totalMeta += precio;
    totalRecaudado += recaudadoVisible;

    const porcentaje = calcularPorcentaje(recaudadoVisible, precio);
    const faltante = Math.max(0, precio - recaudadoVisible);
    const completado = porcentaje >= 100;

    const card = document.createElement("div");
    card.className = "card objetivo-card";

    card.innerHTML = `
      ${objetivo.imagenUrl ? `<img class="imagen-objetivo" src="${objetivo.imagenUrl}" alt="${objetivo.nombre || "Objetivo"}">` : ""}
      <div class="card-header">
        <div>
          <h3>${objetivo.nombre || "Objetivo sin nombre"}</h3>
          <p>${objetivo.descripcion || ""}</p>
        </div>
        ${objetivo.urgente ? "<span class='etiqueta'>Urgente</span>" : ""}
      </div>

      <div class="barra">
        <div class="progreso" style="width:${porcentaje}%"></div>
      </div>

      <p><strong>${porcentaje}% completado</strong></p>
      <p>Recaudado: ${formatoPesos.format(recaudadoVisible)} de ${formatoPesos.format(precio)}</p>
      <p>${completado ? "✅ Objetivo completado" : "Faltan: " + formatoPesos.format(faltante)}</p>

      <button ${completado ? "disabled" : ""}>
        ${completado ? "Donaciones cerradas" : "Donar para este objetivo"}
      </button>
    `;

    contenedor.appendChild(card);
  });

  actualizarMetaGeneral(totalRecaudado, totalMeta);
}

function actualizarMetaGeneral(totalRecaudado, totalMeta) {
  const barraGeneral = document.querySelector(".meta-general .progreso");
  const textoGeneral = document.querySelector(".meta-general p");
  if (!barraGeneral || !textoGeneral) return;

  const porcentajeGeneral = calcularPorcentaje(totalRecaudado, totalMeta);
  barraGeneral.style.width = porcentajeGeneral + "%";
  textoGeneral.textContent =
    `${formatoPesos.format(totalRecaudado)} recaudados de ${formatoPesos.format(totalMeta)} (${porcentajeGeneral}%)`;
}

function renderizarObra(items) {
  const contenedor = document.getElementById("galeriaObra");
  if (!contenedor) return;

  contenedor.innerHTML = "";

  if (!items.length) {
    contenedor.innerHTML = "<p>Próximamente se publicarán actualizaciones de obra.</p>";
    return;
  }

  items.forEach(item => {
    const div = document.createElement("article");
    div.className = "card mini-card";
    div.innerHTML = `
      ${item.imagenUrl ? `<img src="${item.imagenUrl}" alt="${item.titulo || "Obra"}">` : ""}
      <h3>${item.titulo || "Actualización de obra"}</h3>
      <p>${item.descripcion || ""}</p>
    `;
    contenedor.appendChild(div);
  });
}

function renderizarTransparencia(items) {
  const contenedor = document.getElementById("listaTransparencia");
  if (!contenedor) return;

  contenedor.innerHTML = "";

  if (!items.length) {
    contenedor.innerHTML = "<p>Próximamente se publicarán comprobantes y rendiciones.</p>";
    return;
  }

  items.forEach(item => {
    const monto = Number(item.monto || 0);
    const div = document.createElement("article");
    div.className = "card mini-card";
    div.innerHTML = `
      <h3>${item.titulo || "Comprobante"}</h3>
      <p>${item.descripcion || ""}</p>
      ${monto ? `<p><strong>Monto:</strong> ${formatoPesos.format(monto)}</p>` : ""}
      ${item.url ? `<a href="${item.url}" target="_blank" rel="noopener">Ver comprobante</a>` : ""}
    `;
    contenedor.appendChild(div);
  });
}

activarSeccionesPublicas();
cargarConfiguracion();

onSnapshot(query(collection(db, "objetivos")), snapshot => {
  const objetivos = [];
  snapshot.forEach(doc => objetivos.push({ id: doc.id, ...doc.data() }));
  renderizarObjetivos(objetivos);
});

onSnapshot(query(collection(db, "obra")), snapshot => {
  const items = [];
  snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
  renderizarObra(items);
});

onSnapshot(query(collection(db, "transparencia")), snapshot => {
  const items = [];
  snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
  renderizarTransparencia(items);
});
