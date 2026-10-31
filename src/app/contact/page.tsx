import ContactClient from "@/components/ContactClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact — Sahayak AI",
  description: "Get in touch with the Sahayak AI team.",
};

export default function ContactPage() {
  return <ContactClient />;
}
