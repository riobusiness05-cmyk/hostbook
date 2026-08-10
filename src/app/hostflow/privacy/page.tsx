import Link from "next/link";
import { HostFlowLogo } from "@/components/HostFlowLogo";

export const metadata = {
  title: "Privacy Policy — Host Flow",
  description: "How Host Flow collects, uses, and protects data.",
};

const EFFECTIVE_DATE = "August 10, 2026";
const CONTACT_EMAIL = "support@hostflow.app";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-hf-line py-6 first:border-t-0 first:pt-0">
      <h2 className="font-display text-lg text-hf-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-hf-inkMuted">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="relative overflow-hidden">
      <div className="hf-blueprint pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_70%_50%_at_50%_0%,black,transparent)]" />

      <div className="relative mx-auto max-w-2xl px-6 py-12">
        <header className="mb-10 flex items-center justify-between">
          <Link href="/hostflow" className="flex items-center">
            <HostFlowLogo tone="onDark" size={26} />
          </Link>
          <Link href="/hostflow" className="text-xs text-hf-inkFaint hover:text-hf-ink">
            ← Back to Host Flow
          </Link>
        </header>

        <h1 className="font-display text-3xl text-hf-ink">Privacy Policy</h1>
        <p className="mt-2 text-sm text-hf-inkFaint">Effective {EFFECTIVE_DATE}</p>

        <p className="mt-6 text-sm leading-relaxed text-hf-inkMuted">
          This policy covers two kinds of people: restaurant staff who use the Host Flow dashboard, and diners who
          book a table through a Host Flow booking widget or a restaurant&apos;s Host Flow-powered booking page.
        </p>

        <div className="mt-4">
          <Section title="1. What we collect">
            <p>
              <span className="font-medium text-hf-ink">Restaurant accounts:</span> name, email, and a hashed
              password; your restaurant&apos;s name, address, hours, floor plan, and settings.
            </p>
            <p>
              <span className="font-medium text-hf-ink">Bookings:</span> when a diner books a table (through the
              dashboard, a restaurant&apos;s website widget, or the AI assistant), we collect the name, email, phone
              number, party size, date/time, and any notes (allergies, occasion, seating preference) submitted with
              that booking.
            </p>
            <p>
              <span className="font-medium text-hf-ink">Billing:</span> subscription status and plan details.
              Card numbers are never sent to or stored by Host Flow — they go directly to Stripe.
            </p>
          </Section>

          <Section title="2. How we use it">
            <p>
              To operate the Service: running your floor plan and reservations, sending booking confirmation
              emails, powering the AI host assistant and photo-based floor plan import, processing your
              subscription, and providing support.
            </p>
          </Section>

          <Section title="3. Who we share it with">
            <p>We don&apos;t sell personal data. We share it only with the service providers that make Host Flow work:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li><span className="font-medium text-hf-ink">Stripe</span> — payment processing and billing.</li>
              <li><span className="font-medium text-hf-ink">Resend</span> — sending booking confirmation and account emails.</li>
              <li>
                <span className="font-medium text-hf-ink">Anthropic</span> — powers the AI host assistant and
                floor-plan photo import; relevant floor/booking data or an uploaded photo is sent to Anthropic to
                generate a response.
              </li>
            </ul>
            <p>
              We may also disclose data if required by law, or to protect the rights, safety, or property of Host
              Flow, our users, or others.
            </p>
          </Section>

          <Section title="4. Cookies">
            <p>
              Host Flow uses a single session cookie to keep you signed in. We don&apos;t use advertising or
              cross-site tracking cookies.
            </p>
          </Section>

          <Section title="5. Data retention">
            <p>
              Account and reservation data is kept for as long as your account is active, so your history stays
              intact if you cancel and come back. You can request deletion of your restaurant&apos;s account and
              associated data at any time by contacting us below.
            </p>
          </Section>

          <Section title="6. Diner rights">
            <p>
              If you booked a table through a Host Flow-powered site, the restaurant you booked with controls that
              data. Every confirmation email includes a link to view or cancel your own booking. For anything else
              — correcting details or requesting deletion — contact the restaurant directly, or reach us at the
              email below and we&apos;ll help route it.
            </p>
          </Section>

          <Section title="7. Security">
            <p>
              We use reasonable technical measures (like password hashing and encrypted connections) to protect
              data, but no system is perfectly secure, and we can&apos;t guarantee absolute security.
            </p>
          </Section>

          <Section title="8. Children">
            <p>Host Flow isn&apos;t directed at children, and we don&apos;t knowingly collect data from children under 13.</p>
          </Section>

          <Section title="9. Changes to this policy">
            <p>
              We may update this policy from time to time. Material changes will be reflected by updating the
              effective date above.
            </p>
          </Section>

          <Section title="10. Contact">
            <p>
              Questions about this policy, or a data request? Reach us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-300 hover:text-brand-200">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
