const { createClient } = require("redis");

async function main() {
  const client = createClient();
  await client.connect();

  const tasks = [
    { id: "A", data: "Task A" },
    { id: "B", data: "Task B" },
    { id: "C", data: "Task C" }, 
    { id: "D", data: "Task D" },
  ];

  console.log('--- Starting Producer ---');
  
  for (const task of tasks) {
    await client.rPush("main_queue", JSON.stringify(task));
    console.log(`[Producer] Enqueued: ${task.id}`);
  }

  console.log('--- All tasks enqueued ---');
  await client.disconnect();
}

main().catch((err) => {
  console.error('Producer error:', err);
  process.exit(1);
});
