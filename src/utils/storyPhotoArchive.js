const MAX_FILES = 20;
const ZIP32_LIMIT = 0xffffffff;
const UTF8_FLAG = 0x0800;
const CRC_TABLE = new Uint32Array(256);

for (let index = 0; index < CRC_TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1)
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  CRC_TABLE[index] = value >>> 0;
}

function crc32(bytes) {
  let crc = ZIP32_LIMIT;
  for (let index = 0; index < bytes.length; index += 1)
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  return (crc ^ ZIP32_LIMIT) >>> 0;
}

function readFile(file) {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () =>
      reject(
        new Error(`Could not read ${file.name || "a photo"} for the download.`),
      );
    reader.onabort = () =>
      reject(new Error("The photo download was interrupted."));
    reader.readAsArrayBuffer(file);
  });
}

function uniqueName(file, index, usedNames) {
  const basename = String(file.name || "")
    .replaceAll("\\", "/")
    .split("/")
    .pop();
  // Keep ZIP entries flat and safe to extract on Windows, macOS, and Linux.
  const withoutControls = Array.from(basename.normalize("NFC"), (character) =>
    character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
      ? "_"
      : character,
  ).join("");
  const cleaned = withoutControls
    .replace(/[<>:"|?*]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim();
  let name = cleaned || `photo-${index + 1}.png`;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))
    name = `_${name}`;
  const extensionAt = name.lastIndexOf(".");
  const stem = extensionAt > 0 ? name.slice(0, extensionAt) : name;
  const extension = extensionAt > 0 ? name.slice(extensionAt) : "";
  let result = name;
  for (let suffix = 2; usedNames.has(result.toLowerCase()); suffix += 1)
    result = `${stem} (${suffix})${extension}`;
  usedNames.add(result.toLowerCase());
  return result;
}

function zipDate(lastModified) {
  const source = new Date(
    Number.isFinite(lastModified) ? lastModified : Date.now(),
  );
  const date =
    source.getFullYear() < 1980
      ? new Date(1980, 0, 1)
      : source.getFullYear() > 2107
        ? new Date(2107, 11, 31, 23, 59, 58)
        : source;
  return {
    date:
      ((date.getFullYear() - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate(),
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      (date.getSeconds() >> 1),
  };
}

function entryHeader(nameBytes, size, checksum, modified, offset, central) {
  const fixedSize = central ? 46 : 30;
  const bytes = new Uint8Array(fixedSize + nameBytes.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, central ? 0x02014b50 : 0x04034b50, true);
  view.setUint16(4, 20, true);
  if (central) view.setUint16(6, 20, true);
  const shift = central ? 2 : 0;
  view.setUint16(6 + shift, UTF8_FLAG, true);
  view.setUint16(10 + shift, modified.time, true);
  view.setUint16(12 + shift, modified.date, true);
  view.setUint32(14 + shift, checksum, true);
  view.setUint32(18 + shift, size, true);
  view.setUint32(22 + shift, size, true);
  view.setUint16(26 + shift, nameBytes.length, true);
  if (central) view.setUint32(42, offset, true);
  bytes.set(nameBytes, fixedSize);
  return bytes;
}

/** Build one browser-downloadable archive without recompressing the PNG photos. */
export async function createStoryPhotoArchive(files) {
  if (!Array.isArray(files) || files.length === 0)
    throw new Error("Choose at least one photo to download.");
  if (files.length > MAX_FILES)
    throw new Error("Download up to 20 photos at a time.");
  const parts = [];
  const centralEntries = [];
  const usedNames = new Set();
  const encoder = new TextEncoder();
  let offset = 0;
  let centralSize = 0;

  for (const [index, file] of files.entries()) {
    if (!(file instanceof Blob))
      throw new Error(
        "One of the photos could not be included in the download.",
      );
    const nameBytes = encoder.encode(uniqueName(file, index, usedNames));
    if (nameBytes.length > 65535)
      throw new Error(
        "A photo filename is too long. Rename the photo and try again.",
      );
    if (
      file.size > ZIP32_LIMIT ||
      offset + file.size + nameBytes.length + 30 > ZIP32_LIMIT
    ) {
      throw new Error(
        "These photos are too large for one ZIP. Download fewer photos at a time.",
      );
    }
    const bytes = new Uint8Array(await readFile(file));
    const checksum = crc32(bytes);
    const modified = zipDate(file.lastModified);
    const header = entryHeader(
      nameBytes,
      bytes.length,
      checksum,
      modified,
      offset,
      false,
    );
    const central = entryHeader(
      nameBytes,
      bytes.length,
      checksum,
      modified,
      offset,
      true,
    );
    parts.push(header, bytes);
    centralEntries.push(central);
    offset += header.length + bytes.length;
    centralSize += central.length;
  }

  if (offset + centralSize + 22 > ZIP32_LIMIT)
    throw new Error(
      "These photos are too large for one ZIP. Download fewer photos at a time.",
    );
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, files.length, true);
  view.setUint16(10, files.length, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, offset, true);
  return new Blob([...parts, ...centralEntries, end], {
    type: "application/zip",
  });
}
