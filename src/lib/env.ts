function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

export const env = {
  WHATSAPP_VERIFY_TOKEN: () => required("WHATSAPP_VERIFY_TOKEN"),
  WHATSAPP_ACCESS_TOKEN: () => required("WHATSAPP_ACCESS_TOKEN"),
  WHATSAPP_PHONE_NUMBER_ID: () => required("WHATSAPP_PHONE_NUMBER_ID"),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: () => required("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: () =>
    required("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n"),
  GOOGLE_SHEET_ID: () => required("GOOGLE_SHEET_ID"),
  WHATSAPP_OWNER_NUMBER: () => required("WHATSAPP_OWNER_NUMBER"),
  CRON_SECRET: () => required("CRON_SECRET"),
};
