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
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const db = await connectToDatabase();
    const collection = db.collection("serviceSchedule");

    if (req.method === "GET") {
      const unit = req.query.unit;

      const filter = unit
        ? { unit: String(unit).trim() }
        : {};

      const services = await collection
        .find(filter)
        .sort({ unit: 1, serviceItem: 1 })
        .toArray();

      return res.status(200).json({
        ok: true,
        count: services.length,
        services
      });
    }

    if (req.method === "POST") {
      const body = req.body || {};

      const doc = {
        unit: String(body.unit || "").trim(),
        serviceItem: String(body.serviceItem || body.item || "").trim(),
        type: String(body.type || "MILES").trim().toUpperCase(),
        currentValue: String(body.currentValue || "").trim(),
        dueAt: String(body.dueAt || "").trim(),
        notes: String(body.notes || "").trim(),
        active: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      if (!doc.unit || !doc.serviceItem) {
        return res.status(400).json({
          ok: false,
          error: "Unit and service item are required."
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

      if (!body.id) {
        return res.status(400).json({
          ok: false,
          error: "Missing id."
        });
      }

      const update = {
        updatedAt: new Date()
      };

      [
        "unit",
        "serviceItem",
        "type",
        "currentValue",
        "dueAt",
        "notes"
      ].forEach(field => {
        if (body[field] !== undefined) {
          update[field] = String(body[field] || "").trim();
        }
      });

      if (body.active !== undefined) {
        update.active = !!body.active;
      }

      await collection.updateOne(
        { _id: new ObjectId(body.id) },
        { $set: update }
      );

      return res.status(200).json({
        ok: true
      });
    }

    if (req.method === "DELETE") {
      const id = req.query.id;

      if (!id) {
        return res.status(400).json({
          ok: false,
          error: "Missing id."
        });
      }

      await collection.deleteOne({
        _id: new ObjectId(id)
      });

      return res.status(200).json({
        ok: true
      });
    }

    return res.status(405).json({
      ok: false,
      error: "Method not allowed."
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
};
