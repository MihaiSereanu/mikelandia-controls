import { readFile } from "node:fs/promises";
import { resolve, relative, isAbsolute, extname } from "node:path";

// Installed Foundry code is served locally for fixtures, never copied or shipped.
export async function serveNativeEditorAsset(pathname, response, app) {
  if (pathname.startsWith("/native-editor-package/")) {
    const name = decodeURIComponent(pathname.slice("/native-editor-package/".length));
    if (!/^(?:@[a-z0-9-]+\/)?[a-z0-9-]+$/u.test(name)) throw new Error("Invalid native package");
    const info = JSON.parse(await readFile(resolve(app, "node_modules", name, "package.json"), "utf8"));
    const entry = info.module ?? info.exports?.["."]?.import ?? info.exports?.import;
    if (typeof entry !== "string") throw new Error(`No ESM entry for ${name}`);
    response.writeHead(302, { Location: `/native-editor/node_modules/${name}/${entry.replace(/^\.\//u, "")}` }).end();
    return true;
  }
  if (!pathname.startsWith("/native-editor/")) return false;
  const requested = decodeURIComponent(pathname.slice("/native-editor/".length));
  const path = resolve(app, requested), rel = relative(app, path).replaceAll("\\", "/");
  if (rel.startsWith("..") || isAbsolute(rel) || ![".js", ".mjs"].includes(extname(path))
    || !(rel.startsWith("common/") || rel.startsWith("node_modules/")
      || ["client/applications/ux/prosemirror-editor.mjs", "client/helpers/hooks.mjs"].includes(rel))) {
    throw new Error("Invalid native editor source");
  }
  const source = await readFile(path, "utf8");
  const rewrite = (_match, prefix, quote, name) => `${prefix}${quote}/native-editor-package/${encodeURIComponent(name)}${quote}`;
  const content = source.replace(/(\bfrom\s*|\bimport\s*)(["'])([^./"'][^"']*)\2/gu, rewrite);
  response.writeHead(200, { "Content-Type": "text/javascript" }).end(content);
  return true;
}
