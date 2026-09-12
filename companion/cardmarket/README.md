# Rafchu Cardmarket Companion 0.2.2

Build with `npm run build:cardmarket`. In Chrome Extensions, Load unpacked:
`public/cardmarket-companion` (this folder contains manifest.json).
After updating or reloading the extension, refresh Rafchu and any existing
Cardmarket reader tab so both pages connect to the new companion version.
This separate pilot preserves the working CardLadder companion installation.
It reads public Cardmarket Pokémon product pages. No cookies, credentials,
private APIs, purchases, seller messages, or Cardmarket inventory writes.

In Rafchu Inventory, open Cardmarket Sync. Verified catalogue links and existing
inventory links are suggested automatically. Click Suggest product links to search
Cardmarket for additional cards; the companion selects the matching expansion and
checks names and collector numbers, including Japanese expansion aliases.
Review the suggested URL or replace it. Your edited URLs and saved matches take
precedence over later suggestions. Finding a link never confirms or saves a match.
Confirm the product and its exact
language, condition, reverse status and edition for each ungraded card. Your
existing TCGplayer → Cardmarket condition mapping supplies the suggested condition.
Capture linked cards. Completed offers appear automatically as each card finishes.
You can also use Review latest offers to reopen them. Choose an individual offer and
leave Include checked. Professional/Powerseller/Private labels and country are
shown. The product reference image is shown with a warning that the pictured
variant may differ. Seller-provided scans appear beside their offers and can be
opened full size. Image URLs stay with the pricing evidence; existing inventory
images are preserved. A Professional and Powerseller only display filter is available.

Manual selling prices remain unless the user checks the explicit replacement
option. There is no automatic pricing, guessed variant match, or invented sale
history. Estimates are EUR asking prices excluding shipping. No matching offers
means no update. The chosen offer's evidence and seller type are retained.

Cardmarket may display a verification screen. Complete it in the visible reader
tab using Open Cardmarket reader, then click Resume capture in Rafchu. The queue
pauses with a clear message and keeps completed cards. Resuming reuses the same
reader tab without navigating away from a completed verification. A Chrome worker
restart also preserves the queue. Stop capture cancels the remaining cards while
keeping completed offers available. No verification bypass is attempted.
Reports expire after 24 hours. Changes to an inventory card's tags, language,
condition, name, set, number or grading invalidate the old product binding.
Sealed, signed, stamped and Poké/Master Ball variants need more precise support
and are held for review in this pilot.
