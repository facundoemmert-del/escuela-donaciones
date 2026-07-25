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
let categoriasCache=[];
let impuestosCache=[];
let adminsCreados={};
let adminsAutorizados={};
let donacionesAprobadasCache=[];

const formatoPesos=new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0});

function formatearFecha(valor){
  if(!valor) return "Sin fecha";
  let fecha=null;
  if(valor.toDate) fecha=valor.toDate();
  else if(valor.seconds) fecha=new Date(valor.seconds*1000);
  else fecha=new Date(valor);
  if(isNaN(fecha.getTime())) return "Sin fecha";
  return fecha.toLocaleDateString("es-AR");
}

function renderHistorialDonacionesAdmin(){
  const hist=document.getElementById("historialDonacionesAdmin");
  const buscador=document.getElementById("buscadorHistorialDonaciones");
  if(!hist) return;

  const q=(buscador?.value||"").trim().toLowerCase();
  hist.innerHTML="";

  const filtradas=donacionesAprobadasCache.filter(x=>{
    const nombre=x.nombreCompletoDonante || `${x.nombreDonante||""} ${x.apellidoDonante||""}`.trim() || "Donante";
    const texto=`${nombre} ${x.dniDonante||""} ${x.objetivoNombre||""} ${x.numeroComprobante||""}`.toLowerCase();
    return texto.includes(q);
  });

  if(!filtradas.length){
    hist.innerHTML="<p>No hay donaciones aprobadas que coincidan con la búsqueda.</p>";
    return;
  }

  filtradas.forEach(x=>{
    const nombre=x.nombreCompletoDonante || `${x.nombreDonante||""} ${x.apellidoDonante||""}`.trim() || "Donante";
    const fecha=formatearFecha(x.aprobado || x.creado);
    hist.innerHTML += `
      <div class="historial-item">
        <strong>${nombre}</strong><br>
        DNI: ${x.dniDonante||"sin cargar"}<br>
        Donó ${formatoPesos.format(Number(x.monto||0))} para <strong>${x.objetivoNombre}</strong><br>
        Fecha: ${fecha}
        ${x.numeroComprobante?`<br>Ref.: ${x.numeroComprobante}`:""}
      </div>
    `;
  });
}

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
  categorias();
  impuestos();
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

function numeroEtapaAdmin(etapa){
  const t=String(etapa||"").toLowerCase();
  const r={"i":1,"ii":2,"iii":3,"iv":4,"v":5,"vi":6,"vii":7,"viii":8,"ix":9,"x":10};
  const m=t.match(/etapa\s+([ivx]+)/i); if(m&&r[m[1].toLowerCase()]) return r[m[1].toLowerCase()];
  const n=t.match(/etapa\s+(\d+)/i); if(n) return Number(n[1]);
  return 999;
}
function ordenarEtapasAdmin(a,b){
  const na=numeroEtapaAdmin(a), nb=numeroEtapaAdmin(b);
  return na!==nb ? na-nb : String(a).localeCompare(String(b),"es");
}
function ordenarObrasAdmin(a,b){ return (a.creado?.seconds||0)-(b.creado?.seconds||0); }

function actualizarBannerAdmin(url){
  const header=document.querySelector(".admin-header");
  if(!header) return;

  if(url){
    header.style.backgroundImage = `url("${url}")`;
    header.style.backgroundSize = "cover";
    header.style.backgroundPosition = "center";
    header.style.backgroundRepeat = "no-repeat";
  }else{
    header.style.backgroundImage = "";
  }
}

function asegurarCamposFondosEditables(){
  if(document.getElementById("loginBackgroundUrl") && document.getElementById("publicBackgroundUrl")) return;

  const banner=document.getElementById("bannerUrl");
  if(!banner) return;

  const campoBanner=banner.closest(".campo-form") || banner.parentElement;

  if(!document.getElementById("loginBackgroundUrl")){
    const campo=document.createElement("div");
    campo.className="campo-form";
    campo.innerHTML=`
      <label>URL de imagen para fondo del login</label>
      <input id="loginBackgroundUrl" placeholder="https://.../assets/fondo-login.jpg">
    `;
    campoBanner.insertAdjacentElement("afterend", campo);
  }

  if(!document.getElementById("publicBackgroundUrl")){
    const campo=document.createElement("div");
    campo.className="campo-form";
    campo.innerHTML=`
      <label>URL de imagen para fondo de la página pública</label>
      <input id="publicBackgroundUrl" placeholder="https://.../assets/fondo-publico.jpg">
    `;
    const login=document.getElementById("loginBackgroundUrl");
    (login?.closest(".campo-form") || campoBanner).insertAdjacentElement("afterend", campo);
  }
}

