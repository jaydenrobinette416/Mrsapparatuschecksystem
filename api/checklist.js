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
res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
res.setHeader("Access-Control-Allow-Headers", "Content-Type");

if (req.method === "OPTIONS") {
return res.status(200).end();
}

try {
const db = await connectToDatabase();

```
// ==========================
// GET CHECKLIST ITEMS
// ==========================
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

  // Convert:
  // Medic 1 -> 93 Medic 1
  // Medic 2 -> 93 Medic 2
  // Rescue 2 -> 93 Rescue 2
  // But leave already-prefixed units alone
  if (!cleanUnit.startsWith(cleanBase + " ")) {
    lookupUnit = `${cleanBase} ${cleanUnit}`;
  }

  const items = await db.collection("checkItems")
    .find({
      base: cleanBase,
      unit: lookupUnit,
      active: true
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

// ==========================
// ADD CHECKLIST ITEM
// ==========================
if (req.method === "POST") {
  const body = req.body || {};

  const doc = {
    base: String(body.base || "").trim(),
    unit: String(body.unit || "").trim(),
    section: String(body.section || "").trim(),
    subsection: String(body.subsection || "").trim(),
    shelf: String(body.shelf || "").trim(),
    item: String(body.item || "").trim(),
    type: String(body.type || "TEXT").trim(),
    qty: String(body.qty || "").trim(),
    subitems: body.subitems || "",
    order: Number(body.order || 0),
    active: body.active !== false,
    createdAt: new Date()
  };

  if (!doc.base || !doc.unit || !doc.item) {
    return res.status(400).json({
      ok: false,
      error: "Base, unit, and item are required"
    });
  }

  const result = await db.collection("checkItems").insertOne(doc);

  return res.status(201).json({
    ok: true,
    id: result.insertedId
  });
}

return res.status(405).json({
  ok: false,
  error: "Method not allowed"
});
```

} catch (err) {
return res.status(500).json({
ok: false,
error: err.message
});
}
};
