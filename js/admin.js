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

import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

const form = document.getElementById("objetivoForm");
const lista = document.getElementById("listaObjetivos");

const configForm = document.getElementById("configForm");
const nombreEscuela = document.getElementById("nombreEscuela");
const subtituloEscuela = document.getElementById("subtituloEscuela");
const logoUrl = document.getElementById("logoUrl");
const logoArchivo = document.getElementById("logoArchivo");
const subirLogo = document.getElementById("subirLogo");
const guardarLogoUrl = document.getElementById("guardarLogoUrl");

const configRef = doc(db, "configuracion", "sitio");

onSnapshot(configRef, documento => {
  if (!documento.exists()) return;

  const data = documento.data();

  nombreEscuela.value = data.nombreEscuela || "";
  subtituloEscuela.value = data.subtitulo || "";
  logoUrl.value = data.logoUrl || "";

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
    actualizado: serverTimestamp()
  }, { merge: true });

  alert("Configuración guardada.");
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

subirLogo.addEventListener("click", async () => {
  const archivo = logoArchivo.files[0];

  if (!archivo) {
    alert("Seleccioná una imagen.");
    return;
  }

  const ruta = ref(storage, "configuracion/logo-institucional");
  await uploadBytes(ruta, archivo);

  const url = await getDownloadURL(ruta);

  await setDoc(configRef, {
    logoUrl: url,
    actualizado: serverTimestamp()
  }, { merge: true });

  logoUrl.value = url;
  alert("Logo subido y guardado.");
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const nombre = document.getElementById("nombre").value.trim();
  const descripcion = document.getElementById("descripcion").value.trim();
  const precio = Number(document.getElementById("precio").value);
  const recaudado = Number(document.getElementById("recaudado").value || 0);
  const urgente = document.getElementById("urgente").checked;

  if (!nombre || !precio || precio <= 0) {
    alert("Completá nombre y precio correctamente.");
    return;
  }

  const recaudadoFinal = Math.min(recaudado, precio);

  await addDoc(collection(db, "objetivos"), {
    nombre,
    descripcion,
    precio,
    recaudado: recaudadoFinal,
    urgente,
    creado: serverTimestamp()
  });

  form.reset();
  document.getElementById("recaudado").value = 0;
});

const q = query(collection(db, "objetivos"));

onSnapshot(q, snapshot => {
  lista.innerHTML = "";

  snapshot.forEach(documento => {
    const o = documento.data();
    const id = documento.id;

    const precio = Number(o.precio || 0);
    const recaudado = Number(o.recaudado || 0);
    const faltante = Math.max(0, precio - recaudado);
    const completado = precio > 0 && recaudado >= precio;

    const div = document.createElement("div");
    div.className = "card";

    div.innerHTML = `
      <h3>${o.nombre || "Sin nombre"}</h3>
      <p>${o.descripcion || "Sin descripción"}</p>
      <p>Precio: $${precio.toLocaleString()}</p>
      <p>Recaudado: $${Math.min(recaudado, precio).toLocaleString()}</p>
      <p>Faltante: $${faltante.toLocaleString()}</p>
      <p>${completado ? "✅ Objetivo completado" : "Objetivo abierto"}</p>

      <label>Registrar donación</label>
      <input type="number" id="donacion-${id}" placeholder="Monto donado" ${completado ? "disabled" : ""}>

      <button onclick="registrarDonacion('${id}', ${precio}, ${recaudado})" ${completado ? "disabled" : ""}>
        ${completado ? "Donaciones cerradas" : "Registrar donación"}
      </button>

      <button onclick="eliminarObjetivo('${id}')">Eliminar</button>
    `;

    lista.appendChild(div);
  });
});

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