function config(){
  if(!tienePermiso("institucional")) return;

  const ref=doc(db,"configuracion","sitio");
  const f=document.getElementById("configForm");
  if(!f) return;

  asegurarCamposFondosEditables();

  const bannerInput=document.getElementById("bannerUrl");
  if(bannerInput){
    bannerInput.addEventListener("input",()=>{
      actualizarBannerAdmin(bannerInput.value.trim());
    });
  }

  onSnapshot(ref,s=>{
    if(!s.exists()) return;
    const d=s.data();

    document.getElementById("nombreEscuela").value=d.nombreEscuela||"";
    document.getElementById("subtituloEscuela").value=d.subtitulo||"";
    document.getElementById("logoUrl").value=d.logoUrl||"";
    if(document.getElementById("bannerUrl")) document.getElementById("bannerUrl").value=d.bannerUrl||"";
    if(document.getElementById("loginBackgroundUrl")) document.getElementById("loginBackgroundUrl").value=d.loginBackgroundUrl||"";
    if(document.getElementById("publicBackgroundUrl")) document.getElementById("publicBackgroundUrl").value=d.publicBackgroundUrl||"";
    actualizarBannerAdmin(d.bannerUrl || "");

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
      bannerUrl:document.getElementById("bannerUrl")?.value.trim() || "",
      loginBackgroundUrl:document.getElementById("loginBackgroundUrl")?.value.trim() || "",
      publicBackgroundUrl:document.getElementById("publicBackgroundUrl")?.value.trim() || "",
      alias:document.getElementById("alias").value.trim(),
      cbu:document.getElementById("cbu").value.trim(),
      titularCuenta:document.getElementById("titularCuenta").value.trim(),
      infoInstitucional:document.getElementById("infoInstitucional").value.trim(),
      actualizado:serverTimestamp()
    },{merge:true});
    alert("Información institucional guardada.");
  };
}

function actualizarSelectCategorias(){
  const select=document.getElementById("categoriaObjetivo");
  if(!select) return;

  const valorActual=select.value;
  select.innerHTML='<option value="">Seleccionar categoría</option>';

  categoriasCache
    .slice()
    .sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||"","es"))
    .forEach(c=>{
      const op=document.createElement("option");
      op.value=c.id;
      op.textContent=c.nombre||"Sin nombre";
      op.dataset.nombre=c.nombre||"";
      select.appendChild(op);
    });

  if([...select.options].some(o=>o.value===valorActual)) select.value=valorActual;
}

function renderCategorias(){
  const lista=document.getElementById("listaCategorias");
  const bus=document.getElementById("buscadorCategorias");
  if(!lista) return;

  const q=(bus?.value||"").trim().toLowerCase();
  lista.innerHTML="";

  const filtradas=categoriasCache
    .filter(c=>`${c.nombre||""} ${c.descripcion||""}`.toLowerCase().includes(q))
    .sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||"","es"));

  if(!filtradas.length){
    lista.innerHTML='<div class="categoria-vacia">No hay categorías que coincidan con la búsqueda.</div>';
    return;
  }

  filtradas.forEach(c=>{
    const card=document.createElement("article");
    card.className="categoria-card-admin";
    card.innerHTML=`
      <div class="categoria-datos-admin">
        <h3>${c.nombre||"Sin nombre"}</h3>
        <p>${c.descripcion||"Sin descripción"}</p>
      </div>
      <div class="categoria-acciones-admin">
        <button onclick="abrirEditorCategoria('${c.id}')">Editar</button>
        <button class="btn-danger" onclick="eliminarCategoria('${c.id}')">Eliminar</button>
      </div>
    `;
    lista.appendChild(card);
  });
}

function categorias(){
  if(!tienePermiso("objetivos")) return;

  const form=document.getElementById("categoriaForm");
  const buscador=document.getElementById("buscadorCategorias");
  if(!form) return;

  form.onsubmit=async e=>{
    e.preventDefault();

    const nombre=document.getElementById("categoriaNombre").value.trim();
    const descripcion=document.getElementById("categoriaDescripcion").value.trim();
  
    if(!nombre || !descripcion){
      alert("Completá el nombre y la descripción de la categoría.");
      return;
    }

    const repetida=categoriasCache.some(c=>(c.nombre||"").trim().toLowerCase()===nombre.toLowerCase());
    if(repetida){
      alert("Ya existe una categoría con ese nombre.");
      return;
    }

    await addDoc(collection(db,"categorias"),{
      nombre,
      descripcion,
      creado:serverTimestamp()
    });

    form.reset();
  };

  onSnapshot(query(collection(db,"categorias")),snap=>{
    categoriasCache=[];
    snap.forEach(d=>categoriasCache.push({id:d.id,...d.data()}));
    renderCategorias();
    actualizarSelectCategorias();
  });

  if(buscador) buscador.oninput=renderCategorias;
}

