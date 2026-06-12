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

function normalizeTag(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeDate(value) {
  const text = String(value || "").trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const mmYY = text.match(/^(\d{1,2})\/(\d{2}|\d{4})$/);
  if (mmYY) {
    const month = Number(mmYY[1]);
    let year = Number(mmYY[2]);
    if (year < 100) year += 2000;

    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }

  const date = new Date(text);
  if (!isNaN(date.getTime())) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  return text;
}

function getDaysLeft(expiration) {
  const normalized = normalizeDate(expiration);
  const parts = String(normalized || "").split("-").map(Number);

  if (parts.length !== 3 || parts.some(isNaN)) return 99999;

  const exp = new Date(parts[0], parts[1] - 1, parts[2]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.ceil((exp.getTime() - today.getTime()) / 86400000);
}

async function buildDashboard(db) {
  const bags = await db.collection("medicalBags")
    .find({ active: { $ne: false } })
    .sort({ tag: 1 })
    .toArray();

  const items = await db.collection("expirationItems")
    .find({ active: { $ne: false } })
    .sort({ bagTag: 1, section: 1, item: 1 })
    .toArray();

  const apparatus = await db.collection("apparatus")
    .find({ active: { $ne: false } })
    .sort({ sortOrder: 1, unit: 1 })
    .toArray();

  const byBag = {};
  items.forEach((item) => {
    const tag = normalizeTag(item.bagTag);
    if (!byBag[tag]) byBag[tag] = [];
    const daysLeft = getDaysLeft(item.expiration);
    byBag[tag].push({
      ...item,
      bagTag: tag,
      expiration: normalizeDate(item.expiration),
      daysLeft
    });
  });

  const assignedByBag = {};
  apparatus.forEach((unit) => {
    const tag = normalizeTag(unit.currentMedicalBagTag || unit.medicalBagTag || "");
    if (!tag) return;
    assignedByBag[tag] = {
      unit: unit.unit || "",
      base: unit.currentBase || unit.homeBase || ""
    };
  });

  const bagTags = new Set();

  bags.forEach((bag) => {
    const tag = normalizeTag(bag.tag || bag.bagTag);
    if (tag) bagTags.add(tag);
  });

  Object.keys(byBag).forEach((tag) => {
    if (tag) bagTags.add(tag);
  });

  Object.keys(assignedByBag).forEach((tag) => {
    if (tag) bagTags.add(tag);
  });

  const totals = {
    bags: bagTags.size,
    expired: 0,
    warning: 0,
    safe: 0,
    unassigned: 0
  };

  const bagInfoByTag = {};
  bags.forEach((bag) => {
    const tag = normalizeTag(bag.tag || bag.bagTag);
    if (tag) bagInfoByTag[tag] = bag;
  });

  const bagList = Array.from(bagTags).sort().map((tag) => {
    const bagItems = byBag[tag] || [];
    const assignment = assignedByBag[tag] || {};
    const bag = bagInfoByTag[tag] || {};

    if (!assignment.unit) totals.unassigned++;

    bagItems.forEach((item) => {
      if (item.daysLeft < 0) totals.expired++;
      else if (item.daysLeft <= 30) totals.warning++;
      else totals.safe++;
    });

    return {
      bagTag: tag,
      tag,
      description: bag.description || "",
      assignedUnit: assignment.unit || "",
      assignedBase: assignment.base || "",
      currentUnit: assignment.unit || bag.currentUnit || "",
      base: assignment.base || "",
      items: bagItems
    };
  });

  // Keep "units" for backwards compatibility, but the dashboard is now bag-based.
  return { bags: bagList, units: bagList, totals };
}



module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const db = await connectToDatabase();
    const now = new Date();

    if (req.method === "GET") {
      const type = String(req.query.type || "dashboard").trim();

      if (type === "dashboard") {
        const data = await buildDashboard(db);
        return res.status(200).json({ ok: true, ...data });
      }

      if (type === "admin") {
        const bags = await db.collection("medicalBags")
          .find({ active: { $ne: false } })
          .sort({ tag: 1 })
          .toArray();

        const items = await db.collection("expirationItems")
          .find({ active: { $ne: false } })
          .sort({ bagTag: 1, section: 1, item: 1 })
          .toArray();

        const byBag = {};
        items.forEach((item) => {
          const tag = normalizeTag(item.bagTag);
          if (!byBag[tag]) byBag[tag] = [];
          byBag[tag].push({
            ...item,
            expiration: normalizeDate(item.expiration),
            daysLeft: getDaysLeft(item.expiration)
          });
        });

        return res.status(200).json({
          ok: true,
          bags: bags.map((bag) => ({
            ...bag,
            items: byBag[normalizeTag(bag.tag)] || []
          }))
        });
      }

      if (type === "items") {
        const bagTag = normalizeTag(req.query.bagTag);
        const filter = { active: { $ne: false } };
        if (bagTag) filter.bagTag = bagTag;

        const items = await db.collection("expirationItems")
          .find(filter)
          .sort({ bagTag: 1, section: 1, item: 1 })
          .toArray();

        return res.status(200).json({ ok: true, items });
      }

      return res.status(400).json({ ok: false, error: "Invalid type" });
    }

    if (req.method === "POST") {
      const body = req.body || {};
      const action = String(body.action || "").trim();

      if (action === "saveBag") {
        const tag = normalizeTag(body.tag || body.bagTag);
        if (!tag) return res.status(400).json({ ok: false, error: "Missing bag tag" });

        await db.collection("medicalBags").updateOne(
          { tag },
          {
            $set: {
              tag,
              description: String(body.description || "").trim(),
              active: body.active !== false,
              updatedAt: now
            },
            $setOnInsert: {
              createdAt: now
            }
          },
          { upsert: true }
        );

        return res.status(200).json({ ok: true, message: "Bag saved" });
      }

      if (action === "saveItem") {
        const bagTag = normalizeTag(body.bagTag);
        const item = String(body.item || "").trim();
        const expiration = normalizeDate(body.expiration);
        const section = String(body.section || "Medical Bag").trim();

        if (!bagTag || !item || !expiration) {
          return res.status(400).json({ ok: false, error: "Missing bag tag, item, or expiration" });
        }

        await db.collection("medicalBags").updateOne(
          { tag: bagTag },
          {
            $set: {
              tag: bagTag,
              active: true,
              updatedAt: now
            },
            $setOnInsert: {
              createdAt: now,
              description: ""
            }
          },
          { upsert: true }
        );

        const result = await db.collection("expirationItems").updateOne(
          { bagTag, item, source: { $ne: "checkoff" } },
          {
            $set: {
              bagTag,
              item,
              expiration,
              section,
              notes: String(body.notes || "").trim(),
              active: true,
              updatedAt: now
            },
            $setOnInsert: {
              createdAt: now
            }
          },
          { upsert: true }
        );

        return res.status(201).json({ ok: true, upsertedId: result.upsertedId || null });
      }

      if (action === "assignBag") {
        const unit = String(body.unit || "").trim();
        const bagTag = normalizeTag(body.bagTag);
        const updatedBy = String(body.updatedBy || "").trim();

        if (!unit || !bagTag) {
          return res.status(400).json({ ok: false, error: "Missing unit or bag tag" });
        }

        await db.collection("apparatus").updateOne(
          { unit },
          {
            $set: {
              currentMedicalBagTag: bagTag,
              updatedAt: now
            }
          }
        );

        await db.collection("medicalBags").updateOne(
          { tag: bagTag },
          {
            $set: {
              tag: bagTag,
              currentUnit: unit,
              active: true,
              updatedAt: now
            },
            $setOnInsert: {
              createdAt: now,
              description: ""
            }
          },
          { upsert: true }
        );

        await db.collection("bagAssignments").insertOne({
          unit,
          bagTag,
          updatedBy,
          source: "admin",
          createdAt: now
        });

        return res.status(200).json({ ok: true, message: "Bag assigned" });
      }

      return res.status(400).json({ ok: false, error: "Invalid action" });
    }

    if (req.method === "DELETE") {
      const type = String(req.query.type || "").trim();
      const id = String(req.query.id || "").trim();

      if (!id || !ObjectId.isValid(id)) {
        return res.status(400).json({ ok: false, error: "Missing or invalid id" });
      }

      if (type === "item") {
        await db.collection("expirationItems").updateOne(
          { _id: new ObjectId(id) },
          { $set: { active: false, updatedAt: now } }
        );

        return res.status(200).json({ ok: true });
      }

      if (type === "bag") {
        await db.collection("medicalBags").updateOne(
          { _id: new ObjectId(id) },
          { $set: { active: false, updatedAt: now } }
        );

        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ ok: false, error: "Invalid type" });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
};
