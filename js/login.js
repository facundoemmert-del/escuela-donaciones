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
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const SUPERADMIN_EMAIL = "facundoemmert@gmail.com";

const loginForm = document.getElementById("loginForm");
const crearCuentaBtn = document.getElementById("crearCuentaBtn");
const recuperarBtn = document.getElementById("recuperarBtn");
const mensaje = document.getElementById("loginMensaje");

function idEmail(email) {
  return email.toLowerCase().replace(/[.#$/\[\]]/g, "_");
}

async function estaAutorizado(email) {
  const emailMin = email.toLowerCase();

  if (emailMin === SUPERADMIN_EMAIL) return true;

  const ref = doc(db, "usuarios", idEmail(emailMin));
  const snap = await getDoc(ref);

  return snap.exists() && snap.data().activo === true;
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("loginEmail").value.trim().toLowerCase();
  const password = document.getElementById("loginPassword").value;

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);

    const autorizado = await estaAutorizado(cred.user.email);

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

    await createUserWithEmailAndPassword(auth, email, password);
    mensaje.textContent = "Cuenta creada. Ya podés ingresar al panel.";
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
