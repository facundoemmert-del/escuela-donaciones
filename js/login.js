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

function mostrar(texto) {
  mensaje.textContent = texto;
}

function leerCredenciales() {
  const email = document.getElementById("loginEmail").value.trim().toLowerCase();
  const password = document.getElementById("loginPassword").value;

  return { email, password };
}

function explicarError(error) {
  const code = error.code || "";

  const errores = {
    "auth/invalid-email": "El correo no tiene formato válido.",
    "auth/user-not-found": "No existe una cuenta con ese correo. Si sos admin autorizado, tocá “Crear cuenta autorizada”.",
    "auth/wrong-password": "La contraseña es incorrecta.",
    "auth/invalid-credential": "Correo o contraseña incorrectos, o el usuario no existe.",
    "auth/email-already-in-use": "Ese correo ya está registrado. Usá “Ingresar” o recuperá la contraseña.",
    "auth/weak-password": "La contraseña es débil. Debe tener al menos 6 caracteres.",
    "auth/network-request-failed": "Error de conexión. Revisá internet.",
    "auth/too-many-requests": "Firebase bloqueó temporalmente por muchos intentos. Esperá unos minutos.",
    "permission-denied": "Firebase no permitió leer/escribir permisos. Revisar reglas de Firestore.",
    "auth/missing-password": "Falta escribir la contraseña.",
    "auth/missing-email": "Falta escribir el correo."
  };

  return errores[code] || `Error: ${code || error.message}`;
}

async function estaAutorizado(email) {
  if (email === SUPERADMIN_EMAIL) return true;

  const invitacion = await getDoc(doc(db, "adminsByEmail", email));
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
    actualizado: serverTimestamp()
  }, { merge: true });

  return true;
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const { email, password } = leerCredenciales();

  if (!email || !password) {
    mostrar("Completá correo y contraseña.");
    return;
  }

  try {
    mostrar("Ingresando...");
    const cred = await signInWithEmailAndPassword(auth, email, password);

    const autorizado = await sincronizarAdmin(cred.user);

    if (!autorizado) {
      await signOut(auth);
      mostrar("La cuenta existe, pero no está autorizada como administrador.");
      return;
    }

    mostrar("Ingreso correcto. Redirigiendo...");
    window.location.href = "admin.html";
  } catch (error) {
    mostrar(explicarError(error));
  }
});

crearCuentaBtn.addEventListener("click", async () => {
  const { email, password } = leerCredenciales();

  if (!email || !password) {
    mostrar("Completá correo y contraseña para crear la cuenta.");
    return;
  }

  if (password.length < 6) {
    mostrar("La contraseña debe tener al menos 6 caracteres.");
    return;
  }

  try {
    mostrar("Verificando autorización...");
    const autorizado = await estaAutorizado(email);

    if (!autorizado) {
      mostrar("Ese correo todavía no fue autorizado por el superadministrador.");
      return;
    }

    mostrar("Creando cuenta...");
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await sincronizarAdmin(cred.user);

    mostrar("Cuenta creada correctamente. Redirigiendo...");
    window.location.href = "admin.html";
  } catch (error) {
    mostrar(explicarError(error));
  }
});

recuperarBtn.addEventListener("click", async () => {
  const { email } = leerCredenciales();

  if (!email) {
    mostrar("Escribí tu correo para recuperar la contraseña.");
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    mostrar("Se envió un correo de recuperación. Revisá Recibidos, Spam y Promociones.");
  } catch (error) {
    mostrar(explicarError(error));
  }
});
