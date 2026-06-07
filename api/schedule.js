const { MongoClient } = require("mongodb");

let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();

  cachedDb = client.db("ApparatusCheck");
  return cachedDb;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const db = await connectToDatabase();
    const schedules = db.collection("schedules");

    const type = String(req.query.type || "today");

    // TODAY
    if (type === "today") {
      const today = new Date().toISOString().slice(0, 10);

      const shifts = await schedules
        .find({ date: today })
        .sort({ shift: 1 })
        .toArray();

      return res.status(200).json({
        ok: true,
        date: today,
        shifts
      });
    }

    // OPEN SHIFTS
    if (type === "open") {
      const today = new Date().toISOString().slice(0, 10);

      const shifts = await schedules
        .find({
          date: { $gte: today },
          $or: [
            { unassigned: true },
            { employee: "(Unassigned)" }
          ]
        })
        .sort({ date: 1, shift: 1 })
        .toArray();

      return res.status(200).json({
        ok: true,
        count: shifts.length,
        shifts
      });
    }

    // MONTH VIEW
    if (type === "month") {
      const now = new Date();
      const defaultMonth =
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      const month = String(
        req.query.month || defaultMonth
      ).slice(0, 7);

      const shifts = await schedules
        .find({
          date: { $regex: "^" + month }
        })
        .sort({
          date: 1,
          shift: 1,
          time: 1
        })
        .toArray();

      return res.status(200).json({
        ok: true,
        month,
        count: shifts.length,
        shifts
      });
    }

    return res.status(400).json({
      ok: false,
      error: "Invalid schedule type"
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
};
