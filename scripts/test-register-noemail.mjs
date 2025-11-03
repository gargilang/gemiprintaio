// Simple test script to create a user without email via local API
const url = "http://localhost:3000/api/users";

const payload = {
  username: "test_noemail_" + Math.floor(Math.random() * 100000),
  email: null, // email intentionally omitted (null)
  full_name: "Test No Email",
  password: "123456",
  role: "user",
  is_active: 1,
};

(async () => {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    console.log("Status:", res.status);
    console.log("Response:", data);
  } catch (e) {
    console.error("Error:", e);
    process.exit(1);
  }
})();
