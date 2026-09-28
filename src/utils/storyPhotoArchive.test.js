import { describe, expect, it } from "vitest";
import { createStoryPhotoArchive } from "./storyPhotoArchive";

async function readArchive(blob) {
  const buffer = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  const locals = [];
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const dataOffset = offset + 30 + nameLength;
    locals.push({
      offset,
      name: decoder.decode(new Uint8Array(buffer, offset + 30, nameLength)),
      flags: view.getUint16(offset + 6, true),
      compression: view.getUint16(offset + 8, true),
      crc: view.getUint32(offset + 14, true),
      data: new Uint8Array(buffer, dataOffset, size),
    });
    offset = dataOffset + size;
  }
  const centralOffset = offset;
  const central = [];
  while (view.getUint32(offset, true) === 0x02014b50) {
    const nameLength = view.getUint16(offset + 28, true);
    central.push({
      name: decoder.decode(new Uint8Array(buffer, offset + 46, nameLength)),
      offset: view.getUint32(offset + 42, true),
      crc: view.getUint32(offset + 16, true),
      flags: view.getUint16(offset + 8, true),
    });
    offset += 46 + nameLength;
  }
  return {
    locals,
    central,
    centralOffset,
    endSignature: view.getUint32(offset, true),
    entryCount: view.getUint16(offset + 10, true),
    centralSize: view.getUint32(offset + 12, true),
    recordedCentralOffset: view.getUint32(offset + 16, true),
    endOffset: offset,
  };
}

describe("story photo ZIP downloads", () => {
  it("writes valid ZIP records with known CRC32, unchanged bytes, and matching directory offsets", async () => {
    const files = [
      new File(["123456789"], "photo.png"),
      new File([new Uint8Array([0, 255, 1, 128])], "second.png"),
    ];
    const blob = await createStoryPhotoArchive(files);
    const archive = await readArchive(blob);
    expect(blob.type).toBe("application/zip");
    expect(archive.locals[0].crc).toBe(0xcbf43926);
    expect(Array.from(archive.locals[1].data)).toEqual([0, 255, 1, 128]);
    expect(
      archive.locals.every(
        (entry) => entry.compression === 0 && entry.flags === 0x0800,
      ),
    ).toBe(true);
    expect(archive.central).toEqual(
      archive.locals.map(({ name, offset, crc, flags }) => ({
        name,
        offset,
        crc,
        flags,
      })),
    );
    expect(archive.endSignature).toBe(0x06054b50);
    expect(archive.entryCount).toBe(2);
    expect(archive.recordedCentralOffset).toBe(archive.centralOffset);
    expect(archive.centralSize).toBe(archive.endOffset - archive.centralOffset);
    expect(blob.size).toBe(archive.endOffset + 22);
  });

  it("preserves UTF-8 names and avoids duplicates on case-insensitive filesystems", async () => {
    const names = [
      "Pokémon €10.png",
      "Pokémon €10.png",
      "POKÉMON €10.PNG",
      "Pokémon €10 (2).png",
      "ピカチュウ.png",
    ];
    const archive = await readArchive(
      await createStoryPhotoArchive(
        names.map((name) => new File(["photo"], name)),
      ),
    );
    expect(archive.locals.map((entry) => entry.name)).toEqual([
      "Pokémon €10.png",
      "Pokémon €10 (2).png",
      "POKÉMON €10 (3).PNG",
      "Pokémon €10 (2) (2).png",
      "ピカチュウ.png",
    ]);
  });

  it("keeps all files at the root of the ZIP with extractable filenames", async () => {
    const names = [
      "../../my-photo.png",
      "folder\\second.png",
      "CON.png",
      "..",
      "bad:name?.png",
    ];
    const archive = await readArchive(
      await createStoryPhotoArchive(
        names.map((name) => new File(["photo"], name)),
      ),
    );
    expect(archive.locals.map((entry) => entry.name)).toEqual([
      "my-photo.png",
      "second.png",
      "_CON.png",
      "photo-4.png",
      "bad_name_.png",
    ]);
  });

  it("rejects empty, invalid, and excessive batches before constructing an archive", async () => {
    await expect(createStoryPhotoArchive([])).rejects.toThrow("at least one");
    await expect(createStoryPhotoArchive([null])).rejects.toThrow(
      "could not be included",
    );
    await expect(
      createStoryPhotoArchive(Array(21).fill(new File(["photo"], "photo.png"))),
    ).rejects.toThrow("20 photos");
  });
});
