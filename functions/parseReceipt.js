const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const EXPENSE_CATEGORIES = [
  "Inventory / Stock Purchase",
  "Shipping & Postage",
  "Packaging & Supplies",
  "Event / Tournament Fees",
  "Travel",
  "Marketing & Advertising",
  "Equipment",
  "Software & Subscriptions",
  "Rent / Storage",
  "Utilities",
  "Professional Services",
  "Other",
];

function buildPrompt(corrections) {
  let prompt = `You are an expert receipt parser. Analyze this receipt image and extract the following information as JSON. Be precise with numbers and dates.

Return ONLY valid JSON with these fields:
{
  "amount": <number — total amount paid, as a decimal number>,
  "currency": "<3-letter ISO currency code, e.g. EUR, USD, GBP>",
  "vendor": "<merchant or store name>",
  "date": "<date in YYYY-MM-DD format, or null if unreadable>",
  "category": "<best-fit category from this list: ${EXPENSE_CATEGORIES.join(", ")}>",
  "description": "<brief 3-8 word summary of the purchase>",
  "confidence": <number 0-1 representing how confident you are in the extraction>
}

Rules:
- Use the TOTAL amount (not subtotals or individual items).
- If the currency symbol is € use EUR, $ use USD, £ use GBP, ¥ use JPY, kr use SEK/NOK/DKK based on context.
- Pick the single best category from the provided list.
- If any field is truly unreadable, use null for that field.
- Return ONLY the JSON object, no markdown fences or explanation.`;

  if (corrections && corrections.length > 0) {
    const examples = corrections.slice(-15).map((c) => {
      const parts = [];
      if (c.ocrDescription && c.userDescription) {
        parts.push(`description "${c.ocrDescription}" -> "${c.userDescription}"`);
      }
      if (c.ocrCategory && c.userCategory) {
        parts.push(`category "${c.ocrCategory}" -> "${c.userCategory}"`);
      }
      if (c.ocrVendor && c.userVendor) {
        parts.push(`vendor "${c.ocrVendor}" -> "${c.userVendor}"`);
      }
      const vendor = c.vendor || c.userVendor || c.ocrVendor || "unknown";
      return `  - For "${vendor}": ${parts.join("; ")}`;
    }).filter((line) => line.includes("->"));

    if (examples.length > 0) {
      prompt += `\n\nIMPORTANT — User Preferences (learn from these past corrections to suggest better descriptions, categories, and vendor names):
${examples.join("\n")}
Adapt your suggestions to match the user's preferred style and vocabulary shown above.`;
    }
  }

  return prompt;
}

exports.parseReceipt = functions
  .runWith({ secrets: ["GEMINI_KEY"] })
  .https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Must be signed in to parse receipts."
    );
  }

  const { storagePath, corrections } = data;
  if (!storagePath) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "storagePath is required."
    );
  }

  const uid = context.auth.uid;
  if (!storagePath.startsWith(`expense_receipts/${uid}/`)) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "You can only parse your own receipts."
    );
  }

  const apiKey = process.env.GEMINI_KEY;
  if (!apiKey) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Gemini API key not configured. Run: firebase functions:secrets:set GEMINI_KEY"
    );
  }

  try {
    const bucket = admin.storage().bucket();
    const file = bucket.file(storagePath);
    const [fileBuffer] = await file.download();
    const [metadata] = await file.getMetadata();
    const mimeType = metadata.contentType || "image/jpeg";

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = buildPrompt(Array.isArray(corrections) ? corrections : undefined);

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: fileBuffer.toString("base64"),
          mimeType,
        },
      },
    ]);

    const responseText = result.response.text().trim();

    let parsed;
    try {
      const cleaned = responseText.replace(/^```json?\n?|\n?```$/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new functions.https.HttpsError(
        "internal",
        "Failed to parse Gemini response as JSON."
      );
    }

    return {
      amount: parsed.amount ?? null,
      currency: parsed.currency ?? "EUR",
      vendor: parsed.vendor ?? null,
      date: parsed.date ?? null,
      category: parsed.category ?? "Other",
      description: parsed.description ?? null,
      confidence: parsed.confidence ?? 0,
    };
  } catch (err) {
    if (err instanceof functions.https.HttpsError) throw err;
    console.error("parseReceipt error:", err);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to process receipt image."
    );
  }
});
