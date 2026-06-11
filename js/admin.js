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
const SUPERADMIN_UID = "IArWgSKZF4a8eu0j3eoWS4el2P02";

let usuarioActualData = null;
let objetivosCache = [];
let adminsCreados = {};
let adminsAutorizados = {};

const formatoPesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0
});

function tienePermiso(permiso) {
  if (!usuarioActualData) return false;
  if (usuarioActualData.rol === "superadmin") return true;
  return usuarioActualData.permisos && usuarioActualData.permisos[permiso] === true;
}

async function cargarUsuario(user) {
  const email = user.email.toLowerCase();

  if (email === SUPERADMIN_EMAIL || user.uid === SUPERADMIN_UID) {
    usuarioActualData = {
      uid: user.uid,
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

    await setDoc(doc(db, "admins", user.uid), {
      ...usuarioActualData,
      actualizado: serverTimestamp()
    }, { merge: true });

    return true;
  }

  const adminUid = await getDoc(doc(db, "admins", user.uid));

  if (adminUid.exists() && adminUid.data().activo === true) {
    usuarioActualData = adminUid.data();
    return true;
  }

  const invitacion = await getDoc(doc(db, "adminsByEmail", email));

  if (invitacion.exists() && invitacion.data().activo === true) {
    const data = invitacion.data();
    usuarioActualData = {
      uid: user.uid,
      nombre: data.nombre || email,
      email,
      rol: "admin",
      activo: true,
      permisos: data.permisos || {}
    };

    await setDoc(doc(db, "admins", user.uid), {
      ...usuarioActualData,
      actualizado: serverTimestamp()
    }, { merge: true });

    return true;
  }

  return false;
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
  ocultarSeccionesSinPermiso();

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

function ocultarSeccionesSinPermiso() {
  document.querySelectorAll("[data-permiso]").forEach(btn => {
    const permiso = btn.dataset.permiso;
    if (!tienePermiso(permiso)) btn.remove();
  });

  document.querySelectorAll("[data-panel-permiso]").forEach(panel => {
    const permiso = panel.dataset.panelPermiso;
    if (!tienePermiso(permiso)) panel.remove();
  });

  const primerBoton = document.querySelector(".tab-btn");
  if (primerBoton) primerBoton.click();
}

function iniciarConfiguracion() {
  if (!tienePermiso("institucional")) return;

  const configRef = doc(db, "configuracion", "sitio");
  const form = document.getElementById("configForm");
  if (!form) return;

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

  form.addEventListener("submit", async e => {
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

function iniciarObjetivos() {
  if (!tienePermiso("objetivos")) return;

  const form = document.getElementById("objetivoForm");
  const buscador = document.getElementById("buscadorObjetivos");
  if (!form || !buscador) return;

  form.addEventListener("submit", async e => {
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

    form.reset();
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
      div.className = "card";
      div.innerHTML = `
        <div id="vista-${id}">
          ${o.imagenUrl ? `<img class="imagen-admin" src="${o.imagenUrl}" alt="${o.nombre || "Objetivo"}">` : ""}
          <h3>${o.nombre || "Sin nombre"}</h3>
          <p>${o.descripcion || "Sin descripción"}</p>
          <p>Precio: ${formatoPesos.format(precio)}</p>
          <p>Recaudado: ${formatoPesos.format(recaudado)}</p>
          <p>Faltante: ${formatoPesos.format(faltante)}</p>
          <p>${completado ? "✅ Objetivo completado" : "Objetivo abierto"}</p>

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

function permisosComoTexto(permisos = {}) {
  const nombres = {
    institucional: "Información institucional",
    objetivos: "Objetivos",
    obra: "Actualización de obra",
    transparencia: "Transparencia",
    usuarios: "Administradores"
  };

  const activos = Object.entries(permisos)
    .filter(([k, v]) => v)
    .map(([k]) => nombres[k] || k);

  return activos.length ? activos.join(", ") : "Sin permisos asignados";
}

function iniciarUsuarios() {
  if (!tienePermiso("usuarios")) return;

  const form = document.getElementById("usuarioForm");
  const lista = document.getElementById("listaUsuarios");
  if (!form || !lista) return;

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const email = document.getElementById("usuarioEmail").value.trim().toLowerCase();

    await setDoc(doc(db, "adminsByEmail", email), {
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
      autorizadoPor: usuarioActualData.email,
      creado: serverTimestamp()
    });

    form.reset();
    alert("Administrador autorizado. Ahora esa persona entra a login.html y toca Crear cuenta autorizada.");
  });

  onSnapshot(query(collection(db, "admins")), snapshot => {
    adminsCreados = {};
    snapshot.forEach(d => {
      const u = d.data();
      if (u.email) adminsCreados[u.email.toLowerCase()] = { id: d.id, ...u };
    });
    renderAdmins();
  });

  onSnapshot(query(collection(db, "adminsByEmail")), snapshot => {
    adminsAutorizados = {};
    snapshot.forEach(d => {
      const u = d.data();
      if (u.email) adminsAutorizados[u.email.toLowerCase()] = { id: d.id, ...u };
    });
    renderAdmins();
  });
}

function renderAdmins() {
  const lista = document.getElementById("listaUsuarios");
  if (!lista) return;

  const emails = new Set([
    ...Object.keys(adminsAutorizados),
    ...Object.keys(adminsCreados)
  ]);

  lista.innerHTML = "";

  emails.forEach(email => {
    const autorizado = adminsAutorizados[email];
    const creado = adminsCreados[email];
    const data = creado || autorizado;

    const esSuper = data.rol === "superadmin" || email === SUPERADMIN_EMAIL;
    const permisos = data.permisos || {};
    const estado = data.activo !== false;

    const div = document.createElement("div");
    div.className = "admin-card";

    div.innerHTML = `
      <div>
        <h3>${data.nombre || "Sin nombre"}</h3>
        <p><strong>Correo:</strong> ${email}</p>
        <p><strong>Rol:</strong> ${esSuper ? "Superadministrador" : "Administrador"}</p>
        <p><strong>Estado:</strong> ${estado ? "Activo" : "Bloqueado"}</p>
        <p><strong>Cuenta:</strong> ${creado ? "Creada en Authentication" : "Autorizada, pendiente de crear cuenta"}</p>
        <p><strong>Permisos:</strong> ${esSuper ? "Acceso total" : permisosComoTexto(permisos)}</p>
      </div>

      <div class="admin-actions">
        ${!esSuper ? `<button onclick="editarPermisosAdmin('${email}')">Editar permisos</button>` : ""}
        ${!esSuper ? `<button class="btn-danger" onclick="cambiarEstadoAdmin('${email}', ${estado ? "false" : "true"})">${estado ? "Bloquear" : "Activar"}</button>` : ""}
      </div>

      ${!esSuper ? `
        <div id="edit-admin-${email.replaceAll("@", "_").replaceAll(".", "_")}" class="admin-edit oculto">
          <label><input type="checkbox" id="edit-${email}-institucional" ${permisos.institucional ? "checked" : ""}> Información institucional</label>
          <label><input type="checkbox" id="edit-${email}-objetivos" ${permisos.objetivos ? "checked" : ""}> Objetivos</label>
          <label><input type="checkbox" id="edit-${email}-obra" ${permisos.obra ? "checked" : ""}> Actualización de obra</label>
          <label><input type="checkbox" id="edit-${email}-transparencia" ${permisos.transparencia ? "checked" : ""}> Transparencia</label>
          <button onclick="guardarPermisosAdmin('${email}')">Guardar permisos</button>
        </div>
      ` : ""}
    `;

    lista.appendChild(div);
  });
}

window.cambiarEstadoAdmin = async (email, estado) => {
  await setDoc(doc(db, "adminsByEmail", email), { activo: estado }, { merge: true });
};

window.editarPermisosAdmin = (email) => {
  const id = "edit-admin-" + email.replaceAll("@", "_").replaceAll(".", "_");
  document.getElementById(id).classList.toggle("oculto");
};

window.guardarPermisosAdmin = async (email) => {
  const permisos = {
    institucional: document.getElementById(`edit-${email}-institucional`).checked,
    objetivos: document.getElementById(`edit-${email}-objetivos`).checked,
    obra: document.getElementById(`edit-${email}-obra`).checked,
    transparencia: document.getElementById(`edit-${email}-transparencia`).checked,
    usuarios: false
  };

  await setDoc(doc(db, "adminsByEmail", email), {
    permisos,
    actualizado: serverTimestamp()
  }, { merge: true });

  const creado = adminsCreados[email];
  if (creado && creado.id) {
    await setDoc(doc(db, "admins", creado.id), {
      permisos,
      actualizado: serverTimestamp()
    }, { merge: true });
  }

  alert("Permisos actualizados.");
};