window.abrirEditorCategoria=id=>{
  const c=categoriasCache.find(x=>x.id===id);
  if(!c) return alert("No se encontró la categoría.");

  crearModalAdmin("Editar categoría", `
    <div class="form-modal-admin">
      <label>Nombre</label>
      <input id="edit-categoria-nombre-${id}" value="${limpiarTexto(c.nombre)}" placeholder="Nombre">

      <label>Descripción</label>
      <input id="edit-categoria-descripcion-${id}" value="${limpiarTexto(c.descripcion)}" placeholder="Descripción">

      <div class="acciones-modal">
        <button onclick="guardarCategoria('${id}')">Guardar cambios</button>
        <button type="button" onclick="cerrarModalAdmin()">Cancelar</button>
      </div>
    </div>
  `);
};

window.guardarCategoria=async id=>{
  const nombre=document.getElementById("edit-categoria-nombre-"+id).value.trim();
  const descripcion=document.getElementById("edit-categoria-descripcion-"+id).value.trim();

  if(!nombre || !descripcion){
    alert("El nombre y la descripción son obligatorios.");
    return;
  }

  const repetida=categoriasCache.some(c=>c.id!==id && (c.nombre||"").trim().toLowerCase()===nombre.toLowerCase());
  if(repetida){
    alert("Ya existe otra categoría con ese nombre.");
    return;
  }

  await updateDoc(doc(db,"categorias",id),{
    nombre,
    descripcion,
    actualizado:serverTimestamp()
  });

  /* Actualiza también el nombre guardado en objetivos de esa categoría */
  const relacionados=objetivosCache.filter(o=>o.categoriaId===id);
  for(const objetivo of relacionados){
    await updateDoc(doc(db,"objetivos",objetivo.id),{
      categoriaNombre:nombre,
    });
  }

  cerrarModalAdmin();
};

window.eliminarCategoria=async id=>{
  const c=categoriasCache.find(x=>x.id===id);
  if(!c) return;

  const usados=objetivosCache.filter(o=>o.categoriaId===id);
  if(usados.length){
    alert(`No se puede eliminar "${c.nombre}" porque tiene ${usados.length} objetivo(s) asociado(s). Primero cambiá esos objetivos de categoría.`);
    return;
  }

  if(confirm(`¿Seguro que querés eliminar la categoría "${c.nombre}"?`)){
    await deleteDoc(doc(db,"categorias",id));
  }
};


function numeroSeguro(valor){
  const n=Number(String(valor??"").replace(",","."));
  return Number.isFinite(n)?n:0;
}

function calcularTotales(cantidad,precioUnitario,impuestos=[]){
  const subtotal=Math.max(0,numeroSeguro(cantidad))*Math.max(0,numeroSeguro(precioUnitario));
  const detalle=(impuestos||[]).map(i=>{
    const porcentaje=Math.max(0,numeroSeguro(i.porcentaje));
    return {id:i.id,nombre:i.nombre||"Impuesto",porcentaje,monto:subtotal*porcentaje/100};
  });
  const montoImpuestos=detalle.reduce((a,i)=>a+i.monto,0);
  return {subtotal,detalle,montoImpuestos,precio:subtotal+montoImpuestos};
}

function seleccionadosDe(contenedorId){
  const cont=document.getElementById(contenedorId);
  if(!cont) return [];
  return [...cont.querySelectorAll('input[data-impuesto-id]:checked')].map(ch=>{
    const i=impuestosCache.find(x=>x.id===ch.dataset.impuestoId);
    return i?{id:i.id,nombre:i.nombre||"Impuesto",porcentaje:numeroSeguro(i.porcentaje)}:null;
  }).filter(Boolean);
}

function renderSelectorImpuestos(contenedorId,seleccionados=[]){
  const cont=document.getElementById(contenedorId);
  if(!cont) return;
  const ids=new Set((seleccionados||[]).map(i=>typeof i==="string"?i:i.id));
  if(!impuestosCache.length){
    cont.innerHTML='<p class="texto-suave">Todavía no hay impuestos creados. El producto se calculará sin impuestos.</p>';
    return;
  }
  cont.innerHTML=impuestosCache.slice().sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||"","es")).map(i=>`
    <label class="impuesto-check">
      <input type="checkbox" data-impuesto-id="${i.id}" ${ids.has(i.id)?"checked":""}>
      <span><strong>${limpiarTexto(i.nombre||"Impuesto")}</strong><small>${numeroSeguro(i.porcentaje)}%</small></span>
    </label>`).join("");
}

