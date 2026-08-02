const { MongoClient, ObjectId } = require("mongodb");

const ACCOUNT_INVITE_CODE = process.env.ACCOUNT_INVITE_CODE || "MRS2026";

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
    const users = db.collection("users");

    if (req.method === "POST") {
      const body = req.body || {};
      const action = String(body.action || "").trim();

      if (action === "signup") {
        const inviteCode = String(body.inviteCode || "").trim();

        if (inviteCode !== ACCOUNT_INVITE_CODE) {
          return res.status(403).json({
            ok: false,
            success: false,
            message: "Invalid invite code."
          });
        }

        const doc = {
          name: String(body.name || "").trim(),
          username: String(body.username || "").trim(),
          password: String(body.password || "").trim(),
          base: String(body.base || "").trim(),
          role: "USER",
          approved: true,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        if (!doc.name || !doc.username || !doc.password || !doc.base) {
          return res.status(400).json({
            ok: false,
            success: false,
            message: "Fill out all fields."
          });
        }

        const existing = await users.findOne({
          username: doc.username
        });

        if (existing) {
          return res.status(409).json({
            ok: false,
            success: false,
            message: "Username already exists."
          });
        }

        await users.insertOne(doc);

        return res.status(201).json({
          ok: true,
          success: true,
          message: "Account created successfully. You can log in now."
        });
      }

      if (action === "login") {
        const username = String(body.username || "").trim();
        const password = String(body.password || "").trim();

        const user = await users.findOne({
          username: username,
          password: password,
          active: true
        });

        if (!user) {
          return res.status(401).json({
            ok: false,
            success: false,
            message: "Invalid username or password."
          });
        }

        if (!user.approved) {
          return res.status(403).json({
            ok: false,
            success: false,
            message: "Your account is waiting for admin approval."
          });
        }

        return res.status(200).json({
          ok: true,
          success: true,
          id: user._id,
          name: user.name,
          username: user.username,
          base: user.base,
          role: user.role
        });
      }

      return res.status(400).json({
        ok: false,
        message: "Invalid action."
      });
    }

    if (req.method === "GET") {
      const type = String(req.query.type || "all").trim();

      const filter = {};

      if (type === "pending") {
        filter.approved = false;
        filter.active = true;
      }

      if (type === "approved") {
        filter.approved = true;
        filter.active = true;
      }

      const list = await users
        .find(filter, { projection: { password: 0 } })
        .sort({ createdAt: -1 })
        .toArray();

      return res.status(200).json({
        ok: true,
        users: list
      });
    }

    if (req.method === "PATCH") {
      const body = req.body || {};
      const id = body.id;
      const action = String(body.action || "").trim();

      if (!id) {
        return res.status(400).json({
          ok: false,
          message: "Missing user id."
        });
      }

      if (action === "approve") {
        await users.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              approved: true,
              updatedAt: new Date()
            }
          }
        );

        return res.status(200).json({
          ok: true,
          message: "User approved."
        });
      }

      if (action === "deny") {
        await users.deleteOne({
          _id: new ObjectId(id)
        });

        return res.status(200).json({
          ok: true,
          message: "User denied."
        });
      }

      if (action === "makeAdmin") {
        await users.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              role: "ADMIN",
              approved: true,
              updatedAt: new Date()
            }
          }
        );

        return res.status(200).json({
          ok: true,
          message: "User made admin."
        });
      }

      if (action === "update") {
        const update = {
          updatedAt: new Date()
        };

        ["name", "username", "base", "role"].forEach(field => {
          if (body[field] !== undefined) {
            update[field] = String(body[field] || "").trim();
          }
        });

        if (body.approved !== undefined) update.approved = !!body.approved;
        if (body.active !== undefined) update.active = !!body.active;

        await users.updateOne(
          { _id: new ObjectId(id) },
          { $set: update }
        );

        return res.status(200).json({
          ok: true,
          message: "User updated."
        });
      }

      return res.status(400).json({
        ok: false,
        message: "Invalid action."
      });
    }

    if (req.method === "DELETE") {
      const id = String(req.query.id || "").trim();

      if (!id || !ObjectId.isValid(id)) {
        return res.status(400).json({
          ok: false,
          message: "Missing or invalid user id."
        });
      }

      await users.deleteOne({
        _id: new ObjectId(id)
      });

      return res.status(200).json({
        ok: true,
        message: "User deleted."
      });
    }

    return res.status(405).json({
      ok: false,
      message: "Method not allowed."
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: err.message
    });
  }
};
