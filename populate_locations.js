import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA7zNL3rYgM7prdtZQA0puMo4g4rHDx3Kw",
  authDomain: "safe-for-me-2bc19.firebaseapp.com",
  projectId: "safe-for-me-2bc19",
  storageBucket: "safe-for-me-2bc19.firebasestorage.app",
  messagingSenderId: "144307434594",
  appId: "1:144307434594:web:9c9bc31070c11f20264d3b",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function populate() {
  try {
    const docRef = await addDoc(collection(db, "locations"), {
      search_keys: ["ajmer road", "ajmer", "vadodara", "390019", "baroda"],
      locationName: "Ajmer Road, Vadodara, Gujarat",
      pincode: "390019",
      coordinates: {
        latitude: 22.3072,
        longitude: 73.1812
      },
      overallRating: 3.8,
      summaryText: "Ajmer Road is a moderately safe area in Vadodara with good street lighting and moderate police presence.",
      crimeStats: {
        violentCrimes: "Low",
        theftPetty: "Medium",
        kidnapping: "Low",
        sexualCrimes: "Low",
        infrastructure: "Good Street Lighting"
      },
      emergencyHubs: [
        { type: "Hospital", name: "Baroda Medical College Hospital", distance: "1.2 km" },
        { type: "Police Station", name: "Vadodara City Police", distance: "0.8 km" },
        { type: "Fire Station", name: "Vadodara Fire Brigade", distance: "2.1 km" }
      ],
      nightTimeCondition: "After 9 PM, the area becomes quieter. Main roads are well-lit but side streets should be avoided. Stay on main roads, avoid isolated areas, travel in groups after 11 PM, use trusted transportation."
    });
    console.log("Document written with ID: ", docRef.id);
  } catch (e) {
    console.error("Error adding document: ", e);
  }
}

populate();
