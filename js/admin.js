import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  increment,
  query,
  onSnapshot,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const formatoPesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0
});

function activarTabs() {
  const botones = document.querySelectorAll(".tab-btn");
  const paneles = document.querySelectorAll(".tab-panel");

  botones.forEach(boton => {
    boton.addEventListener("click", () => {
      botones.forEach(b => b.classList.remove("activo"));
      paneles.forEach(p => p.classList.remove("activo"));

      boton.classList.add("activo");
      document.getElementById(boton.dataset.tab).classList.add("activo");
    });
  });
}

activarTabs();

const configRef = doc(db, "configuracion", "sitio");

const configForm = document.getElementById("configForm");
const nombreEscuela = document.getElementById("nombreEscuela");
const subtituloEscuela = document.getElementById("subtituloEscuela");
const logoUrl = document.getElementById("logoUrl");
const infoInstitucional = document.getElementById("infoInstitucional");
const guardarLogoUrl = document.getElementById("guardarLogoUrl");

onSnapshot(configRef, documento => {
  if (!documento.exists()) return;

  const data = documento.data();

  nombreEscuela.value = data.nombreEscuela || "";
  subtituloEscuela.value = data.subtitulo || "";
  logoUrl.value = data.logoUrl || "";
  infoInstitucional.value = data.infoInstitucional || "";

  document.getElementById("nombreEscuelaAdmin").textContent =
    data.nombreEscuela || "Los Naranjos de la Concordia D-114";

  const logoAdmin = document.getElementById("logoAdmin");

  if (data.logoUrl) {
    logoAdmin.src = data.logoUrl;
    logoAdmin.classList.remove("oculto");
  }
});

configForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  await setDoc(configRef, {
    nombreEscuela: nombreEscuela.value.trim(),
    subtitulo: subtituloEscuela.value.trim(),
    logoUrl: logoUrl.value.trim(),
    infoInstitucional: infoInstitucional.value.trim(),
    actualizado: serverTimestamp()
  }, { merge: true });

  alert("Información institucional guardada.");
});

guardarLogoUrl.addEventListener("click", async () => {
  if (!logoUrl.value.trim()) {
    alert("Pegá una URL de logo.");
    return;
  }

  await setDoc(configRef, {
    logoUrl: logoUrl.value.trim(),
    actualizado: serverTimestamp()
  }, { merge: true });

  alert("Logo guardado por URL.");
});

const objetivoForm = document.getElementById("objetivoForm");
const lista = document.getElementById("listaObjetivos");
const buscadorObjetivos = document.getElementById("buscadorObjetivos");
let objetivosCache = [];

objetivoForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const nombre = document.getElementById("nombre").value.trim();
  const descripcion = document.getElementById("descripcion").value.trim();
  const precio = Number(document.getElementById("precio").value);
  const recaudado = Number(document.getElementById("recaudado").value || 0);
  const imagenUrl = document.getElementById("imagenUrl").value.trim();
  const urgente = document.getElementById("urgente").checked;

  if (!nombre || !precio || precio <= 0) {
    alert("Completá nombre y precio correctamente.");
    return;
  }

  await addDoc(collection(db, "objetivos"), {
    nombre,
    descripcion,
    precio,
    recaudado: Math.min(recaudado, precio),
    imagenUrl,
    urgente,
    creado: serverTimestamp()
  });

  objetivoForm.reset();
  document.getElementById("recaudado").value = 0;
});

onSnapshot(query(collection(db, "objetivos")), snapshot => {
  objetivosCache = [];
  snapshot.forEach(documento => {
    objetivosCache.push({ id: documento.id, ...documento.data() });
  });
  renderObjetivosAdmin();
});

buscadorObjetivos.addEventListener("input", renderObjetivosAdmin);

