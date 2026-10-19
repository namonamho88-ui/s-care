// Authentication failures are user-facing; never relay arbitrary upstream text.
const messages = new Map([
  [400, new Set([
    "아이디는 영문·숫자로 시작하는 3~60자의 영문·숫자·점·밑줄·하이픈입니다.",
    "비밀번호는 12~128자로 입력하세요.",
  ])],
  [401, new Set([
    "아이디 또는 인증 정보를 확인하세요. 반복 실패 시 15분 후 다시 시도하세요.",
    "로그인이 필요하거나 세션이 만료되었습니다.",
  ])],
  [403, new Set(["이 작업을 수행할 권한이 없습니다."])],
  [429, new Set(["로그인 요청이 많습니다. 잠시 후 다시 시도하세요."])],
]);
const defaults = new Map([
  [400, "아이디와 인증 정보를 확인하세요."],
  [401, "아이디 또는 인증 정보를 확인하세요. 반복 실패 시 15분 후 다시 시도하세요."],
  [403, "로그인 접근이 허용되지 않습니다."],
  [429, "로그인 요청이 많습니다. 잠시 후 다시 시도하세요."],
]);

/** @param {number} status @param {unknown} data */
export function sessionFailure(status, data) {
  if (!messages.has(status)) return {
    status: 503,
    body: {
      error: "로그인 서버를 준비 중이거나 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도하세요.",
      code: "AUTH_SERVICE_UNAVAILABLE",
    },
  };
  const error = data && typeof data === "object" && "error" in data ? data.error : undefined;
  return {
    status,
    body: { error: typeof error === "string" && messages.get(status).has(error) ? error : defaults.get(status) },
  };
}
