import { redirect } from "next/navigation";

// No landing page yet — send visitors straight to the docs.
export default function HomePage() {
	redirect("/docs");
}
