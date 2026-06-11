import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
  increment, query, onSnapshot, setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const SUPERADMIN_EMAIL = "facundoemmert@gmail.com";
let usuarioActualData = null;

const formatoPesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

function idEmail(email) {
  return email.toLowerCase().replace(/[.#$/\[\]]/g, "_");
}

function tienePermiso(permiso) {
  if (!usuarioActualData) return false;
  if (usuarioActualData.rol === "superadmin") return true;
  return usuarioActualData.permisos && usuarioActualData.permisos[permiso] === true;
}

function mostrarPanelesPermitidos() {
  document.querySelectorAll("[data-permiso]").forEach(btn => {
    const permiso = btn.dataset.permiso;
    btn.style.display = tienePermiso(permiso) ? "inline-block" : "none";
  });

  document.querySelectorAll("[data-panel-permiso]").forEach(panel => {
    const permiso = panel.dataset.panelPermiso;
    if (!tienePermiso(permiso)) panel.remove();
  });

  const primerBoton = document.querySelector(".tab-btn[style*='inline-block'], .tab-btn:not([style*='display: none'])");
  if (primerBoton) primerBoton.click();
}

async function cargarUsuario(user) {
  const email = user.email.toLowerCase();

  if (email === SUPERADMIN_EMAIL) {
    usuarioActualData = {
      nombre: "Facundo Emmert",
      email,
      rol: "superadmin",
      activo: true,
      permisos: {
        institucional: true,
        objetivos: true,
        obra: true,
        transparencia: true,
        usuarios: true
      }
    };

    await setDoc(doc(db, "usuarios", idEmail(email)), usuarioActualData, { merge: true });
    return true;
  }

  const ref = doc(db, "usuarios", idEmail(email));
  const snap = await getDoc(ref);

  if (!snap.exists() || snap.data().activo !== true) return false;

  usuarioActualData = snap.data();
  return true;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const autorizado = await cargarUsuario(user);

  if (!autorizado) {
    await signOut(auth);
    window.location.href = "login.html";
    return;
  }

  document.getElementById("usuarioActual").textContent =
    `${usuarioActualData.nombre || user.email} - ${usuarioActualData.rol}`;

  document.getElementById("bloqueoAdmin").classList.add("oculto");
  document.getElementById("adminContenido").classList.remove("oculto");

  iniciarPanel();
});

document.getElementById("cerrarSesionBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "login.html";
});

function iniciarPanel() {
  activarTabs();
  mostrarPanelesPermitidos();
  iniciarConfiguracion();
  iniciarObjetivos();
  iniciarObra();
  iniciarTransparencia();
  iniciarUsuarios();
}

function activarTabs() {
  const botones = document.querySelectorAll(".tab-btn");
  const paneles = document.querySelectorAll(".tab-panel");

  botones.forEach(boton => {
    boton.addEventListener("click", () => {
      botones.forEach(b => b.classList.remove("activo"));
      paneles.forEach(p => p.classList.remove("activo"));
      boton.classList.add("activo");
      const panel = document.getElementById(boton.dataset.tab);
      if (panel) panel.classList.add("activo");
    });
  });
}

function iniciarConfiguracion() {
  if (!tienePermiso("institucional")) return;

  const configRef = doc(db, "configuracion", "sitio");
  const configForm = document.getElementById("configForm");
  if (!configForm) return;

  onSnapshot(configRef, documento => {
    if (!documento.exists()) return;
    const data = documento.data();

    document.getElementById("nombreEscuela").value = data.nombreEscuela || "";
    document.getElementById("subtituloEscuela").value = data.subtitulo || "";
    document.getElementById("logoUrl").value = data.logoUrl || "";
    document.getElementById("infoInstitucional").value = data.infoInstitucional || "";
    document.getElementById("nombreEscuelaAdmin").textContent = data.nombreEscuela || "Los Naranjos de la Concordia D-114";

    const logoAdmin = document.getElementById("logoAdmin");
    if (data.logoUrl) {
      logoAdmin.src = data.logoUrl;
      logoAdmin.classList.remove("oculto");
    }
  });

  configForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    await setDoc(configRef, {
      nombreEscuela: document.getElementById("nombreEscuela").value.trim(),
      subtitulo: document.getElementById("subtituloEscuela").value.trim(),
      logoUrl: document.getElementById("logoUrl").value.trim(),
      infoInstitucional: document.getElementById("infoInstitucional").value.trim(),
      actualizado: serverTimestamp()
    }, { merge: true });
    alert("Información institucional guardada.");
  });

  document.getElementById("guardarLogoUrl").addEventListener("click", async () => {
    const url = document.getElementById("logoUrl").value.trim();
    if (!url) return alert("Pegá una URL de logo.");
    await setDoc(configRef, { logoUrl: url, actualizado: serverTimestamp() }, { merge: true });
    alert("Logo guardado.");
  });
}

let objetivosCache = [];

