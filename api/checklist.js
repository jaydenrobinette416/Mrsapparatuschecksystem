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

  const possibleUnits = [
    cleanUnit,
    `${cleanBase} ${cleanUnit}`
  ];

  const items = await db.collection("checkItems")
    .find({
      base: cleanBase,
      unit: { $in: possibleUnits },
      active: true
    })
    .sort({ order: 1 })
    .toArray();

  return res.status(200).json({
    ok: true,
    items
  });
}
