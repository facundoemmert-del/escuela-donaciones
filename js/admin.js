import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  increment,
  query,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const form = document.getElementById("objetivoForm");
const lista = document.getElementById("listaObjetivos");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const nombre = document.getElementById("nombre").value.trim();
  const precio = Number(document.getElementById("precio").value);
  const recaudado = Number(document.getElementById("recaudado").value || 0);

  if (!nombre || !precio || precio <= 0) {
    alert("Completá nombre y precio correctamente.");
    return;
  }

  await addDoc(collection(db, "objetivos"), {
    nombre,
    descripcion: "",
    precio,
    recaudado,
    urgente: false,
    creado: serverTimestamp()
  });

  form.reset();
});

const q = query(collection(db, "objetivos"), orderBy("creado", "desc"));

onSnapshot(q, snapshot => {
  lista.innerHTML = "";

  snapshot.forEach(documento => {
    const o = documento.data();
    const id = documento.id;

    const div = document.createElement("div");
    div.className = "card";

    div.innerHTML = `
      <h3>${o.nombre}</h3>
      <p>Precio: $${Number(o.precio || 0).toLocaleString()}</p>
      <p>Recaudado: $${Number(o.recaudado || 0).toLocaleString()}</p>

      <label>Registrar donación</label>
      <input type="number" id="donacion-${id}" placeholder="Monto donado">

      <button onclick="registrarDonacion('${id}')">Registrar donación</button>
      <button onclick="eliminarObjetivo('${id}')">Eliminar</button>
    `;

    lista.appendChild(div);
  });
});

window.registrarDonacion = async function(id) {
  const input = document.getElementById("donacion-" + id);
  const monto = Number(input.value);

  if (!monto || monto <= 0) {
    alert("Ingresá un monto válido.");
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
