// Outgoing email. The app runs locally with no mail provider, so messages are printed to the
// server console (the terminal running `npm run dev`). Swap `deliver` for a real provider
// (Resend, Postmark, SES, ...) when the app is hosted; callers don't change.
import { APP_NAME } from "./brand";

interface Message {
  to: string;
  subject: string;
  text: string;
}

async function deliver(message: Message) {
  const rule = "-".repeat(72);
  console.log(`\n${rule}\nEMAIL to ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n${rule}\n`);
}

/** `change`: confirming a new address for an existing account; otherwise confirming the sign-up email. */
export async function sendVerificationEmail(to: string, name: string, link: string, hours: number, change: boolean) {
  await deliver({
    to,
    subject: change ? `Confirm your new ${APP_NAME} email` : `Confirm your email for ${APP_NAME}`,
    text: [
      `Hi ${name},`,
      "",
      change
        ? `You asked to change the email for your ${APP_NAME} account to this address. Open this link within ${hours} hours to confirm it:`
        : `Open this link within ${hours} hours to confirm this is your email address:`,
      "",
      link,
      "",
      change
        ? "Until you confirm, you keep signing in with your current email. If this wasn't you, ignore this email."
        : `If you didn't create a ${APP_NAME} account, ignore this email.`,
    ].join("\n"),
  });
}

export async function sendPasswordResetEmail(to: string, name: string, link: string, minutes: number) {
  await deliver({
    to,
    subject: `Reset your ${APP_NAME} password`,
    text: [
      `Hi ${name},`,
      "",
      `Someone asked to reset the password for your ${APP_NAME} account.`,
      `Open this link within ${minutes} minutes to choose a new one:`,
      "",
      link,
      "",
      "If this wasn't you, ignore this email. Your password stays the same.",
    ].join("\n"),
  });
}