function recalcularObjetivoNuevo(){
  const c=numeroSeguro(document.getElementById("cantidadNecesaria")?.value||1);
  const u=numeroSeguro(document.getElementById("precioUnitario")?.value||0);
  const t=calcularTotales(c,u,seleccionadosDe("impuestosAplicables"));
  const subtotal=document.getElementById("subtotalObjetivo");
  const impuestos=document.getElementById("montoImpuestosObjetivo");
  const precio=document.getElementById("precio");
  if(subtotal) subtotal.value=t.subtotal.toFixed(2);
  if(impuestos) impuestos.value=t.montoImpuestos.toFixed(2);
  if(precio) precio.value=t.precio.toFixed(2);
}

function renderImpuestos(){
  const lista=document.getElementById("listaImpuestos");
  if(!lista) return;
  if(!impuestosCache.length){
    lista.innerHTML='<p class="texto-suave">No hay impuestos cargados.</p>';
  }else{
    lista.innerHTML=impuestosCache.slice().sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||"","es")).map(i=>`
      <div class="impuesto-item-admin">
        <div><strong>${limpiarTexto(i.nombre||"Impuesto")}</strong><span>${numeroSeguro(i.porcentaje)}%</span></div>
        <div class="impuesto-acciones">
          <button type="button" data-tax-edit="${i.id}">Editar</button>
          <button type="button" class="btn-danger" data-tax-delete="${i.id}">Eliminar</button>
        </div>
      </div>`).join("");
  }
  renderSelectorImpuestos("impuestosAplicables");
  recalcularObjetivoNuevo();
}

function impuestos(){
  if(!tienePermiso("objetivos")) return;
  const form=document.getElementById("impuestoForm");
  const btn=document.getElementById("agregarImpuestoBtn");
  const estado=document.getElementById("estadoImpuesto");
  const guardar=async()=>{
    const nombre=document.getElementById("impuestoNombre")?.value.trim()||"";
    const porcentaje=numeroSeguro(document.getElementById("impuestoPorcentaje")?.value);
    if(!nombre) return alert("Ingresá el nombre del impuesto.");
    if(porcentaje<=0) return alert("El porcentaje debe ser mayor a 0.");
    try{
      btn.disabled=true; btn.textContent="Guardando...";
      await addDoc(collection(db,"impuestos"),{nombre,porcentaje,creado:serverTimestamp()});
      form.reset(); if(estado) estado.textContent=`Impuesto "${nombre}" agregado correctamente.`;
    }catch(e){console.error(e); alert(`No se pudo crear el impuesto${e.code?` (${e.code})`:""}.`)}
    finally{btn.disabled=false;btn.textContent="Agregar impuesto";}
  };
  btn?.addEventListener("click",guardar);
  form?.addEventListener("submit",e=>{e.preventDefault();guardar();});
  document.getElementById("listaImpuestos")?.addEventListener("click",async e=>{
    const edit=e.target.closest("[data-tax-edit]");
    const del=e.target.closest("[data-tax-delete]");
    if(edit){
      const i=impuestosCache.find(x=>x.id===edit.dataset.taxEdit); if(!i)return;
      const nombre=prompt("Nombre del impuesto:",i.nombre||""); if(nombre===null)return;
      const porc=prompt("Porcentaje:",String(numeroSeguro(i.porcentaje))); if(porc===null)return;
      const p=numeroSeguro(porc); if(!nombre.trim()||p<=0)return alert("Datos inválidos.");
      await updateDoc(doc(db,"impuestos",i.id),{nombre:nombre.trim(),porcentaje:p,actualizado:serverTimestamp()});
    }
    if(del){
      const i=impuestosCache.find(x=>x.id===del.dataset.taxDelete); if(!i)return;
      const usados=objetivosCache.filter(o=>(o.impuestos||[]).some(x=>(typeof x==="string"?x:x.id)===i.id));
      if(usados.length)return alert(`No se puede eliminar porque está aplicado a ${usados.length} objetivo(s). Primero quitá el impuesto de esos objetivos.`);
      if(confirm(`¿Eliminar el impuesto "${i.nombre}"?`)) await deleteDoc(doc(db,"impuestos",i.id));
    }
  });
  onSnapshot(query(collection(db,"impuestos")),snap=>{
    impuestosCache=[]; snap.forEach(d=>impuestosCache.push({id:d.id,...d.data()})); renderImpuestos(); renderObjetivos();
  },e=>{console.error("Impuestos:",e);if(estado)estado.textContent=`No se pudieron cargar los impuestos (${e.code||"error"}).`;});
}

