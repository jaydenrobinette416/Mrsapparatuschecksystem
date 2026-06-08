const { MongoClient } = require("mongodb");

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("Missing MONGODB_URI environment variable");
  }

  const client = new MongoClient(uri);
  await client.connect();

  const db = client.db("ApparatusCheck");

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const { db } = await connectToDatabase();

    if (req.method === "GET") {
      const messages = await db
        .collection("crewMessages")
        .find({})
        .sort({ createdAt: -1 })
        .limit(25)
        .toArray();

      return res.status(200).json({
        ok: true,
        message: "API is running",
        messages
      });
    }

    if (req.method === "POST") {
      const body = req.body || {};

      const newMessage = {
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

      if (!newMessage.message.trim()) {
        return res.status(400).json({
          ok: false,
          error: "Message cannot be blank"
        });
      }

      const result = await db.collection("crewMessages").insertOne(newMessage);

      return res.status(201).json({
        ok: true,
        insertedId: result.insertedId,
        message: "Crew message saved"
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