function iniciarObjetivos() {
  if (!tienePermiso("objetivos")) return;

  const objetivoForm = document.getElementById("objetivoForm");
  const lista = document.getElementById("listaObjetivos");
  const buscador = document.getElementById("buscadorObjetivos");
  if (!objetivoForm || !lista) return;

  objetivoForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const precio = Number(document.getElementById("precio").value);
    const recaudado = Number(document.getElementById("recaudado").value || 0);

    await addDoc(collection(db, "objetivos"), {
      nombre: document.getElementById("nombre").value.trim(),
      descripcion: document.getElementById("descripcion").value.trim(),
      precio,
      recaudado: Math.min(recaudado, precio),
      imagenUrl: document.getElementById("imagenUrl").value.trim(),
      urgente: document.getElementById("urgente").checked,
      creado: serverTimestamp()
    });

    objetivoForm.reset();
    document.getElementById("recaudado").value = 0;
  });

  onSnapshot(query(collection(db, "objetivos")), snapshot => {
    objetivosCache = [];
    snapshot.forEach(d => objetivosCache.push({ id: d.id, ...d.data() }));
    renderObjetivosAdmin();
  });

  buscador.addEventListener("input", renderObjetivosAdmin);
}

function renderObjetivosAdmin() {
  const lista = document.getElementById("listaObjetivos");
  const buscador = document.getElementById("buscadorObjetivos");
  if (!lista || !buscador) return;

  const busqueda = buscador.value.toLowerCase().trim();
  lista.innerHTML = "";

  objetivosCache
    .filter(o => `${o.nombre || ""} ${o.descripcion || ""}`.toLowerCase().includes(busqueda))
    .forEach(o => {
      const id = o.id;
      const precio = Number(o.precio || 0);
      const recaudado = Math.min(Number(o.recaudado || 0), precio);
      const faltante = Math.max(0, precio - recaudado);
      const completado = precio > 0 && recaudado >= precio;

      const div = document.createElement("div");
      div.className = "card admin-objetivo";
      div.innerHTML = `
        <div id="vista-${id}">
          ${o.imagenUrl ? `<img class="imagen-admin" src="${o.imagenUrl}" alt="${o.nombre || "Objetivo"}">` : ""}
          <h3>${o.nombre || "Sin nombre"}</h3>
          <p>${o.descripcion || "Sin descripción"}</p>
          <p>Precio: ${formatoPesos.format(precio)}</p>
          <p>Recaudado: ${formatoPesos.format(recaudado)}</p>
          <p>Faltante: ${formatoPesos.format(faltante)}</p>
          <p>${completado ? "✅ Objetivo completado" : "Objetivo abierto"}</p>

          <label>Registrar donación</label>
          <input type="number" id="donacion-${id}" placeholder="Monto donado" ${completado ? "disabled" : ""}>

          <button onclick="registrarDonacion('${id}', ${precio}, ${recaudado})" ${completado ? "disabled" : ""}>
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
          <input id="edit-recaudado-${id}" type="number" value="${recaudado}" placeholder="Recaudado">
          <input id="edit-imagen-${id}" value="${o.imagenUrl || ""}" placeholder="URL de imagen">
          <label><input id="edit-urgente-${id}" type="checkbox" ${o.urgente ? "checked" : ""}> Urgente</label>
          <button onclick="guardarEdicion('${id}')">Guardar cambios</button>
          <button onclick="cancelarEditor('${id}')">Cancelar</button>
        </div>
      `;
      lista.appendChild(div);
    });
}

window.mostrarEditor = id => {
  document.getElementById("vista-" + id).classList.add("oculto");
  document.getElementById("editor-" + id).classList.remove("oculto");
};
window.cancelarEditor = id => {
  document.getElementById("editor-" + id).classList.add("oculto");
  document.getElementById("vista-" + id).classList.remove("oculto");
};
window.guardarEdicion = async id => {
  const precio = Number(document.getElementById("edit-precio-" + id).value);
  const recaudado = Number(document.getElementById("edit-recaudado-" + id).value);

  await updateDoc(doc(db, "objetivos", id), {
    nombre: document.getElementById("edit-nombre-" + id).value.trim(),
    descripcion: document.getElementById("edit-descripcion-" + id).value.trim(),
    precio,
    recaudado: Math.min(recaudado, precio),
    imagenUrl: document.getElementById("edit-imagen-" + id).value.trim(),
    urgente: document.getElementById("edit-urgente-" + id).checked,
    actualizado: serverTimestamp()
  });
  alert("Objetivo actualizado.");
};
window.registrarDonacion = async (id, precio, recaudadoActual) => {
  const input = document.getElementById("donacion-" + id);
  const monto = Number(input.value);
  const faltante = Math.max(0, precio - recaudadoActual);

  if (!monto || monto <= 0) return alert("Ingresá un monto válido.");
  if (monto > faltante) return alert("El monto supera lo que falta. Faltan $" + faltante.toLocaleString());

  await updateDoc(doc(db, "objetivos", id), { recaudado: increment(monto) });
  input.value = "";
};
window.eliminarObjetivo = async id => {
  if (!confirm("¿Seguro que querés eliminar este objetivo?")) return;
  await deleteDoc(doc(db, "objetivos", id));
};

