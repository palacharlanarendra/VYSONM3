const express = require('express');
const app = express();

app.use(express.json());

app.post("/sync", async (req, res) => {
  console.log("Sync start:", new Date().toISOString());

  // simulate slow blocking task
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log("Sync end:", new Date().toISOString());

  return res.json({ status: "success" });
});

app.post("/async", (req, res) => {
  console.log("Async start:", new Date().toISOString());

  new Promise(resolve =>
    setTimeout(() => resolve("Async task finished:"), 3000)
  ).then(msg => {
    console.log(msg, new Date().toISOString());
  });

  return res.json({ status: "accepted" });
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
