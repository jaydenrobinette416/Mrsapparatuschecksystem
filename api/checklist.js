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

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const db = await connectToDatabase();
    const collection = db.collection("checkItems");

    if (req.method === "GET") {
      const { unit, base } = req.query;

      if (!unit || !base) {
        return res.status(400).json({
          ok: false,
          error: "Missing unit or base"
        });
      }

      const cleanUnit = String(unit).trim();
      const cleanBase = String(base).trim();

      let lookupUnit = cleanUnit;

      if (!cleanUnit.startsWith(cleanBase + " ")) {
        lookupUnit = `${cleanBase} ${cleanUnit}`;
      }

      const items = await collection
        .find({
          base: cleanBase,
          unit: lookupUnit,
          active: { $ne: false }
        })
        .sort({ order: 1 })
        .toArray();

      return res.status(200).json({
        ok: true,
        unitSearched: lookupUnit,
        count: items.length,
        items
      });
    }

    if (req.method === "POST") {
      const body = req.body || {};

      const count = await collection.countDocuments({
        base: String(body.base || "").trim(),
        unit: String(body.unit || "").trim()
      });

      const doc = {
        base: String(body.base || "").trim(),
        unit: String(body.unit || "").trim(),
        section: String(body.section || "").trim(),
        subsection: String(body.subsection || "").trim(),
        shelf: String(body.shelf || "").trim(),
        item: String(body.item || "").trim(),
        type: String(body.type || "TEXT").trim(),
        qty: String(body.qty || "").trim(),
        subitems: String(body.subitems || "").trim(),
        order: body.order !== undefined ? Number(body.order) : count + 1,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      if (!doc.base || !doc.unit || !doc.item) {
        return res.status(400).json({
          ok: false,
          error: "Base, unit, and item are required"
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
          error: "Missing item id"
        });
      }

      const update = {
        updatedAt: new Date()
      };

      [
        "base",
        "unit",
        "section",
        "subsection",
        "shelf",
        "item",
        "type",
        "qty",
        "subitems"
      ].forEach(field => {
        if (body[field] !== undefined) {
          update[field] = String(body[field] || "").trim();
        }
      });

      if (body.order !== undefined) {
        update.order = Number(body.order);
      }

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
          error: "Missing item id"
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
      error: "Method not allowed"
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
};
