import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [
    { title: "Privacy Policy — Virtual Try-On" },
    { name: "description", content: "How Virtual Try-On handles your account, uploaded photos, generated images, and deletion requests." },
    { property: "og:title", content: "Privacy Policy — Virtual Try-On" },
    { property: "og:description", content: "Our photo retention, AI processing, and privacy practices." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return <LegalPage title="Privacy Policy">
    <section><h2>Who we are</h2><p>Virtual Try-On lets anyone preview clothing on a subject and create styled versions of their images. Contact us at <a href="mailto:rielsites@gmail.com">rielsites@gmail.com</a> about your personal data.</p></section>
    <section><h2>Information we handle</h2><ul>
      <li>Account details such as your email address, name if provided, and account role.</li>
      <li>Photos you upload, clothing images, generation instructions, and generated try-on or styled images.</li>
      <li>Token balances, generation history, payment submissions, sender phone numbers, and transaction references.</li>
      <li>Technical information needed to operate the service, including error reports and generation activity. Country or language information may be used to display estimated local-currency prices.</li>
    </ul></section>
    <section><h2>How information is used</h2><p>We use this information to create your requested images, save your results, manage your account and tokens, verify manual payments, respond to support requests, and diagnose service problems. Authorized administrators can access records needed for these purposes.</p></section>
    <section><h2>AI processing and service providers</h2><p>Your submitted images and instructions are sent to AI service providers to generate the results you request. Hosting, account, and storage providers also process information needed to run the app. These providers may process information outside your country. Do not upload sensitive documents or images you are not comfortable submitting for AI processing.</p><p className="mt-3">We do not sell your uploaded photos. This policy does not promise that external AI providers have zero retention or never use data for model training; their applicable terms govern their processing.</p></section>
    <section><h2>Retention and deletion</h2><p>Uploaded photos and generated images are kept until you request their deletion; there is no automatic 30- or 90-day expiry. To delete your images or account data, email <a href="mailto:rielsites@gmail.com?subject=Photo%20or%20account%20deletion">rielsites@gmail.com</a> from your account email and identify the images or account you want deleted. We may verify ownership before acting.</p><p className="mt-3">Payment and security records may need to be retained to handle disputes, prevent abuse, or meet legal obligations. Deletion from backups or external providers may not be immediate.</p></section>
    <section><h2>Your choices and image safety</h2><p>Upload only images you own or have permission to use, including the subject's consent. Browser session storage keeps you signed in. You can sign out at any time and contact us to request access, correction, or deletion of your data. Watermarks and viewing restrictions cannot prevent screenshots or guarantee that an image cannot be copied.</p></section>
    <section><h2>Contact and updates</h2><p>For privacy concerns, email <a href="mailto:rielsites@gmail.com">rielsites@gmail.com</a>. Material changes will be reflected in this page's update date. Payment and usage conditions are in our <Link to="/terms">Terms of Service</Link>.</p></section>
  </LegalPage>;
}