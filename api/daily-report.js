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

function normalizeDate(input) {
  if (!input) return new Date().toISOString().split("T")[0];

  const raw = String(input).trim();

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // MM/DD/YYYY
  const parts = raw.split("/");
  if (parts.length === 3) {
    return `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
  }

  return raw;
}

function displayDate(yyyyMMdd) {
  const parts = String(yyyyMMdd || "").split("-");
  if (parts.length !== 3) return yyyyMMdd;
  return `${parts[1]}/${parts[2]}/${parts[0]}`;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const db = await connectToDatabase();

    if (req.method !== "GET") {
      return res.status(405).json({
        ok: false,
        error: "Method not allowed"
      });
    }

    const checkDate = normalizeDate(req.query.date);

    const submissions = await db.collection("checkSubmissions")
      .find({ checkDate: checkDate })
      .sort({ unit: 1 })
      .toArray();

    const apparatus = await db.collection("apparatus")
      .find({ active: true })
      .sort({ sortOrder: 1, unit: 1 })
      .toArray();

    const checkedUnits = submissions.map(s => s.unit);
    const missingUnits = apparatus
      .map(a => a.unit)
      .filter(unit => !checkedUnits.includes(unit));

    let issueCount = 0;

    const checks = submissions.map(s => {
      const responses = Array.isArray(s.responses) ? s.responses : [];

      const issues = responses.filter(r => {
        const status = String(r.status || "").toUpperCase();
        return status === "ISSUE" || status === "FAIL" || status === "FAILED";
      });

      issueCount += issues.length;

      return {
        checkId: s._id,
        unit: s.unit,
        checkedBy: s.checkedBy,
        time: s.checkTime,
        status: s.status || (issues.length ? "ISSUES" : "COMPLETE"),
        issues: issues.map(i => ({
          item: i.item || "",
          section: i.section || "",
          shelf: i.shelf || "",
          value: i.value || i.answer || "",
          notes: i.notes || ""
        }))
      };
    });

    return res.status(200).json({
      ok: true,
      displayDate: displayDate(checkDate),
      date: checkDate,
      unitsChecked: submissions.length,
      totalUnits: apparatus.length,
      issueCount: issueCount,
      missingUnits: missingUnits,
      checks: checks
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
};
