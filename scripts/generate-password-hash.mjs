// Password Hash Generator untuk SQLite
// Jalankan dengan: node generate-password-hash.mjs

async function generatePasswordHash(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex;
}

// Generate hash untuk password "5555"
const password = "5555";
const hash = await generatePasswordHash(password);

console.log("=".repeat(60));
console.log("PASSWORD HASH GENERATOR");
console.log("=".repeat(60));
console.log(`Password: ${password}`);
console.log(`SHA-256 Hash: ${hash}`);
console.log("=".repeat(60));
console.log("\nGunakan hash ini di database SQLite untuk kolom password_hash");
