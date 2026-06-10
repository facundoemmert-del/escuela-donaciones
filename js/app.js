
const objetivos = [
  {
    nombre: "Inodoro Ferrum",
    descripcion: "Sanitario para los baños de la nueva escuela.",
    precio: 300000,
    recaudado: 120000,
    urgente: true
  },
  {
    nombre: "Ventana Aula 1",
    descripcion: "Abertura para mejorar iluminación y ventilación.",
    precio: 100000,
    recaudado: 80000,
    urgente: false
  },
  {
    nombre: "Pizarrón para aula",
    descripcion: "Pizarrón para equipar un aula nueva.",
    precio: 180000,
    recaudado: 180000,
    urgente: false
  }
];

const formatoPesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0
});

function calcularPorcentaje(recaudado, precio) {
  if (!precio || precio <= 0) return 0;
  return Math.min(100, Math.round((recaudado / precio) * 100));
}

function renderizarObjetivos() {
  const contenedor = document.querySelector(".objetivos");

  if (!contenedor) {
    console.error("No se encontró la sección .objetivos");
    return;
  }

  contenedor.querySelectorAll(".card").forEach(card => card.remove());

  let totalMeta = 0;
  let totalRecaudado = 0;

  objetivos.forEach(objetivo => {
    totalMeta += objetivo.precio;
    totalRecaudado += Math.min(objetivo.recaudado, objetivo.precio);

    const porcentaje = calcularPorcentaje(objetivo.recaudado, objetivo.precio);
    const faltante = Math.max(0, objetivo.precio - objetivo.recaudado);
    const completado = porcentaje >= 100;

    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <div class="card-header">
        <div>
          <h3>${objetivo.nombre}</h3>
          <p>${objetivo.descripcion || ""}</p>
        </div>
        ${objetivo.urgente ? "<span class='etiqueta'>Urgente</span>" : ""}
      </div>

      <div class="barra">
        <div class="progreso" style="width:${porcentaje}%"></div>
      </div>

      <p><strong>${porcentaje}% completado</strong></p>
      <p>Recaudado: ${formatoPesos.format(Math.min(objetivo.recaudado, objetivo.precio))} de ${formatoPesos.format(objetivo.precio)}</p>
      <p>${completado ? "Objetivo completado" : "Faltan: " + formatoPesos.format(faltante)}</p>

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

renderizarObjetivos();
