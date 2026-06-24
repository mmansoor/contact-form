export function matchSiteByOrigin(config, originValue) {
  if (!originValue) {
    return null;
  }

  let origin;
  try {
    origin = new URL(originValue);
  } catch {
    return null;
  }

  const isLocalHost = origin.hostname === 'localhost' || origin.hostname === '127.0.0.1';
  if (!isLocalHost && origin.protocol !== 'https:') {
    return null;
  }

  const originString = origin.origin;

  for (const site of config.sites) {
    if (site.enabled === false) {
      continue;
    }

    for (const rule of site.originRules) {
      if (rule.type === 'exact' && rule.value === originString) {
        return site;
      }

      if (rule.type === 'regex' && rule._regex && rule._regex.test(originString)) {
        return site;
      }
    }
  }

  return null;
}
