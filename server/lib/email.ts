// 📧 Email anuppa (Resend: free plan, https://resend.com)
// .env la RESEND_API_KEY + EMAIL_FROM irundhaa unmaiyaana email.
// Illana "dev mode": email ah server terminal la print pannum (link ah copy panni test pannalaam)

export interface Email {
  to: string;
  subject: string;
  text: string;
}

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export const devOutbox: Email[] = []; // 🧪 dev mode la anuppuna emails (tests paakkum)

export async function sendEmail({ to, subject, text }: Email): Promise<{ sent: boolean; dev?: boolean }> {
  if (!emailEnabled()) {
    devOutbox.push({ to, subject, text });
    if (devOutbox.length > 20) devOutbox.shift();
    console.log(`\n📧 [DEV EMAIL] To: ${to}\n   Subject: ${subject}\n   ${text.replaceAll('\n', '\n   ')}\n`);
    return { sent: false, dev: true };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, text }),
    });
    if (!res.ok) {
      console.log('⚠️ Email fail aachu:', res.status, await res.text().catch(() => ''));
      return { sent: false };
    }
    return { sent: true };
  } catch (err) {
    console.log('⚠️ Email server ku connect aagala:', (err as Error).message);
    return { sent: false };
  }
}
