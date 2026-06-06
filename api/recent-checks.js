const { MongoClient, ObjectId } = require("mongodb");

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

    if (req.method !== "GET") {
      return res.status(405).json({
        ok: false,
        error: "Method not allowed"
      });
    }

    const id = req.query.id;
    const unit = req.query.unit;
    const date = req.query.date;
    const limit = Number(req.query.limit || 25);

    if (id) {
      const check = await db.collection("checkSubmissions").findOne({
        _id: new ObjectId(id)
      });

      return res.status(200).json({
        ok: true,
        check
      });
    }

    const filter = {};

    if (unit) {
      filter.unit = String(unit).trim();
    }

    if (date) {
      filter.checkDate = String(date).trim();
    }

    const checks = await db.collection("checkSubmissions")
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return res.status(200).json({
      ok: true,
      count: checks.length,
      checks
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
};
