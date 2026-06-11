import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth,onAuthStateChanged,signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore,collection,addDoc,updateDoc,deleteDoc,doc,serverTimestamp,increment,query,onSnapshot,setDoc,getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
const db=getFirestore(app);

const SUPERADMIN_EMAIL="facundoemmert@gmail.com";
const SUPERADMIN_UID="IArWgSKZF4a8eu0j3eoWS4el2P02";

let usuarioActualData=null;
let objetivosCache=[];
let adminsCreados={};
let adminsAutorizados={};

const formatoPesos=new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0});

function tienePermiso(p){
  return usuarioActualData&&(usuarioActualData.rol==="superadmin"||(usuarioActualData.permisos&&usuarioActualData.permisos[p]===true));
}

async function cargarUsuario(user){
  const email=user.email.toLowerCase();

  if(email===SUPERADMIN_EMAIL||user.uid===SUPERADMIN_UID){
    usuarioActualData={
      uid:user.uid,
      nombre:"Facundo Emmert",
      email,
      rol:"superadmin",
      activo:true,
      permisos:{institucional:true,objetivos:true,obra:true,transparencia:true,usuarios:true}
    };
    await setDoc(doc(db,"admins",user.uid),{...usuarioActualData,actualizado:serverTimestamp()},{merge:true});
    return true;
  }

  const adminUid=await getDoc(doc(db,"admins",user.uid));
  if(adminUid.exists()&&adminUid.data().activo===true){
    usuarioActualData=adminUid.data();
    return true;
  }

  const inv=await getDoc(doc(db,"adminsByEmail",email));
  if(inv.exists()&&inv.data().activo===true){
    const d=inv.data();
    usuarioActualData={uid:user.uid,nombre:d.nombre||email,email,rol:"admin",activo:true,permisos:d.permisos||{}};
    await setDoc(doc(db,"admins",user.uid),{...usuarioActualData,actualizado:serverTimestamp()},{merge:true});
    return true;
  }

  return false;
}

onAuthStateChanged(auth,async user=>{
  if(!user) return location.href="login.html";
  if(!await cargarUsuario(user)){
    await signOut(auth);
    return location.href="login.html";
  }

  document.getElementById("usuarioActual").textContent=`${usuarioActualData.nombre} - ${usuarioActualData.rol}`;
  document.getElementById("bloqueoAdmin").classList.add("oculto");
  document.getElementById("adminContenido").classList.remove("oculto");
  iniciar();
});

document.getElementById("cerrarSesionBtn").onclick=async()=>{
  await signOut(auth);
  location.href="login.html";
};

function iniciar(){
  tabs();
  permisos();
  config();
  objetivos();
  donaciones();
  obra();
  transparencia();
  usuarios();
}

function tabs(){
  document.querySelectorAll(".tab-btn").forEach(b=>b.onclick=()=>{
    document.querySelectorAll(".tab-btn").forEach(x=>x.classList.remove("activo"));
    document.querySelectorAll(".tab-panel").forEach(x=>x.classList.remove("activo"));
    b.classList.add("activo");
    document.getElementById(b.dataset.tab)?.classList.add("activo");
  });
}

function permisos(){
  document.querySelectorAll("[data-permiso]").forEach(b=>{
    if(!tienePermiso(b.dataset.permiso)) b.remove();
  });
  document.querySelectorAll("[data-panel-permiso]").forEach(p=>{
    if(!tienePermiso(p.dataset.panelPermiso)) p.remove();
  });
  document.querySelector(".tab-btn")?.click();
}