function renderObjetivosAdmin() {
  const busqueda = buscadorObjetivos.value.toLowerCase().trim();
  lista.innerHTML = "";

  const filtrados = objetivosCache.filter(o => {
    const texto = `${o.nombre || ""} ${o.descripcion || ""}`.toLowerCase();
    return texto.includes(busqueda);
  });

  filtrados.forEach(o => {
    const id = o.id;
    const precio = Number(o.precio || 0);
    const recaudado = Number(o.recaudado || 0);
    const recaudadoVisible = Math.min(recaudado, precio);
    const faltante = Math.max(0, precio - recaudadoVisible);
    const completado = precio > 0 && recaudadoVisible >= precio;

    const div = document.createElement("div");
    div.className = "card admin-objetivo";

    div.innerHTML = `
      <div class="admin-objetivo-vista" id="vista-${id}">
        ${o.imagenUrl ? `<img class="imagen-admin" src="${o.imagenUrl}" alt="${o.nombre || "Objetivo"}">` : ""}
        <h3>${o.nombre || "Sin nombre"}</h3>
        <p>${o.descripcion || "Sin descripción"}</p>
        <p>Precio: ${formatoPesos.format(precio)}</p>
        <p>Recaudado: ${formatoPesos.format(recaudadoVisible)}</p>
        <p>Faltante: ${formatoPesos.format(faltante)}</p>
        <p>${completado ? "✅ Objetivo completado" : "Objetivo abierto"}</p>

        <label>Registrar donación</label>
        <input type="number" id="donacion-${id}" placeholder="Monto donado" ${completado ? "disabled" : ""}>

        <button onclick="registrarDonacion('${id}', ${precio}, ${recaudadoVisible})" ${completado ? "disabled" : ""}>
          ${completado ? "Donaciones cerradas" : "Registrar donación"}
        </button>

        <button onclick="mostrarEditor('${id}')">Editar</button>
        <button class="btn-danger" onclick="eliminarObjetivo('${id}')">Eliminar</button>
      </div>

      <div class="editor-objetivo oculto" id="editor-${id}">
        <h3>Editar objetivo</h3>
        <input id="edit-nombre-${id}" value="${o.nombre || ""}" placeholder="Nombre">
        <input id="edit-descripcion-${id}" value="${o.descripcion || ""}" placeholder="Descripción">
        <input id="edit-precio-${id}" type="number" value="${precio}" placeholder="Precio">
        <input id="edit-recaudado-${id}" type="number" value="${recaudadoVisible}" placeholder="Recaudado">
        <input id="edit-imagen-${id}" value="${o.imagenUrl || ""}" placeholder="URL de imagen">
        <label><input id="edit-urgente-${id}" type="checkbox" ${o.urgente ? "checked" : ""}> Urgente</label>

        <button onclick="guardarEdicion('${id}')">Guardar cambios</button>
        <button onclick="cancelarEditor('${id}')">Cancelar</button>
      </div>
    `;

    lista.appendChild(div);
  });
}

window.mostrarEditor = function(id) {
  document.getElementById("vista-" + id).classList.add("oculto");
  document.getElementById("editor-" + id).classList.remove("oculto");
};

window.cancelarEditor = function(id) {
  document.getElementById("editor-" + id).classList.add("oculto");
  document.getElementById("vista-" + id).classList.remove("oculto");
};

window.guardarEdicion = async function(id) {
  const nombre = document.getElementById("edit-nombre-" + id).value.trim();
  const descripcion = document.getElementById("edit-descripcion-" + id).value.trim();
  const precio = Number(document.getElementById("edit-precio-" + id).value);
  const recaudado = Number(document.getElementById("edit-recaudado-" + id).value);
  const imagenUrl = document.getElementById("edit-imagen-" + id).value.trim();
  const urgente = document.getElementById("edit-urgente-" + id).checked;

  if (!nombre || !precio || precio <= 0) {
    alert("Nombre y precio son obligatorios.");
    return;
  }

  await updateDoc(doc(db, "objetivos", id), {
    nombre,
    descripcion,
    precio,
    recaudado: Math.min(recaudado, precio),
    imagenUrl,
    urgente,
    actualizado: serverTimestamp()
  });

  alert("Objetivo actualizado.");
};

