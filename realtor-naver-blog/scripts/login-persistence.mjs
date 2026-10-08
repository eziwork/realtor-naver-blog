const NAVER_COOKIE_URL = "https://naver.com";

export function hasNaverLoginCookie(cookies) {
  return cookies.some((cookie) => cookie.name === "NID_AUT");
}

export async function verifyLoginPersistence({
  activeContext,
  launchPersistentContext,
  profile,
  launchOptions,
  cookieUrl = NAVER_COOKIE_URL,
  settleMs = 1500
}) {
  if (settleMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, settleMs));
  }

  await activeContext.close();

  const verifyContext = await launchPersistentContext(profile, launchOptions);
  try {
    const cookies = await verifyContext.cookies(cookieUrl);
    return hasNaverLoginCookie(cookies);
  } finally {
    await verifyContext.close();
  }
}
