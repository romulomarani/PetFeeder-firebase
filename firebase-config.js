/**
 * PetFeeder — firebase-config.js
 * Configuração do Firebase
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth }        from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase }    from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey:            "AIzaSyBvAaOiZ_xZSkuk1iJYoKhtZ7uHKwftryc",
  authDomain:        "petfeeder-tcc.firebaseapp.com",
  databaseURL:       "https://petfeeder-tcc-default-rtdb.firebaseio.com",
  projectId:         "petfeeder-tcc",
  storageBucket:     "petfeeder-tcc.firebasestorage.app",
  messagingSenderId: "164636422938",
  appId:             "1:164636422938:web:ed7f6aa7b61e77bba572a3",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getDatabase(app);