function iniciarObra() {
  if (!tienePermiso("obra")) return;
  const form = document.getElementById("obraForm");
  const lista = document.getElementById("listaObra");
  if (!form || !lista) return;

  form.addEventListener("submit", async e => {
    e.preventDefault();
    await addDoc(collection(db, "obra"), {
      titulo: document.getElementById("obraTitulo").value.trim(),
      imagenUrl: document.getElementById("obraImagenUrl").value.trim(),
      descripcion: document.getElementById("obraDescripcion").value.trim(),
      creado: serverTimestamp()
    });
    form.reset();
  });

  onSnapshot(query(collection(db, "obra")), snapshot => {
    lista.innerHTML = "";
    snapshot.forEach(d => {
      const o = d.data();
      const div = document.createElement("div");
      div.className = "card";
      div.innerHTML = `${o.imagenUrl ? `<img class="imagen-admin" src="${o.imagenUrl}">` : ""}<h3>${o.titulo || "Obra"}</h3><p>${o.descripcion || ""}</p><button class="btn-danger" onclick="eliminarObra('${d.id}')">Eliminar</button>`;
      lista.appendChild(div);
    });
  });
}
window.eliminarObra = async id => {
  if (!confirm("¿Eliminar esta actualización?")) return;
  await deleteDoc(doc(db, "obra", id));
};

function iniciarTransparencia() {
  if (!tienePermiso("transparencia")) return;
  const form = document.getElementById("transparenciaForm");
  const lista = document.getElementById("listaTransparenciaAdmin");
  if (!form || !lista) return;

  form.addEventListener("submit", async e => {
    e.preventDefault();
    await addDoc(collection(db, "transparencia"), {
      titulo: document.getElementById("transTitulo").value.trim(),
      monto: Number(document.getElementById("transMonto").value || 0),
      url: document.getElementById("transUrl").value.trim(),
      descripcion: document.getElementById("transDescripcion").value.trim(),
      creado: serverTimestamp()
    });
    form.reset();
  });

  onSnapshot(query(collection(db, "transparencia")), snapshot => {
    lista.innerHTML = "";
    snapshot.forEach(d => {
      const o = d.data();
      const div = document.createElement("div");
      div.className = "card";
      div.innerHTML = `<h3>${o.titulo || "Comprobante"}</h3><p>${o.descripcion || ""}</p><p>Monto: ${formatoPesos.format(Number(o.monto || 0))}</p>${o.url ? `<a href="${o.url}" target="_blank">Ver comprobante</a>` : ""}<br><br><button class="btn-danger" onclick="eliminarTransparencia('${d.id}')">Eliminar</button>`;
      lista.appendChild(div);
    });
  });
}
window.eliminarTransparencia = async id => {
  if (!confirm("¿Eliminar este comprobante?")) return;
  await deleteDoc(doc(db, "transparencia", id));
};

function iniciarUsuarios() {
  if (!tienePermiso("usuarios")) return;

  const form = document.getElementById("usuarioForm");
  const lista = document.getElementById("listaUsuarios");
  if (!form || !lista) return;

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const email = document.getElementById("usuarioEmail").value.trim().toLowerCase();

    await setDoc(doc(db, "usuarios", idEmail(email)), {
      nombre: document.getElementById("usuarioNombre").value.trim(),
      email,
      rol: "admin",
      activo: true,
      permisos: {
        institucional: document.getElementById("permInstitucional").checked,
        objetivos: document.getElementById("permObjetivos").checked,
        obra: document.getElementById("permObra").checked,
        transparencia: document.getElementById("permTransparencia").checked,
        usuarios: false
      },
      creado: serverTimestamp()
    });

    form.reset();
    alert("Administrador autorizado. Ahora esa persona puede crear su cuenta desde login.html.");
  });

  onSnapshot(query(collection(db, "usuarios")), snapshot => {
    lista.innerHTML = "";
    snapshot.forEach(d => {
      const u = d.data();
      const div = document.createElement("div");
      div.className = "card";
      div.innerHTML = `
        <h3>${u.nombre || "Sin nombre"}</h3>
        <p>${u.email}</p>
        <p>Rol: ${u.rol}</p>
        <p>Estado: ${u.activo ? "Activo" : "Bloqueado"}</p>
        <p>Permisos: ${Object.entries(u.permisos || {}).filter(([k,v]) => v).map(([k]) => k).join(", ")}</p>
        ${u.rol !== "superadmin" ? `<button onclick="cambiarEstadoUsuario('${d.id}', ${u.activo ? "false" : "true"})">${u.activo ? "Bloquear" : "Activar"}</button>` : ""}
      `;
      lista.appendChild(div);
    });
  });
}
window.cambiarEstadoUsuario = async (id, estado) => {
  await updateDoc(doc(db, "usuarios", id), { activo: estado });
};