function config(){
  if(!tienePermiso("institucional")) return;

  const ref=doc(db,"configuracion","sitio");
  const f=document.getElementById("configForm");
  if(!f) return;

  onSnapshot(ref,s=>{
    if(!s.exists()) return;
    const d=s.data();

    document.getElementById("nombreEscuela").value=d.nombreEscuela||"";
    document.getElementById("subtituloEscuela").value=d.subtitulo||"";
    document.getElementById("logoUrl").value=d.logoUrl||"";
    document.getElementById("alias").value=d.alias||"";
    document.getElementById("cbu").value=d.cbu||"";
    document.getElementById("titularCuenta").value=d.titularCuenta||"";
    document.getElementById("infoInstitucional").value=d.infoInstitucional||"";

    document.getElementById("nombreEscuelaAdmin").textContent=d.nombreEscuela||"Los Naranjos de la Concordia D-114";

    if(d.logoUrl){
      const l=document.getElementById("logoAdmin");
      l.src=d.logoUrl;
      l.classList.remove("oculto");
    }
  });

  f.onsubmit=async e=>{
    e.preventDefault();
    await setDoc(ref,{
      nombreEscuela:document.getElementById("nombreEscuela").value.trim(),
      subtitulo:document.getElementById("subtituloEscuela").value.trim(),
      logoUrl:document.getElementById("logoUrl").value.trim(),
      alias:document.getElementById("alias").value.trim(),
      cbu:document.getElementById("cbu").value.trim(),
      titularCuenta:document.getElementById("titularCuenta").value.trim(),
      infoInstitucional:document.getElementById("infoInstitucional").value.trim(),
      actualizado:serverTimestamp()
    },{merge:true});
    alert("Información institucional guardada.");
  };
}

function objetivos(){
  if(!tienePermiso("objetivos")) return;

  const f=document.getElementById("objetivoForm");
  const bus=document.getElementById("buscadorObjetivos");
  if(!f) return;

  f.onsubmit=async e=>{
    e.preventDefault();
    const precio=Number(document.getElementById("precio").value);
    const rec=Number(document.getElementById("recaudado").value||0);

    await addDoc(collection(db,"objetivos"),{
      nombre:document.getElementById("nombre").value.trim(),
      descripcion:document.getElementById("descripcion").value.trim(),
      precio,
      recaudado:Math.min(rec,precio),
      imagenUrl:document.getElementById("imagenUrl").value.trim(),
      urgente:document.getElementById("urgente").checked,
      creado:serverTimestamp()
    });

    f.reset();
    document.getElementById("recaudado").value=0;
  };

  onSnapshot(query(collection(db,"objetivos")),s=>{
    objetivosCache=[];
    s.forEach(d=>objetivosCache.push({id:d.id,...d.data()}));
    renderObjetivos();
  });

  bus.oninput=renderObjetivos;
}

