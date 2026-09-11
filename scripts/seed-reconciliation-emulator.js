import { createRequire } from "node:module";
import { parseReconciliationCSV } from "../src/utils/reconciliation.js";
const require = createRequire(new URL("../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080") throw new Error("This fixture only runs against the local demo emulator.");
admin.initializeApp({ projectId: "demo-rafchu-review" });
const db = admin.firestore();
const uid = "review-vendor";
const csv = "TransferWise ID,Date,Amount,Currency,Description,Payment Reference\nDEMO-1,15/06/2026,100,EUR,Sample collector,Pikachu and Eevee\nDEMO-2,15/06/2026,180,EUR,Sample collector,Pikachu and Eevee balance\nDEMO-3,16/06/2026,-75,EUR,Sample venue,Show table";
for (const source of await parseReconciliationCSV(csv, { filename: "synthetic-demo.csv" })) {
  const ref = db.doc(`reconciliation_sources/${uid}/entries/${source.id}`);
  if (!(await ref.get()).exists) await ref.set({ ...source, importedAt: admin.firestore.FieldValue.serverTimestamp() });
}
for (const [id, name, amount] of [["demo-pikachu", "Pikachu", 120], ["demo-eevee", "Eevee", 180]]) {
  const ref = db.doc(`transactions/${uid}/entries/${id}`);
  if (!(await ref.get()).exists) await ref.set({ type: "sale", currency: "EUR", ts: Date.parse("2026-06-15"), totalValue: amount,
    counterparty: { name: "Sample collector" }, itemsOut: [{ name, quantity: 1, unitPrice: amount, totalPrice: amount, costBasis: 40 }],
  });
}
console.log("Seeded synthetic split payments and a discounted two-card deal. Existing records were preserved.");
await db.terminate();
