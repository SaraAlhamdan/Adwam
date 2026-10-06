async function testDeployed() {
  const url = "https://yhbqgdqoymbfuixojvmz.supabase.co/functions/v1/analyze-recitation";
  console.log("Testing deployed function at:", url);

  // Send an empty request to test validation response
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  const data = await res.json();
  console.log("Deployed Function status code:", res.status);
  console.log("Deployed Function response:", data);
}

testDeployed().catch(console.error);
