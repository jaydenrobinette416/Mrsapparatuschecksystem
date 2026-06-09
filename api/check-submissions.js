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

function getOperationalEasternDateString() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());

  const data = {};
  parts.forEach(part => {
    if (part.type !== "literal") data[part.type] = part.value;
  });

  const date = new Date(Number(data.year), Number(data.month) - 1, Number(data.day));
  const hour = Number(data.hour || 0);
  const minute = Number(data.minute || 0);

  // Apparatus check day resets at 06:30 Eastern.
  // Before 06:30, submissions still count for the previous check day.
  if (hour < 6 || (hour === 6 && minute < 30)) {
    date.setDate(date.getDate() - 1);
  }

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function getEasternTimeString() {
  const now = new Date();

  return now.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
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

    if (req.method === "GET") {
      const unit = req.query.unit;
      const base = req.query.base;

      if (!unit || !base) {
        return res.status(400).json({
          ok: false,
          error: "Missing unit or base"
        });
      }

      const today = getOperationalEasternDateString();

      const existing = await db.collection("checkSubmissions").findOne({
        unit: String(unit).trim(),
        base: String(base).trim(),
        checkDate: today
      });

      return res.status(200).json({
        ok: true,
        checked: existing ? true : false,
        checkedBy: existing ? existing.checkedBy || "" : "",
        checkedDate: existing ? existing.checkDate || "" : "",
        checkedTime: existing ? existing.checkTime || "" : "",
        status: existing ? existing.status || "" : "",
        signature: existing ? existing.signature || "" : "",
        signatureName: existing ? existing.signatureName || "" : "",
        responses: existing ? existing.responses || [] : []
      });
    }

    if (req.method === "POST") {
      const body = req.body || {};
      const now = new Date();

      const submission = {
        unit: String(body.unit || "").trim(),
        base: String(body.base || "").trim(),
        checkedBy: String(body.checkedBy || "").trim(),
        status: String(body.status || "COMPLETE").trim(),
        checkDate: getOperationalEasternDateString(),
        checkTime: getEasternTimeString(),
        signature: body.signature || "",
        signatureName: String(body.signatureName || body.checkedBy || "").trim(),
        medicalBagTag: String(body.medicalBagTag || "").trim().toUpperCase(),
        responses: Array.isArray(body.responses) ? body.responses : [],
        createdAt: now
      };

      if (!submission.unit || !submission.base) {
        return res.status(400).json({
          ok: false,
          error: "Missing unit or base"
        });
      }

      const existing = await db.collection("checkSubmissions").findOne({
        unit: submission.unit,
        base: submission.base,
        checkDate: submission.checkDate
      });

      if (existing) {
        return res.status(409).json({
          ok: false,
          error: "Unit already checked for this check day"
        });
      }

      const result = await db
        .collection("checkSubmissions")
        .insertOne(submission);

      if (submission.medicalBagTag) {
        await db.collection("apparatus").updateOne(
          { unit: submission.unit },
          {
            $set: {
              currentMedicalBagTag: submission.medicalBagTag,
              updatedAt: now
            }
          }
        );

        await db.collection("medicalBags").updateOne(
          { tag: submission.medicalBagTag },
          {
            $set: {
              tag: submission.medicalBagTag,
              currentUnit: submission.unit,
              active: true,
              updatedAt: now
            },
            $setOnInsert: {
              createdAt: now
            }
          },
          { upsert: true }
        );

        await db.collection("bagAssignments").insertOne({
          unit: submission.unit,
          base: submission.base,
          bagTag: submission.medicalBagTag,
          updatedBy: submission.checkedBy,
          source: "checkoff",
          createdAt: now
        });
      }

      return res.status(201).json({
        ok: true,
        id: result.insertedId,
        checkDate: submission.checkDate,
        checkTime: submission.checkTime
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
