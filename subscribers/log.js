const { createClient } = require("redis");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function log_upload({ userId, imagePath }) {
  await sleep(1000);
  console.log(`Logged upload for user ${userId}`);
}

async function main() {
  const subscriber = createClient();
  await subscriber.connect();
  await subscriber.subscribe("image_uploaded", async (message) => {
    try {
      const data = JSON.parse(message);
      await log_upload(data);
    } catch (e) {
      console.error("Subscriber log error:", e);
    }
  });
}

main();
