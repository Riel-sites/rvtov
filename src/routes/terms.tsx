import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";
import { LAUNCH_POLICIES } from "@/lib/launch-policies";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [
    { title: "Terms of Service — Virtual Try-On" },
    { name: "description", content: "Virtual Try-On usage conditions, manual MoMo payments, tokens, download access, and error-only refunds." },
    { property: "og:title", content: "Terms of Service — Virtual Try-On" },
    { property: "og:description", content: "Payment confirmation, image use, and refund conditions for Virtual Try-On." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: TermsPage,
});

function TermsPage() {
  return <LegalPage title="Terms of Service">
    <section><h2>Using Virtual Try-On</h2><p>These terms apply when you use Virtual Try-On. The app is for anyone who wants to fit clothing on a subject, whether for personal use, creative work, or a business. Keep your sign-in details secure and do not use the service for unlawful, deceptive, abusive, or non-consensual content.</p></section>
    <section><h2>Your images and AI results</h2><p>You must have permission to use the clothing images and subject photos you submit. You retain your rights in your uploads and permit us and our service providers to process them to deliver the service. AI images are visual interpretations, not a guarantee of physical fit, garment accuracy, identity preservation, or suitability for purchase. Review results before using or sharing them.</p></section>
    <section><h2>Tokens and generation</h2><p>New accounts receive 5 starter tokens. A completed try-on costs 1 token; standard styling costs 1 token and high-resolution editorial styling costs 2 tokens. The selected cost is shown before generation. Failed generations should not cost tokens. Tokens do not expire. If a failed request deducts tokens or a balance is incorrect, contact support for correction.</p></section>
    <section><h2>Manual payments and confirmation</h2><p>Payments are handled manually, not through automatic checkout. Send MoMo payments to <strong className="text-foreground">0209765822 (David A. Hammond)</strong>, using your account email as the reference, then submit the sender phone number and transaction ID in the app.</p><p className="mt-3">Our payment-confirmation target is within {LAUNCH_POLICIES.paymentConfirmationMinutes} minutes after you submit correct details and the transfer can be verified. Tokens or download access are added after confirmation, not simply after submitting a request. Delayed transfers or details requiring correction can take longer; contact support if confirmation is late.</p><p className="mt-3">Prices are set in USD. Local-currency amounts are indicative conversions and may vary with exchange rates. Your mobile-money provider may charge separate fees.</p></section>
    <section><h2>Downloads</h2><p>Free-trial image downloads cost $0.50 USD per image and unlock after payment approval. An approved token pack unlocks downloads without a separate per-image payment. Preview images may carry a watermark and viewing restrictions. Administrators are exempt from these restrictions.</p></section>
    <section><h2>Refunds and errors</h2><p>Purchases are non-refundable except for errors. Unused tokens or a change of mind do not qualify for a refund. If a payment was duplicated, charged incorrectly, or access was not supplied because of an error, email <a href="mailto:rielsites@gmail.com?subject=Payment%20error">rielsites@gmail.com</a> with your account email and transaction reference so we can investigate and correct the error or arrange an applicable refund. Do not send your password or MoMo PIN.</p></section>
    <section><h2>Availability and support</h2><p>Generation and service availability depend on network and AI providers, and results are not guaranteed to meet every expectation. Nothing in these terms removes rights you have under applicable law. For payment or account help, email <a href="mailto:rielsites@gmail.com">rielsites@gmail.com</a> or message <a href="https://wa.me/233209765822" target="_blank" rel="noopener noreferrer">WhatsApp support</a>. See our <Link to="/privacy">Privacy Policy</Link> for retention and deletion requests.</p></section>
  </LegalPage>;
}