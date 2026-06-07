const { MongoClient, ObjectId } = require("mongodb");

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { db: cachedDb };
  }

  if (!process.env.MONGODB_URI) {
    throw new Error("Missing MONGODB_URI environment variable");
  }

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();

  const db = client.db("ApparatusCheck");

  cachedClient = client;
  cachedDb = db;

  return { db };
}

function isValidObjectId(id) {
  return id && ObjectId.isValid(String(id));
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const { db } = await connectToDatabase();
    const collection = db.collection("crewMessages");

    if (req.method === "GET") {
      const messages = await collection
        .find({ active: true })
        .sort({ createdAt: -1 })
        .toArray();

      return res.status(200).json({
        ok: true,
        messages
      });
    }

    if (req.method === "POST") {
      const body = req.body || {};

      const doc = {
        unit: String(body.unit || "").trim(),
        priority: String(body.priority || "Info").trim(),
        message: String(body.message || "").trim(),
        fromUser: String(body.fromUser || "").trim(),
        toType: String(body.toType || "Everyone").trim(),
        active: true,
        acknowledgedBy: null,
        acknowledgedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      if (!doc.message) {
        return res.status(400).json({
          ok: false,
          error: "Message is required"
        });
      }

      const result = await collection.insertOne(doc);

      return res.status(201).json({
        ok: true,
        id: result.insertedId
      });
    }

    if (req.method === "PATCH") {
      const body = req.body || {};

      if (!isValidObjectId(body.id)) {
        return res.status(400).json({
          ok: false,
          error: "Invalid or missing message id"
        });
      }

      const update = {
        updatedAt: new Date()
      };

      if (body.active !== undefined) {
        update.active = body.active === true || String(body.active).toLowerCase() === "true";
        if (update.active === false) {
          update.deletedAt = new Date();
        }
      }

      if (body.user !== undefined) {
        update.acknowledgedBy = String(body.user || "Unknown").trim();
        update.acknowledgedAt = new Date();
      }

      const result = await collection.updateOne(
        { _id: new ObjectId(String(body.id)) },
        { $set: update }
      );

      return res.status(200).json({
        ok: true,
        matched: result.matchedCount,
        modified: result.modifiedCount
      });
    }

    if (req.method === "DELETE") {
      const id = req.query.id || (req.body && req.body.id);

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          ok: false,
          error: "Invalid or missing message id"
        });
      }

      const result = await collection.updateOne(
        { _id: new ObjectId(String(id)) },
        {
          $set: {
            active: false,
            deletedAt: new Date(),
            updatedAt: new Date()
          }
        }
      );

      return res.status(200).json({
        ok: true,
        matched: result.matchedCount,
        modified: result.modifiedCount
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
