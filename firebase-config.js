/**
 * PetFeeder — firebase-config.js
 * Configuração do Firebase (conta TCC)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth }        from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase }    from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey:            "AIzaSyAzqcjpNqVa_KmAKSfScjweIqoiz4lS9M0",
  authDomain:        "petfeeder-tcc-d3536.firebaseapp.com",
  databaseURL:       "https://petfeeder-tcc-d3536-default-rtdb.firebaseio.com",
  projectId:         "petfeeder-tcc-d3536",
  storageBucket:     "petfeeder-tcc-d3536.firebasestorage.app",
  messagingSenderId: "281498528710",
  appId:             "1:281498528710:web:4b8c7627a744f50715a0c7",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getDatabase(app);