function limpiarTexto(valor){
  return String(valor||"").replaceAll('"',"&quot;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

function cerrarModalAdmin(){
  const modal=document.getElementById("modalAdminEdicion");
  if(modal) modal.remove();
}

function crearModalAdmin(titulo, contenidoHtml){
  cerrarModalAdmin();

  const modal=document.createElement("div");
  modal.id="modalAdminEdicion";
  modal.className="modal";
  modal.innerHTML=`
    <div class="modal-card modal-admin-card">
      <button class="modal-cerrar" type="button" onclick="cerrarModalAdmin()">×</button>
      <h2>${titulo}</h2>
      ${contenidoHtml}
    </div>
  `;

  document.body.appendChild(modal);
}

window.cerrarModalAdmin=cerrarModalAdmin;

function renderObjetivos(){
  const l=document.getElementById("listaObjetivos");
  const bus=document.getElementById("buscadorObjetivos");
  if(!l) return;

  const q=(bus?.value||"").toLowerCase();
  l.innerHTML="";

  objetivosCache
    .filter(o=>`${o.nombre||""} ${o.descripcion||""}`.toLowerCase().includes(q))
    .forEach(o=>{
      const precio=Number(o.precio||0);
      const rec=Math.min(Number(o.recaudado||0),precio);
      const faltante=Math.max(0,precio-rec);
      const completado=precio>0&&rec>=precio;
      const porcentaje=precio>0?Math.min(100,Math.round((rec/precio)*100)):0;

      const div=document.createElement("div");
      div.className="card";
      div.innerHTML=`
        ${o.imagenUrl?`<img class="imagen-admin" src="${limpiarTexto(o.imagenUrl)}" alt="${limpiarTexto(o.nombre)||"Objetivo"}">`:""}
        <h3>${o.nombre||"Sin nombre"}</h3>
        <p>${o.descripcion||"Sin descripción"}</p>
        <div class="barra"><div class="progreso" style="width:${porcentaje}%"></div></div>
        <p><strong>Precio:</strong> ${formatoPesos.format(precio)}</p>
        <p><strong>Recaudado:</strong> ${formatoPesos.format(rec)}</p>
        <p><strong>Faltante:</strong> ${formatoPesos.format(faltante)}</p>
        <p>${completado?"✅ Objetivo completado":"Objetivo abierto"}</p>

        <button onclick="abrirEditorObjetivo('${o.id}')">Editar datos</button>
        <button class="btn-danger" onclick="eliminarObjetivo('${o.id}')">Eliminar</button>
      `;
      l.appendChild(div);
    });
}

window.abrirEditorObjetivo=id=>{
  const o=objetivosCache.find(obj=>obj.id===id);
  if(!o) return alert("No se encontró el objetivo.");

  const precio=Number(o.precio||0);
  const rec=Math.min(Number(o.recaudado||0),precio);
  const faltante=Math.max(0,precio-rec);

  crearModalAdmin("Editar objetivo", `
    <div class="form-modal-admin">
      <label>Nombre</label>
      <input id="edit-nombre-${id}" value="${limpiarTexto(o.nombre)}" placeholder="Nombre">

      <label>Descripción</label>
      <input id="edit-descripcion-${id}" value="${limpiarTexto(o.descripcion)}" placeholder="Descripción">

      <label>Precio actualizado</label>
      <input id="edit-precio-${id}" type="number" value="${precio}" placeholder="Precio">

      <label>URL de imagen</label>
      <input id="edit-imagen-${id}" value="${limpiarTexto(o.imagenUrl)}" placeholder="URL de imagen">

      <label class="check-admin"><input id="edit-urgente-${id}" type="checkbox" ${o.urgente?"checked":""}> Marcar como urgente</label>

      <div class="campo-completo">
        <p><strong>Recaudado:</strong> ${formatoPesos.format(rec)} — este dato no se edita manualmente.</p>
        <p><strong>Faltante actual:</strong> ${formatoPesos.format(faltante)}</p>
      </div>

      <div class="acciones-modal">
        <button onclick="guardarObjetivo('${id}')">Guardar cambios</button>
        <button type="button" onclick="cerrarModalAdmin()">Cancelar</button>
      </div>
    </div>
  `);
};

window.guardarObjetivo=async id=>{
  const objetivo=objetivosCache.find(o=>o.id===id);
  const recaudadoActual=Number(objetivo?.recaudado||0);
  const precioNuevo=Number(document.getElementById("edit-precio-"+id).value);

  if(!precioNuevo||precioNuevo<=0){
    alert("El precio debe ser mayor a 0.");
    return;
  }

  if(precioNuevo<recaudadoActual){
    alert("El precio no puede ser menor a lo ya recaudado.");
    return;
  }

  await updateDoc(doc(db,"objetivos",id),{
    nombre:document.getElementById("edit-nombre-"+id).value.trim(),
    descripcion:document.getElementById("edit-descripcion-"+id).value.trim(),
    precio:precioNuevo,
    imagenUrl:document.getElementById("edit-imagen-"+id).value.trim(),
    urgente:document.getElementById("edit-urgente-"+id).checked,
    actualizado:serverTimestamp()
  });

  alert("Objetivo actualizado. No se modificó lo recaudado.");
  cerrarModalAdmin();
};

window.eliminarObjetivo=async id=>{
  if(confirm("¿Eliminar objetivo?")) await deleteDoc(doc(db,"objetivos",id));
};

function donaciones(){
  if(!tienePermiso("objetivos")) return;

  const pendientes=document.getElementById("listaDonacionesPendientes");
  const hist=document.getElementById("historialDonacionesAdmin");
  if(!pendientes) return;

  onSnapshot(query(collection(db,"donaciones")),s=>{
    let ap=0;
    let pe=0;
    const donantes=new Set();

    pendientes.innerHTML="";
    hist.innerHTML="";

    s.forEach(d=>{
      const x=d.data();
      const nombre=x.nombreCompletoDonante || `${x.nombreDonante||""} ${x.apellidoDonante||""}`.trim() || "Donante";

      if(x.estado==="aprobada"){
        ap++;
        donantes.add((x.dniDonante||nombre).trim().toLowerCase());
        hist.innerHTML=`
          <div class="historial-item">
            <strong>${nombre}</strong> - DNI ${x.dniDonante||"sin cargar"} - donó ${formatoPesos.format(Number(x.monto||0))} para <strong>${x.objetivoNombre}</strong>
            ${x.numeroComprobante?` - Ref.: ${x.numeroComprobante}`:""}
          </div>
        `+hist.innerHTML;
      }

      if(x.estado==="pendiente"){
        pe++;
        const div=document.createElement("div");
        div.className="admin-card";
        div.innerHTML=`
          <div>
            <h3>${x.objetivoNombre}</h3>
            <p><strong>Nombre:</strong> ${x.nombreDonante||""}</p>
            <p><strong>Apellido:</strong> ${x.apellidoDonante||""}</p>
            <p><strong>DNI:</strong> ${x.dniDonante||""}</p>
            <p><strong>Monto:</strong> ${formatoPesos.format(Number(x.monto||0))}</p>
            <p><strong>Objetivo:</strong> ${x.objetivoNombre}</p>
            ${x.numeroComprobante?`<p><strong>N° comprobante/ref.:</strong> ${x.numeroComprobante}</p>`:""}
            <p><strong>Declaración:</strong> ${x.declaraTransferencia?"Realizó la transferencia":"No declarada"}</p>
          </div>
          <div class="admin-actions">
            <button onclick="aprobarDonacion('${d.id}','${x.objetivoId}',${Number(x.monto||0)})">Aceptar / Comprobado</button>
            <button class="btn-danger" onclick="rechazarDonacion('${d.id}')">Rechazar</button>
          </div>
        `;
        pendientes.appendChild(div);
      }
    });

    document.getElementById("adminDonantes").textContent=donantes.size;
    document.getElementById("adminAprobadas").textContent=ap;
    document.getElementById("adminPendientes").textContent=pe;

    if(!pe) pendientes.innerHTML="<p>No hay donaciones pendientes.</p>";
    if(!ap) hist.innerHTML="<p>No hay donaciones aprobadas.</p>";
  });
}

window.aprobarDonacion=async(id,obj,m)=>{
  if(!confirm("¿Comprobaste que el dinero ingresó?")) return;
  await updateDoc(doc(db,"objetivos",obj),{recaudado:increment(m),actualizado:serverTimestamp()});
  await updateDoc(doc(db,"donaciones",id),{estado:"aprobada",aprobadoPor:usuarioActualData.email,aprobado:serverTimestamp()});
  alert("Donación aprobada y sumada.");
};

window.rechazarDonacion=async id=>{
  if(confirm("¿Rechazar?")) await updateDoc(doc(db,"donaciones",id),{estado:"rechazada",rechazadoPor:usuarioActualData.email,rechazado:serverTimestamp()});
};

function obra(){
  if(!tienePermiso("obra")) return;

  const f=document.getElementById("obraForm");
  const l=document.getElementById("listaObra");
  if(!f) return;

  f.onsubmit=async e=>{
    e.preventDefault();

    const titulo=document.getElementById("obraTitulo").value.trim();
    const imagenUrl=document.getElementById("obraImagenUrl").value.trim();
    const descripcion=document.getElementById("obraDescripcion").value.trim();

    if(!titulo || !imagenUrl || !descripcion){
      alert("Para crear una actualización de obra completá título, URL de foto y descripción.");
      return;
    }

    await addDoc(collection(db,"obra"),{
      titulo,
      imagenUrl,
      descripcion,
      creado:serverTimestamp()
    });

    f.reset();
  };

  onSnapshot(query(collection(db,"obra")),s=>{
    l.innerHTML="";

    s.forEach(d=>{
      const x=d.data();
      const id=d.id;

      const div=document.createElement("div");
      div.className="card";
      div.innerHTML=`
        ${x.imagenUrl?`<img class="imagen-admin" src="${x.imagenUrl}">`:""}
        <h3>${x.titulo||"Obra"}</h3>
        <p>${x.descripcion||""}</p>

        <button onclick="abrirEditorObra('${id}')">Editar</button>
        <button class="btn-danger" onclick="eliminarObra('${id}')">Eliminar</button>
      `;

      l.appendChild(div);
    });

    if(!l.innerHTML){
      l.innerHTML="<p>No hay actualizaciones de obra cargadas.</p>";
    }
  });
}

window.abrirEditorObra=async id=>{
  const snap=await getDoc(doc(db,"obra",id));
  if(!snap.exists()) return alert("No se encontró la actualización de obra.");

  const x=snap.data();

  crearModalAdmin("Editar actualización de obra", `
    <div class="form-modal-admin">
      <label>Título</label>
      <input id="edit-obra-titulo-${id}" value="${limpiarTexto(x.titulo||"")}" placeholder="Título">

      <label>URL de foto</label>
      <input id="edit-obra-imagen-${id}" value="${limpiarTexto(x.imagenUrl||"")}" placeholder="URL de foto">

      <label>Descripción</label>
      <textarea id="edit-obra-descripcion-${id}" placeholder="Descripción">${x.descripcion||""}</textarea>

      <div class="acciones-modal">
        <button onclick="guardarObra('${id}')">Guardar cambios</button>
        <button type="button" onclick="cerrarModalAdmin()">Cancelar</button>
      </div>
    </div>
  `);
};

window.guardarObra=async id=>{
  await updateDoc(doc(db,"obra",id),{
    titulo:document.getElementById("edit-obra-titulo-"+id).value.trim(),
    imagenUrl:document.getElementById("edit-obra-imagen-"+id).value.trim(),
    descripcion:document.getElementById("edit-obra-descripcion-"+id).value.trim(),
    actualizado:serverTimestamp()
  });

  alert("Actualización de obra editada.");
  cerrarModalAdmin();
};

window.eliminarObra=async id=>{
  if(confirm("¿Seguro que querés eliminar esta actualización de obra?")){
    await deleteDoc(doc(db,"obra",id));
  }
};

function transparencia(){
  if(!tienePermiso("transparencia")) return;

  const f=document.getElementById("transparenciaForm");
  const l=document.getElementById("listaTransparenciaAdmin");
  if(!f) return;

  f.onsubmit=async e=>{
    e.preventDefault();

    const titulo=document.getElementById("transTitulo").value.trim();
    const monto=Number(document.getElementById("transMonto").value||0);
    const url=document.getElementById("transUrl").value.trim();
    const descripcion=document.getElementById("transDescripcion").value.trim();

    if(!titulo || !monto || monto<=0 || !url || !descripcion){
      alert("Para crear un comprobante de transparencia completá título, monto, URL y descripción.");
      return;
    }

    await addDoc(collection(db,"transparencia"),{
      titulo,
      monto,
      url,
      descripcion,
      creado:serverTimestamp()
    });

    f.reset();
  };

  onSnapshot(query(collection(db,"transparencia")),s=>{
    l.innerHTML="";

    s.forEach(d=>{
      const x=d.data();
      const id=d.id;

      const div=document.createElement("div");
      div.className="card";
      div.innerHTML=`
        <h3>${x.titulo||"Comprobante"}</h3>
        <p><strong>Monto:</strong> ${formatoPesos.format(Number(x.monto||0))}</p>
        <p>${x.descripcion||""}</p>
        ${x.url?`<p><a href="${x.url}" target="_blank">Ver comprobante</a></p>`:""}

        <button onclick="abrirEditorTransparencia('${id}')">Editar</button>
        <button class="btn-danger" onclick="eliminarTransparencia('${id}')">Eliminar</button>
      `;

      l.appendChild(div);
    });

    if(!l.innerHTML){
      l.innerHTML="<p>No hay comprobantes cargados.</p>";
    }
  });
}

window.abrirEditorTransparencia=async id=>{
  const snap=await getDoc(doc(db,"transparencia",id));
  if(!snap.exists()) return alert("No se encontró el comprobante.");

  const x=snap.data();

  crearModalAdmin("Editar transparencia", `
    <div class="form-modal-admin">
      <label>Título</label>
      <input id="edit-trans-titulo-${id}" value="${limpiarTexto(x.titulo||"")}" placeholder="Título">

      <label>Monto</label>
      <input id="edit-trans-monto-${id}" type="number" value="${Number(x.monto||0)}" placeholder="Monto">

      <label>URL del comprobante</label>
      <input id="edit-trans-url-${id}" value="${limpiarTexto(x.url||"")}" placeholder="URL del comprobante">

      <label>Descripción</label>
      <textarea id="edit-trans-descripcion-${id}" placeholder="Descripción">${x.descripcion||""}</textarea>

      <div class="acciones-modal">
        <button onclick="guardarTransparencia('${id}')">Guardar cambios</button>
        <button type="button" onclick="cerrarModalAdmin()">Cancelar</button>
      </div>
    </div>
  `);
};

window.guardarTransparencia=async id=>{
  await updateDoc(doc(db,"transparencia",id),{
    titulo:document.getElementById("edit-trans-titulo-"+id).value.trim(),
    monto:Number(document.getElementById("edit-trans-monto-"+id).value||0),
    url:document.getElementById("edit-trans-url-"+id).value.trim(),
    descripcion:document.getElementById("edit-trans-descripcion-"+id).value.trim(),
    actualizado:serverTimestamp()
  });

  alert("Comprobante de transparencia editado.");
  cerrarModalAdmin();
};

window.eliminarTransparencia=async id=>{
  if(confirm("¿Seguro que querés eliminar este comprobante de transparencia?")){
    await deleteDoc(doc(db,"transparencia",id));
  }
};

function permisosComoTexto(permisos={}){
  const nombres={
    institucional:"Información institucional",
    objetivos:"Objetivos y donaciones",
    obra:"Actualización de obra",
    transparencia:"Transparencia",
    usuarios:"Administradores"
  };

  const activos=Object.entries(permisos)
    .filter(([k,v])=>v)
    .map(([k])=>nombres[k]||k);

  return activos.length?activos.join(", "):"Sin permisos asignados";
}

function usuarios(){
  if(!tienePermiso("usuarios")) return;

  const f=document.getElementById("usuarioForm");
  const l=document.getElementById("listaUsuarios");
  if(!f) return;

  f.onsubmit=async e=>{
    e.preventDefault();
    const email=document.getElementById("usuarioEmail").value.trim().toLowerCase();

    await setDoc(doc(db,"adminsByEmail",email),{
      nombre:document.getElementById("usuarioNombre").value.trim(),
      email,
      rol:"admin",
      activo:true,
      permisos:{
        institucional:document.getElementById("permInstitucional").checked,
        objetivos:document.getElementById("permObjetivos").checked,
        obra:document.getElementById("permObra").checked,
        transparencia:document.getElementById("permTransparencia").checked,
        usuarios:false
      },
      creado:serverTimestamp()
    });

    f.reset();
    alert("Administrador autorizado.");
  };

  onSnapshot(query(collection(db,"admins")),s=>{
    adminsCreados={};
    s.forEach(d=>{
      const x=d.data();
      if(x.email) adminsCreados[x.email.toLowerCase()]={id:d.id,...x};
    });
    renderAdmins();
  });

  onSnapshot(query(collection(db,"adminsByEmail")),s=>{
    adminsAutorizados={};
    s.forEach(d=>{
      const x=d.data();
      if(x.email) adminsAutorizados[x.email.toLowerCase()]={id:d.id,...x};
    });
    renderAdmins();
  });
}

function renderAdmins(){
  const l=document.getElementById("listaUsuarios");
  if(!l) return;

  const emails=new Set([...Object.keys(adminsAutorizados),...Object.keys(adminsCreados)]);
  l.innerHTML="";

  emails.forEach(email=>{
    const autorizado=adminsAutorizados[email];
    const creado=adminsCreados[email];
    const data=creado||autorizado;
    const esSuper=data.rol==="superadmin"||email===SUPERADMIN_EMAIL;
    const estado=data.activo!==false;
    const permisos=data.permisos||{};
    const editId="edit-admin-"+email.replaceAll("@","_").replaceAll(".","_");

    const div=document.createElement("div");
    div.className="admin-card";
    div.innerHTML=`
      <div>
        <h3>${data.nombre||"Sin nombre"}</h3>
        <p><strong>Correo:</strong> ${email}</p>
        <p><strong>Rol:</strong> ${esSuper?"Superadministrador":"Administrador"}</p>
        <p><strong>Estado:</strong> ${estado?"Activo":"Bloqueado"}</p>
        <p><strong>Cuenta:</strong> ${creado?"Creada en Authentication":"Autorizada, pendiente de crear cuenta"}</p>
        <p><strong>Permisos:</strong> ${esSuper?"Acceso total":permisosComoTexto(permisos)}</p>
      </div>
      <div class="admin-actions">
        ${!esSuper?`<button onclick="editarPermisosAdmin('${email}')">Editar permisos</button>`:""}
        ${!esSuper?`<button class="btn-danger" onclick="cambiarEstadoAdmin('${email}',${estado?"false":"true"})">${estado?"Bloquear":"Activar"}</button>`:""}
      </div>
      ${!esSuper?`
        <div id="${editId}" class="admin-edit oculto">
          <label><input type="checkbox" id="edit-${email}-institucional" ${permisos.institucional?"checked":""}> Información institucional</label>
          <label><input type="checkbox" id="edit-${email}-objetivos" ${permisos.objetivos?"checked":""}> Objetivos y donaciones</label>
          <label><input type="checkbox" id="edit-${email}-obra" ${permisos.obra?"checked":""}> Actualización de obra</label>
          <label><input type="checkbox" id="edit-${email}-transparencia" ${permisos.transparencia?"checked":""}> Transparencia</label>
          <button onclick="guardarPermisosAdmin('${email}')">Guardar permisos</button>
        </div>
      `:""}
    `;
    l.appendChild(div);
  });
}

window.editarPermisosAdmin=email=>{
  const id="edit-admin-"+email.replaceAll("@","_").replaceAll(".","_");
  document.getElementById(id).classList.toggle("oculto");
};

window.cambiarEstadoAdmin=async(email,estado)=>{
  await setDoc(doc(db,"adminsByEmail",email),{activo:estado},{merge:true});
};

window.guardarPermisosAdmin=async email=>{
  const permisos={
    institucional:document.getElementById(`edit-${email}-institucional`).checked,
    objetivos:document.getElementById(`edit-${email}-objetivos`).checked,
    obra:document.getElementById(`edit-${email}-obra`).checked,
    transparencia:document.getElementById(`edit-${email}-transparencia`).checked,
    usuarios:false
  };

  await setDoc(doc(db,"adminsByEmail",email),{permisos,actualizado:serverTimestamp()},{merge:true});

  const creado=adminsCreados[email];
  if(creado&&creado.id){
    await setDoc(doc(db,"admins",creado.id),{permisos,actualizado:serverTimestamp()},{merge:true});
  }

  alert("Permisos actualizados.");
};
