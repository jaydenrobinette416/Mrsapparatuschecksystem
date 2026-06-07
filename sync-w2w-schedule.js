const fs = require("fs");
const { MongoClient } = require("mongodb");
require("dotenv").config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);

  try {
    await client.connect();

    const db = client.db();
    const schedules = db.collection("schedules");

    const shifts = JSON.parse(fs.readFileSync("schedule-data.json", "utf8"));

    console.log(`Loaded ${shifts.length} shifts`);

    // Remove old schedule
    await schedules.deleteMany({});

    // Insert fresh schedule
    await schedules.insertMany(shifts);

    console.log(`Inserted ${shifts.length} shifts into MongoDB`);
  } finally {
    await client.close();
  }
}

run().catch(console.error);
