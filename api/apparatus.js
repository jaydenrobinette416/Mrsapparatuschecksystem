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
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const db = await connectToDatabase();
    const collection = db.collection("apparatus");

    if (req.method === "GET") {
      const base = req.query.base;
      const showAll = String(req.query.showAll || "").toLowerCase() === "true";

      const filter = showAll ? {} : {
        active: true,
        currentBase: String(base || "").trim()
      };

      const units = await collection
        .find(filter)
        .sort({ sortOrder: 1, unit: 1 })
        .toArray();

      return res.status(200).json({
        ok: true,
        count: units.length,
        units
      });
    }

    if (req.method === "POST") {
      const body = req.body || {};

      const doc = {
        unit: String(body.unit || "").trim(),
        homeBase: String(body.homeBase || body.base || "").trim(),
        currentBase: String(body.currentBase || body.homeBase || body.base || "").trim(),
        active: body.active !== false,
        checkDays: String(body.checkDays || "DAILY").trim(),
        sortOrder: Number(body.sortOrder || 999),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      if (!doc.unit || !doc.homeBase) {
        return res.status(400).json({
          ok: false,
          error: "Unit and homeBase are required"
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
      const id = body.id;

      if (!id) {
        return res.status(400).json({
          ok: false,
          error: "Missing apparatus id"
        });
      }

      const update = {
        updatedAt: new Date()
      };

      if (body.unit !== undefined) update.unit = String(body.unit).trim();
      if (body.homeBase !== undefined) update.homeBase = String(body.homeBase).trim();
      if (body.currentBase !== undefined) update.currentBase = String(body.currentBase).trim();
      if (body.active !== undefined) update.active = !!body.active;
      if (body.checkDays !== undefined) update.checkDays = String(body.checkDays).trim();
      if (body.sortOrder !== undefined) update.sortOrder = Number(body.sortOrder);

      await collection.updateOne(
        { _id: new ObjectId(id) },
        { $set: update }
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
