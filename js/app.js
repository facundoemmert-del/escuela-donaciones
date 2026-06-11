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

function calcularPorcentaje(recaudado, precio) {
  if (!precio || precio <= 0) return 0;
  return Math.min(100, Math.round((recaudado / precio) * 100));
}

function cargarConfiguracion() {
  const ref = doc(db, "configuracion", "sitio");

  onSnapshot(ref, documento => {
    if (!documento.exists()) return;

    const data = documento.data();

    const nombre = data.nombreEscuela || "Los Naranjos de la Concordia D-114";
    const subtitulo = data.subtitulo || "Campaña para la construcción de nuestra nueva escuela";
    const logoUrl = data.logoUrl || "";

    document.getElementById("nombreEscuelaPublico").textContent = nombre;
    document.getElementById("subtituloPublico").textContent = subtitulo;

    const logoPublico = document.getElementById("logoPublico");
    const logoFooter = document.getElementById("logoFooter");

    if (logoUrl) {
      logoPublico.src = logoUrl;
      logoFooter.src = logoUrl;
      logoPublico.classList.remove("oculto");
      logoFooter.classList.remove("oculto");
    }
  });
}

function renderizarObjetivos(objetivos) {
  const contenedor = document.querySelector(".objetivos");

  if (!contenedor) {
    console.error("No se encontró la sección .objetivos");
    return;
  }

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
    card.className = "card";

    card.innerHTML = `
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

cargarConfiguracion();

const q = query(collection(db, "objetivos"));

onSnapshot(q, snapshot => {
  const objetivos = [];
  snapshot.forEach(doc => {
    objetivos.push({
      id: doc.id,
      ...doc.data()
    });
  });

  renderizarObjetivos(objetivos);
});