function objetivos(){
  if(!tienePermiso("objetivos")) return;
  const f=document.getElementById("objetivoForm");
  const bus=document.getElementById("buscadorObjetivos");
  if(!f) return;

  document.getElementById("cantidadNecesaria")?.addEventListener("input",recalcularObjetivoNuevo);
  document.getElementById("precioUnitario")?.addEventListener("input",recalcularObjetivoNuevo);
  document.getElementById("impuestosAplicables")?.addEventListener("change",recalcularObjetivoNuevo);
  recalcularObjetivoNuevo();

  f.onsubmit=async e=>{
    e.preventDefault();
    const cantidadNecesaria=Math.max(1,numeroSeguro(document.getElementById("cantidadNecesaria").value||1));
    const precioUnitario=Math.max(0,numeroSeguro(document.getElementById("precioUnitario").value||0));
    const impuestosAplicados=seleccionadosDe("impuestosAplicables");
    const totales=calcularTotales(cantidadNecesaria,precioUnitario,impuestosAplicados);
    const categoriaId=document.getElementById("categoriaObjetivo")?.value||"";
    const categoria=categoriasCache.find(c=>c.id===categoriaId);
    if(!categoria) return alert("Seleccioná una categoría para el objetivo.");
    if(precioUnitario<=0) return alert("El precio unitario debe ser mayor a 0.");
    await addDoc(collection(db,"objetivos"),{
      nombre:document.getElementById("nombre").value.trim(),descripcion:document.getElementById("descripcion").value.trim(),
      categoriaId,categoriaNombre:categoria.nombre||"",cantidadNecesaria,precioUnitario,
      subtotal:totales.subtotal,impuestos:impuestosAplicados,montoImpuestos:totales.montoImpuestos,precio:totales.precio,
      recaudado:0,imagenUrl:document.getElementById("imagenUrl").value.trim(),urgente:document.getElementById("urgente").checked,creado:serverTimestamp()
    });
    f.reset();document.getElementById("cantidadNecesaria").value=1;renderSelectorImpuestos("impuestosAplicables");recalcularObjetivoNuevo();
  };
  onSnapshot(query(collection(db,"objetivos")),s=>{objetivosCache=[];s.forEach(d=>objetivosCache.push({id:d.id,...d.data()}));renderObjetivos();});
  if(bus)bus.oninput=renderObjetivos;
}

function obtenerYoutubeId(url){
  if(!url) return "";
  const patrones=[
    /youtu\.be\/([^?&]+)/,
    /youtube\.com\/watch\?v=([^?&]+)/,
    /youtube\.com\/embed\/([^?&]+)/,
    /youtube\.com\/shorts\/([^?&]+)/
  ];
  for(const p of patrones){
    const m=url.match(p);
    if(m&&m[1]) return m[1];
  }
  return "";
}

function renderMediaAdmin(url,tipo,titulo=""){
  if(!url) return "";
  const tipoReal=tipo||"imagen";
  if(tipoReal==="youtube"){
    const id=obtenerYoutubeId(url);
    if(!id) return `<p><a href="${url}" target="_blank">Ver video</a></p>`;
    return `<div class="media-admin-preview"><iframe src="https://www.youtube.com/embed/${id}" title="${titulo}" allowfullscreen></iframe></div>`;
  }
  if(tipoReal==="video"){
    return `<video class="imagen-admin" src="${url}" controls></video>`;
  }
  return `<img class="imagen-admin" src="${url}" alt="${titulo}">`;
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
  const l=document.getElementById("listaObjetivos");const bus=document.getElementById("buscadorObjetivos");if(!l)return;
  const q=(bus?.value||"").toLowerCase();l.innerHTML="";
  objetivosCache.filter(o=>`${o.nombre||""} ${o.descripcion||""} ${o.categoriaNombre||""}`.toLowerCase().includes(q)).forEach(o=>{
    const cantidad=Math.max(1,numeroSeguro(o.cantidadNecesaria||1));
    const unitario=numeroSeguro(o.precioUnitario||o.precio||0);
    const impuestos=Array.isArray(o.impuestos)?o.impuestos:[];
    const calc=calcularTotales(cantidad,unitario,impuestos);
    const precio=numeroSeguro(o.precio||calc.precio);const rec=Math.min(numeroSeguro(o.recaudado),precio);const falt=Math.max(0,precio-rec);const pct=precio?Math.min(100,Math.round(rec/precio*100)):0;
    const div=document.createElement("div");div.className="card";div.innerHTML=`
      ${o.imagenUrl?`<img class="imagen-admin" src="${limpiarTexto(o.imagenUrl)}" alt="${limpiarTexto(o.nombre)}">`:""}
      <div class="objetivo-categoria-admin">${o.categoriaNombre||"Sin categoría"}</div><h3>${o.nombre||"Sin nombre"}</h3><p>${o.descripcion||""}</p>
      <div class="barra"><div class="progreso" style="width:${pct}%"></div></div>
      <p><strong>Cantidad:</strong> ${cantidad}</p><p><strong>Precio unitario sin impuestos:</strong> ${formatoPesos.format(unitario)}</p>
      <p><strong>Subtotal:</strong> ${formatoPesos.format(calc.subtotal)}</p>
      ${impuestos.length?`<div class="impuestos-resumen-card"><strong>Impuestos:</strong>${impuestos.map(i=>`<span>${limpiarTexto(i.nombre)} ${numeroSeguro(i.porcentaje)}%: ${formatoPesos.format(calc.subtotal*numeroSeguro(i.porcentaje)/100)}</span>`).join("")}</div>`:'<p><strong>Impuestos:</strong> No aplica</p>'}
      <p><strong>Total impuestos:</strong> ${formatoPesos.format(calc.montoImpuestos)}</p><p><strong>Precio total:</strong> ${formatoPesos.format(precio)}</p>
      <p><strong>Recaudado:</strong> ${formatoPesos.format(rec)}</p><p><strong>Faltante:</strong> ${formatoPesos.format(falt)}</p>
      <button onclick="abrirEditorObjetivo('${o.id}')">Editar datos</button><button class="btn-danger" onclick="eliminarObjetivo('${o.id}')">Eliminar</button>`;l.appendChild(div);
  });
}

