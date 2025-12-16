const { createClient } = require("redis");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function notify_admin({ userId, imagePath }) {
  await sleep(2000);
  console.log(`Admin notified for user ${userId}`);
}

async function main() {
  const subscriber = createClient();
  await subscriber.connect();
  await subscriber.subscribe("image_uploaded", async (message) => {
    try {
      const data = JSON.parse(message);
      await notify_admin(data);
    } catch (e) {
      console.error("Subscriber notify error:", e);
    }
  });
}

main();
