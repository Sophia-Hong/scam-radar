export function accountIdOf(platform: string, handle: string) {
  return `${platform}:${handle.replace(/^@/, "").toLowerCase()}`;
}
