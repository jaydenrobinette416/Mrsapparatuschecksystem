const { MongoClient, ObjectId } = require("mongodb");

let cachedDb = null;

async function connect() {
  if (cachedDb) return cachedDb;

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();

  cachedDb = client.db("ApparatusCheck");
  return cachedDb;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const db = await connect();

    //
    // GET ALL DUTIES
    //
    if (req.method === "GET") {

      const shift = req.query.shift || "";
      const base = req.query.base || "";

      const query = {};

      if (shift) query.shift = shift.toUpperCase();
      if (base) query.base = base;

      const duties = await db.collection("dailyDuties")
        .find(query)
        .sort({ order: 1 })
        .toArray();

      return res.json({
        ok: true,
        duties
      });

    }

    //
    // ADD DUTY
    //
    if (req.method === "POST") {

      const body = req.body || {};

      const duty = {
        title: String(body.title || "").trim(),
        shift: String(body.shift || "DAY").toUpperCase(),
        base: String(body.base || ""),
        order: Number(body.order || 0),
        active: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await db.collection("dailyDuties").insertOne(duty);

      return res.json({
        ok: true
      });

    }

    //
    // UPDATE
    //
    if (req.method === "PUT") {

      const body = req.body || {};

      await db.collection("dailyDuties").updateOne(
        {
          _id: new ObjectId(body.id)
        },
        {
          $set: {
            title: body.title,
            shift: body.shift,
            base: body.base,
            order: Number(body.order),
            active: body.active,
            updatedAt: new Date()
          }
        }
      );

      return res.json({
        ok: true
      });

    }

    //
    // DELETE
    //
    if (req.method === "DELETE") {

      const id = req.query.id;

      await db.collection("dailyDuties").deleteOne({
        _id: new ObjectId(id)
      });

      return res.json({
        ok: true
      });

    }

    res.status(405).json({
      ok:false
    });

  }
  catch(err){

    res.status(500).json({
      ok:false,
      error:err.message
    });

  }

};