window.abrirEditorObjetivo=id=>{
  const o=objetivosCache.find(x=>x.id===id);if(!o)return;
  const cantidad=Math.max(1,numeroSeguro(o.cantidadNecesaria||1));const unitario=numeroSeguro(o.precioUnitario||o.precio||0);const impuestos=Array.isArray(o.impuestos)?o.impuestos:[];const calc=calcularTotales(cantidad,unitario,impuestos);const precio=numeroSeguro(o.precio||calc.precio);const rec=numeroSeguro(o.recaudado);
  crearModalAdmin("Editar objetivo",`<div class="form-modal-admin">
    <label>Nombre</label><input id="edit-nombre-${id}" value="${limpiarTexto(o.nombre)}">
    <label>Descripción</label><input id="edit-descripcion-${id}" value="${limpiarTexto(o.descripcion)}">
    <label>Categoría</label><select id="edit-categoria-${id}"><option value="">Seleccionar categoría</option>${categoriasCache.map(c=>`<option value="${c.id}" ${c.id===o.categoriaId?"selected":""}>${limpiarTexto(c.nombre)}</option>`).join("")}</select>
    <label>Cantidad necesaria</label><input id="edit-cantidad-${id}" type="number" min="1" step="1" value="${cantidad}">
    <label>Precio unitario sin impuestos</label><input id="edit-unitario-${id}" type="number" min="0" step="0.01" value="${unitario}">
    <div class="campo-completo impuestos-aplicables-caja"><label>Impuestos aplicables</label><div id="edit-impuestos-${id}" class="impuestos-checkbox-grid"></div></div>
    <label>Subtotal</label><input id="edit-subtotal-${id}" readonly>
    <label>Total impuestos</label><input id="edit-monto-impuestos-${id}" readonly>
    <label>Precio total</label><input id="edit-precio-${id}" readonly>
    <label>URL de imagen</label><input id="edit-imagen-${id}" value="${limpiarTexto(o.imagenUrl)}">
    <label class="check-admin"><input id="edit-urgente-${id}" type="checkbox" ${o.urgente?"checked":""}> Marcar como urgente</label>
    <div class="campo-completo"><p><strong>Recaudado:</strong> ${formatoPesos.format(rec)} — no se edita manualmente.</p></div>
    <div class="acciones-modal"><button onclick="guardarObjetivo('${id}')">Guardar cambios</button><button type="button" onclick="cerrarModalAdmin()">Cancelar</button></div></div>`);
  renderSelectorImpuestos(`edit-impuestos-${id}`,impuestos);
  const recalc=()=>{const t=calcularTotales(numeroSeguro(document.getElementById(`edit-cantidad-${id}`).value),numeroSeguro(document.getElementById(`edit-unitario-${id}`).value),seleccionadosDe(`edit-impuestos-${id}`));document.getElementById(`edit-subtotal-${id}`).value=t.subtotal.toFixed(2);document.getElementById(`edit-monto-impuestos-${id}`).value=t.montoImpuestos.toFixed(2);document.getElementById(`edit-precio-${id}`).value=t.precio.toFixed(2);};
  document.getElementById(`edit-cantidad-${id}`).addEventListener("input",recalc);document.getElementById(`edit-unitario-${id}`).addEventListener("input",recalc);document.getElementById(`edit-impuestos-${id}`).addEventListener("change",recalc);recalc();
};

