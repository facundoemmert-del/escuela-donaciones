import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, onSnapshot, query, doc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let objetivoSeleccionado = null;

const formatoPesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0
});

function calcularPorcentaje(r, p) {
  if (!p || p <= 0) return 0;
  return Math.min(100, Math.round((r / p) * 100));
}

function textoAHtml(t) {
  if (!t) return "";
  return t.split("\n").map(l => `<p>${l}</p>`).join("");
}

function generarQrDesdeAlias(alias) {
  if (!alias) return "";
  const textoQr = `Alias de donación: ${alias}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(textoQr)}`;
}

document.querySelectorAll(".public-tab-btn").forEach(b => {
  b.addEventListener("click", () => {
    document.querySelectorAll(".public-tab-btn").forEach(x => x.classList.remove("activo"));
    document.querySelectorAll(".public-panel").forEach(p => p.classList.remove("activo"));
    b.classList.add("activo");
    document.getElementById(b.dataset.publicTab).classList.add("activo");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

onSnapshot(doc(db, "configuracion", "sitio"), s => {
  if (!s.exists()) return;

  const d = s.data();

  document.getElementById("nombreEscuelaPublico").textContent =
    d.nombreEscuela || "Los Naranjos de la Concordia D-114";

  document.getElementById("subtituloPublico").textContent =
    d.subtitulo || "Campaña para la construcción de nuestra nueva escuela";

  document.getElementById("titularDonacion").textContent = d.titularCuenta || "No cargado";
  document.getElementById("aliasDonacion").textContent = d.alias || "No cargado";
  document.getElementById("cbuDonacion").textContent = d.cbu || "No cargado";

  const qr = document.getElementById("qrDonacion");

  if (d.qrUrl) {
    qr.src = d.qrUrl;
    qr.classList.remove("oculto");
  } else if (d.alias) {
    qr.src = generarQrDesdeAlias(d.alias);
    qr.classList.remove("oculto");
  } else {
    qr.classList.add("oculto");
  }

  document.getElementById("infoInstitucionalPublica").innerHTML =
    d.infoInstitucional
      ? textoAHtml(d.infoInstitucional)
      : "<p>Próximamente se publicará información institucional.</p>";

  const l = document.getElementById("logoPublico");
  const f = document.getElementById("logoFooter");

  if (d.logoUrl) {
    l.src = d.logoUrl;
    f.src = d.logoUrl;
    l.classList.remove("oculto");
    f.classList.remove("oculto");
  }
});

function renderObjetivos(objs) {
  const c = document.getElementById("contenedorObjetivos");
  c.innerHTML = "";

  let tm = 0;
  let tr = 0;

  objs.forEach(o => {
    const precio = Number(o.precio || 0);
    const rec = Math.min(Number(o.recaudado || 0), precio);

    tm += precio;
    tr += rec;

    const pct = calcularPorcentaje(rec, precio);
    const falt = Math.max(0, precio - rec);
    const comp = pct >= 100;

    const card = document.createElement("div");
    card.className = "card objetivo-card";

    card.innerHTML = `
      ${o.imagenUrl ? `<img class="imagen-objetivo" src="${o.imagenUrl}" alt="${o.nombre || "Objetivo"}">` : ""}
      <div class="card-header">
        <div>
          <h3>${o.nombre || "Objetivo sin nombre"}</h3>
          <p>${o.descripcion || ""}</p>
        </div>
        ${o.urgente ? "<span class='etiqueta'>Urgente</span>" : ""}
      </div>
      <div class="barra"><div class="progreso" style="width:${pct}%"></div></div>
      <p><strong>${pct}% completado</strong></p>
      <p>Recaudado: ${formatoPesos.format(rec)} de ${formatoPesos.format(precio)}</p>
      <p>${comp ? "✅ Objetivo completado" : "Faltan: " + formatoPesos.format(falt)}</p>
      <button class="btn-donar-publico" ${comp ? "disabled" : ""}>
        ${comp ? "Donaciones cerradas" : "Donar para este objetivo"}
      </button>
    `;

    const btn = card.querySelector(".btn-donar-publico");

    if (!comp) {
      btn.addEventListener("click", () => abrirModal({
        id: o.id,
        nombre: o.nombre || "Objetivo",
        faltante: falt
      }));
    }

    c.appendChild(card);
  });

  const p = calcularPorcentaje(tr, tm);
  document.querySelector(".meta-general .progreso").style.width = p + "%";
  document.querySelector(".meta-general p").textContent =
    `${formatoPesos.format(tr)} recaudados de ${formatoPesos.format(tm)} (${p}%)`;
}

function abrirModal(o) {
  objetivoSeleccionado = o;

  document.getElementById("modalObjetivoNombre").textContent =
    `Objetivo: ${o.nombre} | Faltan: ${formatoPesos.format(o.faltante)}`;

  document.getElementById("donacionMonto").max = o.faltante;
  document.getElementById("donacionForm").reset();
  document.getElementById("modalDonacion").classList.remove("oculto");
}

document.getElementById("cerrarModalDonacion").addEventListener("click", () => {
  document.getElementById("modalDonacion").classList.add("oculto");
});

document.getElementById("donacionForm").addEventListener("submit", async e => {
  e.preventDefault();

  const n = document.getElementById("donanteNombre").value.trim();
  const m = Number(document.getElementById("donacionMonto").value);
  const u = document.getElementById("donacionComprobante").value.trim();

  if (!objetivoSeleccionado) return alert("No se seleccionó objetivo.");
  if (!n) return alert("El nombre y apellido son obligatorios.");
  if (!m || m <= 0) return alert("Ingresá un monto válido.");
  if (!u) return alert("El comprobante es obligatorio.");
  if (m > objetivoSeleccionado.faltante) return alert("El monto supera lo que falta para este objetivo.");

  await addDoc(collection(db, "donaciones"), {
    objetivoId: objetivoSeleccionado.id,
    objetivoNombre: objetivoSeleccionado.nombre,
    monto: m,
    nombreDonante: n,
    comprobanteUrl: u,
    estado: "pendiente",
    creado: serverTimestamp()
  });

  alert("Comprobante enviado. La donación queda pendiente hasta verificación.");
  document.getElementById("modalDonacion").classList.add("oculto");
});

onSnapshot(query(collection(db, "objetivos")), snap => {
  const a = [];
  snap.forEach(d => a.push({ id: d.id, ...d.data() }));
  renderObjetivos(a);
});

onSnapshot(query(collection(db, "obra")), snap => {
  const c = document.getElementById("galeriaObra");
  c.innerHTML = "";
  let count = 0;

  snap.forEach(d => {
    count++;
    const o = d.data();
    const div = document.createElement("article");
    div.className = "card mini-card";
    div.innerHTML = `
      ${o.imagenUrl ? `<img src="${o.imagenUrl}">` : ""}
      <h3>${o.titulo || "Actualización de obra"}</h3>
      <p>${o.descripcion || ""}</p>
    `;
    c.appendChild(div);
  });

  if (!count) c.innerHTML = "<p>Próximamente se publicarán actualizaciones de obra.</p>";
});

onSnapshot(query(collection(db, "transparencia")), snap => {
  const c = document.getElementById("listaTransparencia");
  c.innerHTML = "";
  let count = 0;

  snap.forEach(d => {
    count++;
    const o = d.data();
    const m = Number(o.monto || 0);
    const div = document.createElement("article");
    div.className = "card mini-card";
    div.innerHTML = `
      <h3>${o.titulo || "Comprobante"}</h3>
      <p>${o.descripcion || ""}</p>
      ${m ? `<p><strong>Monto:</strong> ${formatoPesos.format(m)}</p>` : ""}
      ${o.url ? `<a href="${o.url}" target="_blank">Ver comprobante</a>` : ""}
    `;
    c.appendChild(div);
  });

  if (!count) c.innerHTML = "<p>Próximamente se publicarán comprobantes y rendiciones.</p>";
});
