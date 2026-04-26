const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const CARD_SCAN_MODELS = [
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-2.5-flash",
];

const CARD_SCAN_PROMPT = `You are an expert Pokemon TCG card identifier. Analyze this photo and identify every visible Pokemon card.

Return ONLY valid JSON with this structure:
{
  "cards": [
    {
      "name": "<English card name, e.g. 'Charizard ex', 'Pikachu VMAX', 'Eevee & Snorlax GX'>",
      "setName": "<set name in English if known, e.g. 'CoroCoro Comics', 'SM Black Star Promos', 'Team Up', or null>",
      "collectorNumber": "<collector number, e.g. '006/198', 'SM169', '#151', or null>",
      "rarity": "<rarity if visible: Common, Uncommon, Rare, Ultra Rare, Secret Rare, Promo, or null>",
      "language": "<card language: 'EN', 'JP', 'KR', 'CN', 'FR', 'DE', 'ES', 'IT', 'PT'>",
      "isGraded": false,
      "gradingCompany": null,
      "grade": null,
      "confidence": 0.95
    }
  ],
  "totalDetected": 1
}

CRITICAL — Graded/Slabbed Cards:
Graded cards are encased in hard plastic slabs with a LABEL at the top. The label is THE MOST RELIABLE source of information. For graded cards:
1. READ THE LABEL FIRST. PSA labels contain: year, card description, set name, card number, cert number, and grade.
   Example PSA label: "2001 P.M. JAPANESE PROMO | COROCORO COMICS - HOLO | #151 | MINT 9"
   → name: "Mew", setName: "CoroCoro Comics", collectorNumber: "#151", grade: "9", gradingCompany: "PSA"
2. The label text is in ENGLISH even for Japanese/foreign cards. Always use the English name from the label.
3. CGC labels show: card name, set, number, grade. BGS labels show similar info.
4. Set isGraded: true, gradingCompany to the company name, and grade to the numeric grade.
5. Look for company logos: PSA (red label), CGC (blue/green label), BGS (gold/silver label).

For Tag Team GX cards: the label often says two Pokemon names like "EEVEE & SNORLAX GX" — use the full name including both Pokemon and the GX suffix.

Rules:
- Identify EVERY distinct card visible in the image. Do not skip cards.
- Include suffixes like "ex", "EX", "V", "VMAX", "VSTAR", "GX", "Tag Team GX", etc.
- For ungraded cards: read the name from the card face, collector number from the bottom.
- For Japanese ungraded cards: transliterate the name to English (e.g. ミュウ → Mew, リザードン → Charizard).
- Confidence: 0.9+ when text is clearly readable, 0.5-0.9 for partially obscured, below 0.5 for guesses.
- Do NOT invent names. Only report what you can read from the card or its grading label.
- Return ONLY the JSON object, no markdown fences or explanation.`;

exports.parseCardPhoto = functions
  .runWith({ timeoutSeconds: 60, memory: "512MB", secrets: ["GEMINI_KEY"] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be signed in to scan cards."
      );
    }

    const { storagePath, imageBase64, mimeType: clientMimeType } = data;

    if (!storagePath && !imageBase64) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Either storagePath or imageBase64 is required."
      );
    }

    const uid = context.auth.uid;
    if (storagePath && !storagePath.startsWith(`card_scans/${uid}/`)) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "You can only scan your own card photos."
      );
    }

    const apiKey = process.env.GEMINI_KEY;
    if (!apiKey) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        'Gemini API key not configured. Run: firebase functions:secrets:set GEMINI_KEY'
      );
    }

    try {
      let imageData;
      let mimeType;

      if (imageBase64) {
        imageData = imageBase64;
        mimeType = clientMimeType || "image/jpeg";
      } else {
        const bucket = admin.storage().bucket();
        const file = bucket.file(storagePath);
        const [fileBuffer] = await file.download();
        const [metadata] = await file.getMetadata();
        imageData = fileBuffer.toString("base64");
        mimeType = metadata.contentType || "image/jpeg";
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      let result = null;
      const quotaErrors = [];

      for (const modelName of CARD_SCAN_MODELS) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName });
          result = await model.generateContent([
            CARD_SCAN_PROMPT,
            {
              inlineData: {
                data: imageData,
                mimeType,
              },
            },
          ]);
          break;
        } catch (modelErr) {
          if ([400, 404, 429].includes(modelErr?.status)) {
            quotaErrors.push(`${modelName}: ${modelErr.message}`);
            console.warn(`Gemini model ${modelName} unavailable or quota-limited; trying fallback model.`);
            continue;
          }
          throw modelErr;
        }
      }

      if (!result) {
        console.error("All Gemini card scan models exhausted:", quotaErrors);
        throw new functions.https.HttpsError(
          "resource-exhausted",
          "AI card scanning quota is temporarily exhausted. Please try again later."
        );
      }

      const responseText = result.response.text().trim();

      let parsed;
      try {
        const cleaned = responseText
          .replace(/^```json?\n?|\n?```$/g, "")
          .trim();
        parsed = JSON.parse(cleaned);
      } catch {
        throw new functions.https.HttpsError(
          "internal",
          "Failed to parse Gemini response as JSON."
        );
      }

      const cards = Array.isArray(parsed.cards) ? parsed.cards : [];
      const sanitized = cards.map((c) => ({
        name: c.name || null,
        setName: c.setName || null,
        collectorNumber: c.collectorNumber || null,
        rarity: c.rarity || null,
        language: c.language || "EN",
        isGraded: !!c.isGraded,
        gradingCompany: c.gradingCompany || null,
        grade: c.grade != null ? String(c.grade) : null,
        confidence: typeof c.confidence === "number" ? c.confidence : 0.5,
      }));

      return {
        cards: sanitized,
        totalDetected: sanitized.length,
      };
    } catch (err) {
      if (err instanceof functions.https.HttpsError) throw err;
      console.error("parseCardPhoto error:", err);
      if (err?.status === 429) {
        throw new functions.https.HttpsError(
          "resource-exhausted",
          "AI card scanning quota is temporarily exhausted. Please try again later."
        );
      }
      throw new functions.https.HttpsError(
        "internal",
        "Failed to process card photo."
      );
    }
  });