window.registrarDonacion = async function(id, precio, recaudadoActual) {
  const input = document.getElementById("donacion-" + id);
  const monto = Number(input.value);

  if (!monto || monto <= 0) {
    alert("Ingresá un monto válido.");
    return;
  }

  const faltante = Math.max(0, precio - recaudadoActual);

  if (faltante <= 0) {
    alert("Este objetivo ya está completo. No se pueden registrar más donaciones.");
    return;
  }

  if (monto > faltante) {
    alert("El monto supera lo que falta. Para este objetivo solo faltan $" + faltante.toLocaleString());
    return;
  }

  await updateDoc(doc(db, "objetivos", id), {
    recaudado: increment(monto)
  });

  input.value = "";
};

window.eliminarObjetivo = async function(id) {
  const confirmar = confirm("¿Seguro que querés eliminar este objetivo?");
  if (!confirmar) return;

  await deleteDoc(doc(db, "objetivos", id));
};

const obraForm = document.getElementById("obraForm");
const listaObra = document.getElementById("listaObra");

obraForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  await addDoc(collection(db, "obra"), {
    titulo: document.getElementById("obraTitulo").value.trim(),
    imagenUrl: document.getElementById("obraImagenUrl").value.trim(),
    descripcion: document.getElementById("obraDescripcion").value.trim(),
    creado: serverTimestamp()
  });

  obraForm.reset();
});

onSnapshot(query(collection(db, "obra")), snapshot => {
  listaObra.innerHTML = "";
  snapshot.forEach(documento => {
    const o = documento.data();
    const id = documento.id;

    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      ${o.imagenUrl ? `<img class="imagen-admin" src="${o.imagenUrl}" alt="${o.titulo || "Obra"}">` : ""}
      <h3>${o.titulo || "Actualización de obra"}</h3>
      <p>${o.descripcion || ""}</p>
      <button class="btn-danger" onclick="eliminarObra('${id}')">Eliminar</button>
    `;
    listaObra.appendChild(div);
  });
});

window.eliminarObra = async function(id) {
  if (!confirm("¿Eliminar esta actualización de obra?")) return;
  await deleteDoc(doc(db, "obra", id));
};

const transparenciaForm = document.getElementById("transparenciaForm");
const listaTransparenciaAdmin = document.getElementById("listaTransparenciaAdmin");

transparenciaForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  await addDoc(collection(db, "transparencia"), {
    titulo: document.getElementById("transTitulo").value.trim(),
    monto: Number(document.getElementById("transMonto").value || 0),
    url: document.getElementById("transUrl").value.trim(),
    descripcion: document.getElementById("transDescripcion").value.trim(),
    creado: serverTimestamp()
  });

  transparenciaForm.reset();
});

onSnapshot(query(collection(db, "transparencia")), snapshot => {
  listaTransparenciaAdmin.innerHTML = "";
  snapshot.forEach(documento => {
    const o = documento.data();
    const id = documento.id;

    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <h3>${o.titulo || "Comprobante"}</h3>
      <p>${o.descripcion || ""}</p>
      <p>Monto: ${formatoPesos.format(Number(o.monto || 0))}</p>
      ${o.url ? `<a href="${o.url}" target="_blank" rel="noopener">Ver comprobante</a>` : ""}
      <br><br>
      <button class="btn-danger" onclick="eliminarTransparencia('${id}')">Eliminar</button>
    `;
    listaTransparenciaAdmin.appendChild(div);
  });
});

window.eliminarTransparencia = async function(id) {
  if (!confirm("¿Eliminar este comprobante?")) return;
  await deleteDoc(doc(db, "transparencia", id));
};
