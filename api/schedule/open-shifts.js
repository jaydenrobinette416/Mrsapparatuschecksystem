import { MongoClient } from "mongodb";

let client;
let db;

async function connect() {
  if (db) return db;

  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db("ApparatusCheck");

  return db;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const db = await connect();

    const today = new Date().toISOString().slice(0, 10);

    const shifts = await db.collection("schedules")
      .find({
        date: { $gte: today },
        $or: [
          { unassigned: true },
          { employee: "(Unassigned)" }
        ]
      })
      .sort({ date: 1, shift: 1 })
      .toArray();

    return res.status(200).json({
      ok: true,
      count: shifts.length,
      shifts
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}
