const { MongoClient } = require("mongodb");

let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;

  if (!process.env.MONGODB_URI) {
    throw new Error("Missing MONGODB_URI environment variable");
  }

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();

  cachedDb = client.db("ApparatusCheck");
  return cachedDb;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const db = await connectToDatabase();

    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const month = String(req.query.month || defaultMonth).slice(0, 7);

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        ok: false,
        error: "Invalid month. Use YYYY-MM."
      });
    }

    const shifts = await db.collection("schedules")
      .find({ date: { $regex: "^" + month } })
      .sort({ date: 1, shift: 1, time: 1, employee: 1 })
      .toArray();

    return res.status(200).json({
      ok: true,
      month,
      count: shifts.length,
      shifts
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
};