window.guardarObjetivo=async id=>{
  const o=objetivosCache.find(x=>x.id===id);const cantidad=Math.max(1,numeroSeguro(document.getElementById(`edit-cantidad-${id}`).value));const unitario=numeroSeguro(document.getElementById(`edit-unitario-${id}`).value);const impuestos=seleccionadosDe(`edit-impuestos-${id}`);const t=calcularTotales(cantidad,unitario,impuestos);const rec=numeroSeguro(o?.recaudado);const categoriaId=document.getElementById(`edit-categoria-${id}`).value;const categoria=categoriasCache.find(c=>c.id===categoriaId);
  if(!categoria)return alert("Seleccioná una categoría.");if(unitario<=0)return alert("El precio unitario debe ser mayor a 0.");if(t.precio<rec)return alert("El total no puede ser menor a lo ya recaudado.");
  await updateDoc(doc(db,"objetivos",id),{nombre:document.getElementById(`edit-nombre-${id}`).value.trim(),descripcion:document.getElementById(`edit-descripcion-${id}`).value.trim(),categoriaId,categoriaNombre:categoria.nombre||"",cantidadNecesaria:cantidad,precioUnitario:unitario,subtotal:t.subtotal,impuestos,montoImpuestos:t.montoImpuestos,precio:t.precio,imagenUrl:document.getElementById(`edit-imagen-${id}`).value.trim(),urgente:document.getElementById(`edit-urgente-${id}`).checked,actualizado:serverTimestamp()});cerrarModalAdmin();
};
window.eliminarObjetivo=async id=>{if(confirm("¿Eliminar objetivo?"))await deleteDoc(doc(db,"objetivos",id));};

