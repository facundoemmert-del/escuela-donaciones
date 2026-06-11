import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const SUPERADMIN_EMAIL = "facundoemmert@gmail.com";
const SUPERADMIN_UID = "IArWgSKZF4a8eu0j3eoWS4el2P02";

const loginForm = document.getElementById("loginForm");
const crearCuentaBtn = document.getElementById("crearCuentaBtn");
const recuperarBtn = document.getElementById("recuperarBtn");
const mensaje = document.getElementById("loginMensaje");

async function estaAutorizado(email) {
  const emailMin = email.toLowerCase();

  if (emailMin === SUPERADMIN_EMAIL) return true;

  const invitacion = await getDoc(doc(db, "adminsByEmail", emailMin));
  return invitacion.exists() && invitacion.data().activo === true;
}

async function sincronizarAdmin(user) {
  const email = user.email.toLowerCase();

  if (email === SUPERADMIN_EMAIL || user.uid === SUPERADMIN_UID) {
    await setDoc(doc(db, "admins", user.uid), {
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
      },
      actualizado: serverTimestamp()
    }, { merge: true });
    return true;
  }

  const invitacionRef = doc(db, "adminsByEmail", email);
  const invitacionSnap = await getDoc(invitacionRef);

  if (!invitacionSnap.exists() || invitacionSnap.data().activo !== true) {
    return false;
  }

  const invitacion = invitacionSnap.data();

  await setDoc(doc(db, "admins", user.uid), {
    uid: user.uid,
    nombre: invitacion.nombre || email,
    email,
    rol: "admin",
    activo: true,
    permisos: invitacion.permisos || {},
    creadoDesdeInvitacion: true,
    actualizado: serverTimestamp()
  }, { merge: true });

  return true;
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("loginEmail").value.trim().toLowerCase();
  const password = document.getElementById("loginPassword").value;

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const autorizado = await sincronizarAdmin(cred.user);

    if (!autorizado) {
      await signOut(auth);
      mensaje.textContent = "Tu correo no está autorizado como administrador.";
      return;
    }

    window.location.href = "admin.html";
  } catch (error) {
    mensaje.textContent = "No se pudo ingresar. Revisá correo y contraseña.";
  }
});

crearCuentaBtn.addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value.trim().toLowerCase();
  const password = document.getElementById("loginPassword").value;

  if (!email || !password) {
    mensaje.textContent = "Completá correo y contraseña para crear la cuenta.";
    return;
  }

  try {
    const autorizado = await estaAutorizado(email);

    if (!autorizado) {
      mensaje.textContent = "Ese correo todavía no fue autorizado por el superadministrador.";
      return;
    }

    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await sincronizarAdmin(cred.user);

    mensaje.textContent = "Cuenta creada. Ingresando...";
    window.location.href = "admin.html";
  } catch (error) {
    mensaje.textContent = "No se pudo crear la cuenta. Tal vez ya existe o la contraseña es débil.";
  }
});

recuperarBtn.addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value.trim().toLowerCase();

  if (!email) {
    mensaje.textContent = "Escribí tu correo para recuperar la contraseña.";
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    mensaje.textContent = "Se envió un correo de recuperación.";
  } catch (error) {
    mensaje.textContent = "No se pudo enviar el correo de recuperación.";
  }
});
