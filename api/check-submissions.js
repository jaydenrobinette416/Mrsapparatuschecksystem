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


function normalizeExpirationDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const mmYY = text.match(/^(\d{1,2})\/(\d{2}|\d{4})$/);
  if (mmYY) {
    const month = Number(mmYY[1]);
    let year = Number(mmYY[2]);
    if (year < 100) year += 2000;
    if (month < 1 || month > 12) return text;

    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  }

  return text;
}

function getResponseValuePart(value, label) {
  const wanted = String(label || "").toLowerCase();
  const parts = String(value || "").split("|").map((p) => p.trim());

  for (const part of parts) {
    const idx = part.indexOf(":");
    if (idx < 0) continue;

    const key = part.substring(0, idx).trim().toLowerCase();
    if (key === wanted) {
      return part.substring(idx + 1).trim();
    }
  }

  return "";
}

function parseChecklistTypesForExpiration(typeValue) {
  return String(typeValue || "")
    .toUpperCase()
    .split(/[,+|;/]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

async function upsertExpirationItemsFromCheckoff(db, submission, now) {
  const bagTag = String(submission.medicalBagTag || "").trim().toUpperCase();
  if (!bagTag) return;

  const responses = Array.isArray(submission.responses) ? submission.responses : [];

  for (const response of responses) {
    const itemName = String(response.item || "").trim();
    if (!itemName) continue;

    const typeList = parseChecklistTypesForExpiration(response.type || "");
    const value = String(response.value || "");

    const date1 =
      String(response.expDateValue || "").trim() ||
      getResponseValuePart(value, "Exp");

    const date2 =
      String(response.expDate2Value || "").trim() ||
      getResponseValuePart(value, "Exp 2");

    const section = String(response.section || "Medical Bag").trim() || "Medical Bag";
    const subsection = String(response.subsection || "").trim();
    const shelf = String(response.shelf || "").trim();

    const records = [];

    if ((typeList.includes("DATE") || date1) && date1) {
      records.push({
        label: "EXP 1",
        item: `${itemName} EXP 1`,
        expiration: normalizeExpirationDate(date1)
      });
    }

    if ((typeList.includes("DATE2") || date2) && date2) {
      records.push({
        label: "EXP 2",
        item: `${itemName} EXP 2`,
        expiration: normalizeExpirationDate(date2)
      });
    }

    for (const record of records) {
      if (!record.expiration) continue;

      await db.collection("expirationItems").updateOne(
        {
          bagTag,
          source: "checkoff",
          sourceUnit: submission.unit,
          sourceItem: itemName,
          sourceLabel: record.label
        },
        {
          $set: {
            bagTag,
            item: record.item,
            originalItem: itemName,
            expiration: record.expiration,
            section,
            subsection,
            shelf,
            notes: `Updated from ${submission.unit} checkoff`,
            active: true,
            source: "checkoff",
            sourceUnit: submission.unit,
            sourceItem: itemName,
            sourceLabel: record.label,
            updatedBy: submission.checkedBy,
            updatedAt: now
          },
          $setOnInsert: {
            createdAt: now
          }
        },
        { upsert: true }
      );
    }
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const db = await connectToDatabase();

    if (req.query.draft === "true") {

      if (req.method === "GET") {
        const draft = await db.collection("checkDrafts").findOne({
          username: String(req.query.username || "").trim(),
          unit: String(req.query.unit || "").trim()
        });

        return res.status(200).json({ ok:true, draft });
      }

      if (req.method === "POST") {
        const body = req.body || {};
        await db.collection("checkDrafts").updateOne(
          {
            username: String(body.username || "").trim(),
            unit: String(body.unit || "").trim()
          },
          {
            $set: {
              username: String(body.username || "").trim(),
              unit: String(body.unit || "").trim(),
              base: String(body.base || "").trim(),
              medicalBagTag: String(body.medicalBagTag || ""),
              data: body.data || [],
              updatedAt: new Date()
            }
          },
          { upsert:true }
        );

        return res.status(200).json({ ok:true });
      }

      if (req.method === "DELETE") {
        await db.collection("checkDrafts").deleteOne({
          username: String(req.query.username || "").trim(),
          unit: String(req.query.unit || "").trim()
        });

        return res.status(200).json({ ok:true });
      }
    }



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
        checkDate: today,
        resetForToday: { $ne: true }
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
        checkDate: submission.checkDate,
        resetForToday: { $ne: true }
      });

      const allowDuplicate =
        body.allowDuplicate === true ||
        String(body.allowDuplicate || "").toLowerCase() === "true";

      if (existing && !allowDuplicate) {
        return res.status(409).json({
          ok: false,
          error: "Unit already checked for this check day"
        });
      }

      const result = await db
        .collection("checkSubmissions")
        .insertOne(submission);

      // Update expiration records from this completed checkoff
await upsertExpirationItemsFromCheckoff(db, submission, now);

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


    if (req.method === "DELETE") {
      const unit = String(req.query.unit || "").trim();
      const base = String(req.query.base || "").trim();

      if (!unit || !base) {
        return res.status(400).json({
          ok: false,
          error: "Missing unit or base"
        });
      }

      const checkDate = getOperationalEasternDateString();

      const result = await db.collection("checkSubmissions").updateMany(
        {
          unit,
          base,
          checkDate,
          resetForToday: { $ne: true }
        },
        {
          $set: {
            resetForToday: true,
            resetAt: new Date(),
            resetReason: "Admin reset for recheck"
          }
        }
      );

      return res.status(200).json({
        ok: true,
        resetCount: result.modifiedCount || 0,
        message: "Today check reset without deleting recent check record"
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