function donaciones(){
  if(!tienePermiso("objetivos")) return;

  const pendientes=document.getElementById("listaDonacionesPendientes");
  const hist=document.getElementById("historialDonacionesAdmin");
  const buscador=document.getElementById("buscadorHistorialDonaciones");
  if(!pendientes) return;

  if(buscador){
    buscador.addEventListener("input", renderHistorialDonacionesAdmin);
  }

  onSnapshot(query(collection(db,"donaciones")),s=>{
    let ap=0;
    let pe=0;
    const donantes=new Set();

    pendientes.innerHTML="";
    donacionesAprobadasCache=[];

    s.forEach(d=>{
      const x=d.data();
      const nombre=x.nombreCompletoDonante || `${x.nombreDonante||""} ${x.apellidoDonante||""}`.trim() || "Donante";

      if(x.estado==="aprobada"){
        ap++;
        donantes.add((x.dniDonante||nombre).trim().toLowerCase());
        donacionesAprobadasCache.push({id:d.id,...x});
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

    donacionesAprobadasCache.sort((a,b)=>{
      const fa=(a.aprobado?.seconds || a.creado?.seconds || 0);
      const fb=(b.aprobado?.seconds || b.creado?.seconds || 0);
      return fb-fa;
    });

    document.getElementById("adminDonantes").textContent=donantes.size;
    document.getElementById("adminAprobadas").textContent=ap;
    document.getElementById("adminPendientes").textContent=pe;

    if(!pe) pendientes.innerHTML="<p>No hay donaciones pendientes.</p>";
    renderHistorialDonacionesAdmin();
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

window.desplegarEtapaObraAdmin = function(etapaKey){
  document.querySelectorAll(`[data-admin-etapa-grupo="${etapaKey}"]`).forEach(el => {
    el.classList.remove("oculto-etapa-obra-admin");
  });
  const btn = document.querySelector(`[data-admin-btn-etapa="${etapaKey}"]`);
  if(btn) btn.remove();
};

function obra(){
  if(!tienePermiso("obra")) return;
  const f=document.getElementById("obraForm");
  const l=document.getElementById("listaObra");
  if(!f) return;

  f.onsubmit=async e=>{
    e.preventDefault();
    const titulo=document.getElementById("obraTitulo").value.trim();
    const etapa=document.getElementById("obraEtapa").value.trim();
    const tipoMedia=document.getElementById("obraTipoMedia")?.value || "imagen";
    const mediaUrl=document.getElementById("obraImagenUrl").value.trim();
    const descripcion=document.getElementById("obraDescripcion").value.trim();

    if(!titulo || !etapa || !mediaUrl || !descripcion){
      alert("Para crear una actualización de obra completá título, etapa, URL de imagen/video y descripción.");
      return;
    }

    await addDoc(collection(db,"obra"),{titulo,etapa,tipoMedia,mediaUrl,imagenUrl:mediaUrl,descripcion,creado:serverTimestamp()});
    f.reset();
  };

  onSnapshot(query(collection(db,"obra")),snap=>{
    l.innerHTML="";
    const porEtapa={};

    snap.forEach(d=>{
      const x=d.data();
      const etapa=x.etapa||"Avances generales";
      if(!porEtapa[etapa]) porEtapa[etapa]=[];
      porEtapa[etapa].push({id:d.id,...x});
    });

    const etapas=Object.keys(porEtapa).sort(ordenarEtapasAdmin);
    if(!etapas.length){
      l.innerHTML="<p>No hay actualizaciones de obra cargadas.</p>";
      return;
    }

    etapas.forEach((etapa, etapaIndex)=>{
      porEtapa[etapa].sort(ordenarObrasAdmin);

      const etapaKey=`admin-etapa-${etapaIndex}`;
      const bloque=document.createElement("section");
      bloque.className="bloque-etapa-obra admin-etapa-obra";
      bloque.innerHTML=`
        <div class="etapa-obra-header"><span>${etapa}</span></div>
        <div class="galeria-etapa admin-galeria-etapa"></div>
      `;

      const galeria=bloque.querySelector(".admin-galeria-etapa");

      porEtapa[etapa].forEach((x, indice)=>{
        const url=x.mediaUrl || x.imagenUrl || "";
        const tipo=x.tipoMedia || "imagen";
        const ocultar=indice>=4;

        const div=document.createElement("article");
        div.className=`obra-card-pro admin-obra-mini-card ${ocultar ? "oculto-etapa-obra-admin" : ""}`;
        div.setAttribute("data-admin-etapa-grupo", etapaKey);
        div.innerHTML=`
          <div class="obra-imagen-wrap">${renderMediaAdmin(url,tipo,x.titulo||"Obra")}</div>
          <div class="obra-card-info">
            <h4>${x.titulo||"Obra"}</h4>
            <p>${x.descripcion||""}</p>
            <div class="admin-actions">
              <button onclick="abrirEditorObra('${x.id}')">Editar</button>
              <button class="btn-danger" onclick="eliminarObra('${x.id}')">Eliminar</button>
            </div>
          </div>
        `;
        galeria.appendChild(div);
      });

      if(porEtapa[etapa].length>4){
        const restantes=porEtapa[etapa].length-4;
        const preview=porEtapa[etapa][4];
        const urlPreview=preview.mediaUrl || preview.imagenUrl || "";

        const mas=document.createElement("button");
        mas.type="button";
        mas.className="btn-mas-etapa-admin";
        mas.setAttribute("data-admin-btn-etapa", etapaKey);
        if(urlPreview){
          mas.style.backgroundImage=`url('${urlPreview}')`;
          mas.style.backgroundSize="cover";
          mas.style.backgroundPosition="center";
        }
        mas.innerHTML=`
          <div class="overlay-mas-etapa-admin">
            <span class="mas-numero-admin">+${restantes}</span>
            <span class="mas-texto-admin">Ver más</span>
          </div>
        `;
        mas.addEventListener("click",()=>desplegarEtapaObraAdmin(etapaKey));
        galeria.appendChild(mas);
      }

      l.appendChild(bloque);
    });
  });
}

window.abrirEditorObra=async id=>{
  const snap=await getDoc(doc(db,"obra",id));
  if(!snap.exists()) return alert("No se encontró la actualización de obra.");

  const x=snap.data();
  const tipo=x.tipoMedia || "imagen";
  const url=x.mediaUrl || x.imagenUrl || "";

  crearModalAdmin("Editar actualización de obra", `
    <div class="form-modal-admin">
      <label>Título</label>
      <input id="edit-obra-titulo-${id}" value="${limpiarTexto(x.titulo||"")}" placeholder="Título">

      <label>Etapa</label>
      <input id="edit-obra-etapa-${id}" value="${limpiarTexto(x.etapa||"")}" placeholder="Etapa de obra">

      <label>Tipo de contenido</label>
      <select id="edit-obra-tipo-${id}">
        <option value="imagen" ${tipo==="imagen"?"selected":""}>Imagen</option>
        <option value="youtube" ${tipo==="youtube"?"selected":""}>Video de YouTube</option>
        <option value="video" ${tipo==="video"?"selected":""}>Video directo MP4</option>
      </select>

      <label>URL de imagen o video</label>
      <input id="edit-obra-imagen-${id}" value="${limpiarTexto(url)}" placeholder="URL de imagen o video">

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
  const tipoMedia=document.getElementById("edit-obra-tipo-"+id).value;
  const mediaUrl=document.getElementById("edit-obra-imagen-"+id).value.trim();

  await updateDoc(doc(db,"obra",id),{
    titulo:document.getElementById("edit-obra-titulo-"+id).value.trim(),
    etapa:document.getElementById("edit-obra-etapa-"+id).value.trim(),
    tipoMedia,
    mediaUrl,
    imagenUrl:mediaUrl,
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
