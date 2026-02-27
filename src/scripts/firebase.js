import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBt86uVSewEe4-NKjGyZCEm4Qn_y1Ap1vM",
  authDomain: "relatorios-estoque.firebaseapp.com",
  projectId: "relatorios-estoque",
  storageBucket: "relatorios-estoque.firebasestorage.app",
  messagingSenderId: "164779102499",
  appId: "1:164779102499:web:717611e5dd0f2fc5977c96"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
