export const encodeCursor = (ts: string, id: string) => Buffer.from(`${ts}|${id}`).toString("base64");

export const decodeCursor = (cursor: string) => {
  const [ts, id] = Buffer.from(cursor, "base64").toString("utf-8").split("|");
  return { ts: ts ?? "", id: id ?? "" };
};

