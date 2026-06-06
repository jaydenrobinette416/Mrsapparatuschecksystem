const { MongoClient, ObjectId } = require("mongodb");

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { db: cachedDb };
  }

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();

  const db = client.db("ApparatusCheck");

  cachedClient = client;
  cachedDb = db;

  return { db };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const { db } = await connectToDatabase();

    // GET ALL ACTIVE MESSAGES
    if (req.method === "GET") {
      const messages = await db
        .collection("crewMessages")
        .find({ active: true })
        .sort({ createdAt: -1 })
        .toArray();

      return res.status(200).json({
        ok: true,
        messages
      });
    }

    // CREATE MESSAGE
    if (req.method === "POST") {
      const body = req.body || {};

      const doc = {
        unit: body.unit || "",
        priority: body.priority || "Info",
        message: body.message || "",
        fromUser: body.fromUser || "",
        toType: body.toType || "Everyone",
        active: true,
        acknowledgedBy: null,
        acknowledgedAt: null,
        createdAt: new Date()
      };

      const result = await db
        .collection("crewMessages")
        .insertOne(doc);

      return res.status(201).json({
        ok: true,
        id: result.insertedId
      });
    }

    // ACKNOWLEDGE MESSAGE
    if (req.method === "PATCH") {
      const body = req.body || {};

      await db.collection("crewMessages").updateOne(
        { _id: new ObjectId(body.id) },
        {
          $set: {
            acknowledgedBy: body.user || "Unknown",
            acknowledgedAt: new Date()
          }
        }
      );

      return res.status(200).json({
        ok: true
      });
    }

    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
};
