export function getHighResolutionStoryImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.hostname === "ichef.bbci.co.uk") {
      url.pathname = url.pathname.replace(/\/ace\/standard\/\d+\//, "/ace/standard/976/");
    } else if (/^images\d*\.thanhnien\.vn$/i.test(url.hostname)) {
      url.pathname = url.pathname.replace(/\/zoom\/\d+_\d+\//, "/zoom/1200_630/");
    }
    return url.toString();
  } catch {
    return null;
  }
}
