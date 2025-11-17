const panRegex = /\b\d{13,19}\b/g;
const emailRegex = /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

export const redact = (input: string): string => {
  return input
    .replace(panRegex, "****REDACTED****")
    .replace(emailRegex, (_, user: string, domain: string) => {
      const maskedUser = user.length <= 2 ? `${user[0]}*` : `${user[0]}***${user[user.length - 1]}`;
      return `${maskedUser}@${domain}`;
    });
};

export const redactObject = <T>(payload: T): T => {
  return JSON.parse(redact(JSON.stringify(payload))) as T;
};

